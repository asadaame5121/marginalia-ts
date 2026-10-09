import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { JSDOM } from "jsdom";
import {
  buildAuthorizationUrl,
  extractEndpointsFromHeaders,
  extractEndpointsFromHtml,
  IndieAuthBrowserStorage,
  IndieAuthClient,
  IndieAuthMemoryStorage,
} from "../src/core/indieauth.ts";
import { resolveConfig } from "../src/core/config.ts";
import { createMarginalia } from "../src/index.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";

const clientId = "https://site.example/";
const redirectUri = "https://site.example/article?view=full#section";
const me = "https://alice.example/";
const authorizationEndpoint = "https://auth.example/authorize";
const tokenEndpoint = "https://auth.example/token";

Deno.test("IndieAuth endpoints reject executable, non-HTTP and malformed URLs", async () => {
  for (
    const endpoint of [
      "javascript:alert(document.domain)//",
      "data:text/html,test",
      "file:///tmp/test",
      "ftp://example.com/",
      "not a URL",
    ]
  ) {
    assertThrows(() =>
      buildAuthorizationUrl({
        authorizationEndpoint: endpoint,
        clientId,
        redirectUri,
        me,
        state: "state",
        codeChallenge: "challenge",
      })
    );
    assertThrows(() =>
      extractEndpointsFromHtml(
        `<link rel="authorization_endpoint" href="${endpoint}">`,
      )
    );
    assertThrows(() =>
      extractEndpointsFromHeaders(`<${endpoint}>; rel="token_endpoint"`)
    );
    assertThrows(() =>
      new IndieAuthClient({
        clientId,
        redirectUri,
        defaultAuthEndpoint: endpoint,
      })
    );
    assertThrows(() =>
      new IndieAuthClient({
        clientId,
        redirectUri,
        defaultTokenEndpoint: endpoint,
      })
    );
  }
  for (const protocol of ["http", "https"]) {
    const endpoint = `${protocol}://auth.example/auth`;
    assertEquals(
      new URL(
        buildAuthorizationUrl({
          authorizationEndpoint: endpoint,
          clientId,
          redirectUri,
          me,
          state: "state",
          codeChallenge: "challenge",
        }),
      ).protocol,
      `${protocol}:`,
    );
  }
  const storage = new IndieAuthMemoryStorage();
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    discoverEndpoints: () =>
      Promise.resolve({ authorizationEndpoint: "javascript:alert(1)" }),
  });
  await assertRejects(() => client.startAuth(me), Error, "HTTP(S)");
  assertEquals(storage.getAuthState(), null);
});

Deno.test("Unsafe discovered endpoints do not trigger the configured fallback", async () => {
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    defaultAuthEndpoint: authorizationEndpoint,
    fetchFn: () =>
      Promise.resolve(
        new Response(
          '<link rel="authorization_endpoint" href="javascript:alert(1)">',
        ),
      ),
  });
  await assertRejects(() => client.startAuth(me), Error, "HTTP(S)");
});

Deno.test("Link header relations are parsed regardless of parameter order and embedded commas", () => {
  const endpoints = extractEndpointsFromHeaders(
    '<https://auth.example/a,b>; title="auth, with ; rel=ignored"; type="text/html"; REL="authorization_endpoint other"; hreflang=en, </token>; type="application/json"; rel=token_endpoint; title="token"',
    me,
  );
  assertEquals(endpoints.authorizationEndpoint, "https://auth.example/a,b");
  assertEquals(endpoints.tokenEndpoint, "https://alice.example/token");
  assertEquals(
    extractEndpointsFromHeaders(
      '<https://auth.example/>; title="text; rel=authorization_endpoint"',
    ),
    {},
  );
});

