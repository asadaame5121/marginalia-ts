import { assertEquals, assertRejects } from "@std/assert";
import { JSDOM } from "jsdom";
import {
  IndieAuthBrowserStorage,
  IndieAuthClient,
  IndieAuthMemoryStorage,
} from "../src/core/indieauth.ts";
import { createMarginalia } from "../src/index.ts";
import { startIndieAuthMockApi } from "./fixtures/indieauth_mock_api.ts";

for (const kind of ["html", "header"]) {
  Deno.test(`IndieAuth HTTP - ${kind} discovery, authorization redirect and PKCE exchange after reload`, async () => {
    const api = startIndieAuthMockApi();
    try {
      const storage = new IndieAuthMemoryStorage();
      const options = {
        clientId: api.siteOrigin,
        redirectUri: api.redirectUri,
        storage,
      };
      // Use native fetch throughout: requests reach a real local HTTP server.
      const client = new IndieAuthClient(options);
      const me = `${api.origin}/profile/${kind}`;
      const callback = await api.authorize(await client.startAuth(me));
      const reloaded = new IndieAuthClient({
        ...options,
        redirectUri: callback.href,
      });
      assertEquals(await reloaded.handleRedirect(callback.href), true);
      assertEquals(reloaded.getUser()?.me, me);
      assertEquals(reloaded.getUser()?.name, "Mock Alice");
      assertEquals(storage.getAuthState(), null);
      assertEquals(api.requests, [
        `GET /profile/${kind}`,
        "GET /authorize",
        "POST /token",
      ]);
      assertEquals(await reloaded.handleRedirect(callback.href), false);
      assertEquals(
        api.requests.filter((request) => request === "POST /token").length,
        1,
      );
      reloaded.signOut();
      assertEquals(reloaded.getUser(), null);
    } finally {
      await api.close();
    }
  });
}

Deno.test("IndieAuth HTTP - site discovery API and automatic toolbar callback persist browser identity", async () => {
  const api = startIndieAuthMockApi();
  const dom = new JSDOM("<article><p>Mock article text</p></article>", {
    url: api.redirectUri,
  });
  let instance: ReturnType<typeof createMarginalia> | undefined;
  try {
    const storage = new IndieAuthBrowserStorage(
      dom.window as unknown as Window,
    );
    const client = new IndieAuthClient({
      clientId: api.siteOrigin,
      redirectUri: api.redirectUri,
      storage,
      discoveryOrigin: api.siteOrigin,
      discoverEndpoints: api.discoverEndpoints,
    });
    const callback = await api.authorize(
      await client.startAuth(api.profileUrl),
    );
    dom.reconfigure({ url: callback.href });
    const errors: unknown[] = [];
    instance = createMarginalia({
      container: dom.window.document.querySelector("article")!,
      enableHashNavigation: false,
      onAnnotate() {},
      onError(error) {
        errors.push(error);
      },
      config: {
        auth: { enabled: true, discoverEndpoints: api.discoverEndpoints },
      },
    });
    const deadline = Date.now() + 3000;
    while (!storage.getUser() && !errors.length && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assertEquals(errors, []);
    assertEquals(storage.getUser()?.me, api.profileUrl);
    assertEquals(dom.window.location.href, api.redirectUri);
    assertEquals(api.requests, [
      "GET /api/indieauth/discover",
      "GET /profile/html",
      "GET /authorize",
      "POST /token",
    ]);
  } finally {
    instance?.destroy();
    dom.window.close();
    await api.close();
  }
});

Deno.test("IndieAuth HTTP - mismatched state never reaches token API; substituted identity is rejected", async () => {
  const api = startIndieAuthMockApi();
  try {
    const client = new IndieAuthClient({
      clientId: api.siteOrigin,
      redirectUri: api.redirectUri,
      storage: new IndieAuthMemoryStorage(),
    });
    const callback = await api.authorize(
      await client.startAuth(api.profileUrl),
    );
    const wrongState = new URL(callback);
    wrongState.searchParams.set("state", "forged-state");
    await assertRejects(
      () => client.handleRedirect(wrongState.href),
      Error,
      "State mismatch",
    );
    assertEquals(api.requests.includes("POST /token"), false);
    api.setResponseMe(`${api.origin}/someone-else`);
    await assertRejects(
      () => client.handleRedirect(callback.href),
      Error,
      "does not match",
    );
    assertEquals(client.getUser(), null);
    assertEquals(
      api.requests.filter((request) => request === "POST /token").length,
      1,
    );
  } finally {
    await api.close();
  }
});

Deno.test("IndieAuth HTTP - token API enforces PKCE and a failed exchange leaves the user signed out", async () => {
  const api = startIndieAuthMockApi();
  try {
    const storage = new IndieAuthMemoryStorage();
    const client = new IndieAuthClient({
      clientId: api.siteOrigin,
      redirectUri: api.redirectUri,
      storage,
    });
    const callback = await api.authorize(
      await client.startAuth(api.profileUrl),
    );
    const pending = storage.getAuthState()!;
    storage.saveAuthState(
      pending.state,
      "incorrect-verifier",
      pending.me,
      pending.tokenEndpoint,
      { clientId: api.siteOrigin, redirectUri: api.redirectUri },
    );
    await assertRejects(
      () => client.handleRedirect(callback.href),
      Error,
      "status 400",
    );
    assertEquals(client.getUser(), null);
    assertEquals(storage.getAuthState(), null);

    const retry = await api.authorize(await client.startAuth(api.profileUrl));
    api.setTokenStatus(503);
    await assertRejects(
      () => client.handleRedirect(retry.href),
      Error,
      "status 503",
    );
    assertEquals(client.getUser(), null);
    assertEquals(storage.getAuthState(), null);
  } finally {
    await api.close();
  }
});