Deno.test("Discovery hook uses the canonical input, is preserved by config and avoids direct profile fetch", async () => {
  let discovered = "";
  const discoverEndpoints = (url: string) => {
    discovered = url;
    return Promise.resolve({
      authorizationEndpoint,
      tokenEndpoint,
      me: "https://victim.example/",
    });
  };
  assertEquals(
    resolveConfig({ auth: { discoverEndpoints } }).auth?.discoverEndpoints,
    discoverEndpoints,
  );
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    discoverEndpoints,
    discoveryOrigin: "https://site.example",
    fetchFn: () => {
      throw new Error("Direct profile fetch must not run");
    },
  });
  const endpoints = await client.discover("alice.example");
  assertEquals(discovered, me);
  assertEquals(endpoints, { authorizationEndpoint, tokenEndpoint, me });
  const noHook = new IndieAuthClient({
    clientId,
    redirectUri,
    discoveryOrigin: "https://site.example",
    fetchFn: () => {
      throw new Error("Must not fetch");
    },
  });
  await assertRejects(
    () => noHook.startAuth(me),
    Error,
    "auth.discoverEndpoints",
  );
  const configured = new IndieAuthClient({
    clientId,
    redirectUri,
    discoveryOrigin: "https://site.example",
    defaultAuthEndpoint: authorizationEndpoint,
    fetchFn: () => {
      throw new Error("Must not fetch");
    },
  });
  assertEquals(
    (await configured.discover(me)).authorizationEndpoint,
    authorizationEndpoint,
  );
});

Deno.test("Callback survives a new client and binds canonical identity and discovered endpoint", async () => {
  const storage = new IndieAuthMemoryStorage();
  const first = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    discoverEndpoints: () =>
      Promise.resolve({ authorizationEndpoint, tokenEndpoint }),
  });
  const authUrl = new URL(await first.startAuth("https://ALICE.example"));
  const pending = storage.getAuthState()!;
  assertEquals(pending.me, me);
  assertEquals(pending.tokenEndpoint, tokenEndpoint);
  let postCount = 0;
  const second = new IndieAuthClient({
    clientId,
    // Integrations using location.href will see callback query parameters on reload.
    redirectUri:
      "https://site.example/article?view=full&code=valid-code&state=returned#section",
    storage,
    fetchFn: (url, init) => {
      postCount++;
      assertEquals(url, tokenEndpoint);
      assertEquals(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));
      assertEquals(body.get("code_verifier"), pending.codeVerifier);
      assertEquals(body.get("redirect_uri"), redirectUri);
      return Promise.resolve(
        Response.json({
          me: "https://ALICE.example",
          profile: { name: "Alice" },
        }),
      );
    },
  });
  const callback = new URL(redirectUri);
  callback.searchParams.set("state", authUrl.searchParams.get("state")!);
  callback.searchParams.set("code", "valid-code");
  assertEquals(await second.handleRedirect(callback.href), true);
  assertEquals(second.getUser()?.me, me);
  assertEquals(storage.getAuthState(), null);
  assertEquals(await second.handleRedirect(callback.href), false);
  assertEquals(postCount, 1);
});

Deno.test("Identity-only callback verifies the code at the saved authorization endpoint", async () => {
  const storage = new IndieAuthMemoryStorage();
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    discoverEndpoints: () => Promise.resolve({ authorizationEndpoint }),
    fetchFn: (url) => {
      assertEquals(url, authorizationEndpoint);
      return Promise.resolve(Response.json({ me }));
    },
  });
  const authUrl = new URL(await client.startAuth(me));
  assertEquals(
    (await client.handleCallback({
      code: "code",
      state: authUrl.searchParams.get("state")!,
    })).me,
    me,
  );
});

Deno.test("Callback rejects identity substitution, invalid identities and legacy unbound state", async () => {
  for (
    const returnedMe of [
      "https://victim.example/",
      "javascript:alert(1)",
      "",
      null,
    ]
  ) {
    const storage = new IndieAuthMemoryStorage();
    storage.saveAuthState("state", "verifier", me, tokenEndpoint);
    const client = new IndieAuthClient({
      clientId,
      redirectUri,
      storage,
      fetchFn: () => Promise.resolve(Response.json({ me: returnedMe })),
    });
    await assertRejects(() =>
      client.handleCallback({ code: "code", state: "state" })
    );
    assertEquals(client.getUser(), null);
    assertEquals(storage.getAuthState(), null);
  }
  const storage = new IndieAuthMemoryStorage();
  storage.saveAuthState("state", "verifier");
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    defaultTokenEndpoint: tokenEndpoint,
    fetchFn: () => {
      throw new Error("Must not fetch");
    },
  });
  await assertRejects(
    () => client.handleCallback({ code: "code", state: "state" }),
    Error,
    "missing the requested profile",
  );
});

Deno.test("Redirect handling ignores unrelated queries and checks state before exchanging or accepting errors", async () => {
  const storage = new IndieAuthMemoryStorage();
  storage.saveAuthState("state", "verifier", me, tokenEndpoint);
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    fetchFn: () => {
      throw new Error("Must not fetch");
    },
  });
  assertEquals(
    await client.handleRedirect(
      "https://site.example/elsewhere?code=code&state=state",
    ),
    false,
  );
  assertEquals(
    await client.handleRedirect(
      "https://other.example/article?code=code&state=state",
    ),
    false,
  );
  assertEquals(await client.handleRedirect(redirectUri), false);
  await assertRejects(
    () =>
      client.handleRedirect(
        "https://site.example/article?code=code&state=wrong",
      ),
    Error,
    "State mismatch",
  );
  await assertRejects(
    () =>
      client.handleRedirect(
        "https://site.example/article?error=access_denied&state=wrong",
      ),
    Error,
    "State mismatch",
  );
  assertEquals(storage.getAuthState()?.state, "state");
  await assertRejects(
    () =>
      client.handleRedirect(
        "https://site.example/article?error=access_denied&state=state",
      ),
    Error,
    "access_denied",
  );
  assertEquals(storage.getAuthState(), null);
});

Deno.test("createMarginalia automatically finishes browser-stored redirects and updates comment identity", async () => {
  const dom = new JSDOM('<article id="content"><p>Hello world</p></article>', {
    url: redirectUri,
  });
  const win = dom.window as unknown as Window;
  const storage = new IndieAuthBrowserStorage(win);
  const first = new IndieAuthClient({
    clientId: win.location.origin,
    redirectUri,
    storage,
    discoverEndpoints: () =>
      Promise.resolve({ authorizationEndpoint, tokenEndpoint }),
  });
  const url = new URL(await first.startAuth(me));
  assertEquals(new IndieAuthBrowserStorage(win).getAuthState()?.me, me);
  dom.reconfigure({
    url: `https://site.example/article?view=full&code=code&state=${
      url.searchParams.get("state")
    }#section`,
  });
  const originalFetch = globalThis.fetch;
  const annotations: W3CAnnotation[] = [];
  let resolveExchange!: (response: Response) => void;
  globalThis.fetch = (url, init) => {
    assertEquals(url, tokenEndpoint);
    assertEquals(init?.method, "POST");
    return new Promise((resolve) => {
      resolveExchange = resolve;
    });
  };
  let instance: ReturnType<typeof createMarginalia> | undefined;
  try {
    const container = win.document.querySelector("article")!;
    instance = createMarginalia({
      container,
      enableHashNavigation: false,
      config: { auth: { enabled: true } },
      onAnnotate: (annotation) => {
        annotations.push(annotation);
      },
    });
    const range = win.document.createRange();
    range.selectNodeContents(container.querySelector("p")!);
    win.getSelection()!.addRange(range);
    container.dispatchEvent(
      new dom.window.MouseEvent("mouseup", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    (win.document.querySelector('[data-action="comment"]') as HTMLButtonElement)
      .click();
    assertEquals(
      win.document.querySelector(".marginalia-indieauth-user-badge"),
      null,
    );
    resolveExchange(Response.json({ me, profile: { name: "Alice" } }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(win.location.href, redirectUri);
    assertEquals(
      win.document.querySelector(".marginalia-indieauth-user-badge")
        ?.textContent?.includes("Alice"),
      true,
    );
    assertEquals(
      (win.document.querySelector(".marginalia-input-url") as HTMLInputElement)
        .value,
      me,
    );
    (win.document.querySelector("textarea") as HTMLTextAreaElement).value =
      "Authenticated comment";
    (win.document.querySelector(".btn-submit") as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(annotations[0].creator?.url, me);
    assertEquals(annotations[0].creator?.name, "Alice");
  } finally {
    globalThis.fetch = originalFetch;
    instance?.destroy();
    dom.window.close();
  }
});

Deno.test("Default toolbar passes discovery hook and blocks unsafe discovered endpoints", async () => {
  const dom = new JSDOM("<article><p>Hello</p></article>", {
    url: redirectUri,
  });
  const container = dom.window.document.querySelector("article")!;
  let discovered = "";
  const instance = createMarginalia({
    container,
    enableHashNavigation: false,
    onAnnotate: () => {},
    config: {
      auth: {
        enabled: true,
        discoverEndpoints: (url) => {
          discovered = url;
          return Promise.resolve({
            authorizationEndpoint: "javascript:alert(1)",
          });
        },
      },
    },
  });
  try {
    const range = dom.window.document.createRange();
    range.selectNodeContents(container.querySelector("p")!);
    dom.window.getSelection()!.addRange(range);
    container.dispatchEvent(
      new dom.window.MouseEvent("mouseup", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    (dom.window.document.querySelector(
      '[data-action="comment"]',
    ) as HTMLButtonElement).click();
    (dom.window.document.querySelector(
      ".marginalia-indieauth-input",
    ) as HTMLInputElement).value = "alice.example";
    (dom.window.document.querySelector(
      ".marginalia-indieauth-btn-signin",
    ) as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(discovered, me);
    assertEquals(
      dom.window.document.querySelector(".marginalia-error-msg")?.textContent
        ?.includes("HTTP(S)"),
      true,
    );
    assertEquals(dom.window.location.href, redirectUri);
    assertEquals(
      new IndieAuthBrowserStorage(dom.window as unknown as Window)
        .getAuthState(),
      null,
    );
  } finally {
    instance.destroy();
    dom.window.close();
  }
});

Deno.test("Toolbar validates navigation even when an injected client returns a javascript URL", async () => {
  const dom = new JSDOM("<article><p>Hello</p></article>", {
    url: redirectUri,
  });
  const container = dom.window.document.querySelector("article")!;
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage: new IndieAuthMemoryStorage(),
  });
  client.startAuth = () =>
    Promise.resolve("javascript:alert(document.domain)//");
  const instance = createMarginalia({
    container,
    enableHashNavigation: false,
    onAnnotate: () => {},
    config: { auth: { enabled: true, client } },
  });
  try {
    const range = dom.window.document.createRange();
    range.selectNodeContents(container.querySelector("p")!);
    dom.window.getSelection()!.addRange(range);
    container.dispatchEvent(
      new dom.window.MouseEvent("mouseup", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    (dom.window.document.querySelector(
      '[data-action="comment"]',
    ) as HTMLButtonElement).click();
    (dom.window.document.querySelector(
      ".marginalia-indieauth-input",
    ) as HTMLInputElement).value = me;
    (dom.window.document.querySelector(
      ".marginalia-indieauth-btn-signin",
    ) as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(dom.window.location.href, redirectUri);
    assertEquals(
      dom.window.document.querySelector(".marginalia-error-msg")?.textContent
        ?.includes("HTTP(S)"),
      true,
    );
  } finally {
    instance.destroy();
    dom.window.close();
  }
});

Deno.test("Callback failure is reported and anonymous commenting remains available", async () => {
  const dom = new JSDOM("<article><p>Hello</p></article>", {
    url: "https://site.example/article?code=code&state=state",
  });
  const storage = new IndieAuthMemoryStorage();
  storage.saveAuthState("state", "verifier", me, tokenEndpoint);
  const client = new IndieAuthClient({
    clientId,
    redirectUri,
    storage,
    fetchFn: () => Promise.resolve(new Response("", { status: 400 })),
  });
  const errors: unknown[] = [];
  const annotations: W3CAnnotation[] = [];
  const container = dom.window.document.querySelector("article")!;
  const instance = createMarginalia({
    container,
    enableHashNavigation: false,
    config: { auth: { enabled: true, client } },
    onAnnotate: (annotation) => {
      annotations.push(annotation);
    },
    onError: (error) => {
      errors.push(error);
    },
  });
  try {
    const range = dom.window.document.createRange();
    range.selectNodeContents(container.querySelector("p")!);
    dom.window.getSelection()!.addRange(range);
    container.dispatchEvent(
      new dom.window.MouseEvent("mouseup", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 30));
    (dom.window.document.querySelector(
      '[data-action="comment"]',
    ) as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(errors.length, 1);
    assertEquals(
      dom.window.document.querySelector(".marginalia-error-msg")?.textContent
        ?.includes("400"),
      true,
    );
    assertEquals(client.getUser(), null);
    (dom.window.document.querySelector(
      ".marginalia-input-name",
    ) as HTMLInputElement).value = "Guest";
    (dom.window.document.querySelector("textarea") as HTMLTextAreaElement)
      .value = "Anonymous comment";
    (dom.window.document.querySelector(".btn-submit") as HTMLButtonElement)
      .click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assertEquals(annotations[0].creator?.name, "Guest");
  } finally {
    instance.destroy();
    dom.window.close();
  }
});
