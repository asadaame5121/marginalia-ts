import { assertEquals, assertRejects } from "@std/assert";
import {
  extractEndpointsFromHeaders,
  extractEndpointsFromHtml,
  IndieAuthClient,
  IndieAuthMemoryStorage,
} from "../src/core/indieauth.ts";

Deno.test("IndieAuth HTML attributes support quotes, whitespace, ordering and exact names", () => {
  for (
    const html of [
      "<link rel=authorization_endpoint href=/auth>",
      "<link HREF = '/auth' REL = \"authorization_endpoint other\">",
      "<link\nrel\t=\tauthorization_endpoint\n href = /auth >",
      '<a title="rel=wrong href=/bad" href=/auth rel=authorization_endpoint>sign in</a>',
    ]
  ) {
    assertEquals(extractEndpointsFromHtml(html, "https://profile.example/"), {
      authorizationEndpoint: "https://profile.example/auth",
    });
  }
  assertEquals(
    extractEndpointsFromHtml(
      "<link data-rel=authorization_endpoint href=/bad>",
      "https://profile.example/",
    ),
    {},
  );
  assertEquals(
    extractEndpointsFromHtml(
      "<link href=/metadata rel=indieauth-metadata>",
      "https://profile.example/",
    ),
    { metadataEndpoint: "https://profile.example/metadata" },
  );
  assertEquals(
    extractEndpointsFromHeaders(
      '</metadata>; type="application/json"; rel="indieauth-metadata"',
      "https://profile.example/",
    ),
    { metadataEndpoint: "https://profile.example/metadata" },
  );
});

Deno.test("Metadata links outrank legacy endpoints; HTTP metadata outranks HTML metadata", async () => {
  for (const header of [false, true]) {
    const calls: string[] = [];
    const client = new IndieAuthClient({
      clientId: "https://site.example/",
      redirectUri: "https://site.example/callback",
      fetchFn: (input) => {
        const url = String(input);
        calls.push(url);
        if (url === "https://profile.example/") {
          return Promise.resolve(
            new Response("<link rel=indieauth-metadata href=/html-metadata>", {
              headers: {
                Link:
                  '</legacy-auth>; rel="authorization_endpoint", </legacy-token>; rel="token_endpoint"' +
                  (header
                    ? ', </header-metadata>; rel="indieauth-metadata"'
                    : ""),
              },
            }),
          );
        }
        return Promise.resolve(
          Response.json({
            authorization_endpoint: "https://auth.example/auth",
            token_endpoint: "https://auth.example/token",
          }),
        );
      },
    });
    const endpoints = await client.discover("https://profile.example/");
    assertEquals(endpoints.authorizationEndpoint, "https://auth.example/auth");
    assertEquals(endpoints.tokenEndpoint, "https://auth.example/token");
    assertEquals(calls, [
      "https://profile.example/",
      `https://profile.example/${header ? "header" : "html"}-metadata`,
    ]);
  }
});

Deno.test("Invalid metadata fails closed instead of falling back to legacy/configured endpoints", async () => {
  for (
    const metadata of [null, [], {}, {
      authorization_endpoint: "javascript:alert(1)",
    }, {
      authorization_endpoint: "https://auth.example/",
      token_endpoint: "file:///tmp/token",
    }, { authorization_endpoint: "https://auth.example/", token_endpoint: 123 }]
  ) {
    const storage = new IndieAuthMemoryStorage();
    const client = new IndieAuthClient({
      clientId: "https://site.example/",
      redirectUri: "https://site.example/callback",
      storage,
      defaultAuthEndpoint: "https://fallback.example/",
      fetchFn: (url) =>
        Promise.resolve(
          String(url) === "https://profile.example/"
            ? new Response(
              "<link rel=indieauth-metadata href=/metadata><link rel=authorization_endpoint href=/legacy>",
            )
            : Response.json(metadata),
        ),
    });
    await assertRejects(() => client.startAuth("https://profile.example/"));
    assertEquals(storage.getAuthState(), null);
  }
});

Deno.test("Metadata HTTP failures are reported and hook-supplied metadata is resolved", async () => {
  const client = new IndieAuthClient({
    clientId: "https://site.example/",
    redirectUri: "https://site.example/callback",
    discoverEndpoints: () =>
      Promise.resolve({ metadataEndpoint: "https://auth.example/metadata" }),
    fetchFn: () =>
      Promise.resolve(new Response("Unavailable", { status: 503 })),
  });
  await assertRejects(
    () => client.startAuth("https://profile.example/"),
    Error,
    "metadata responded with status 503",
  );
});

Deno.test("Resource scopes require a token endpoint before creating pending auth state", async () => {
  const storage = new IndieAuthMemoryStorage();
  const client = new IndieAuthClient({
    clientId: "https://site.example/",
    redirectUri: "https://site.example/callback",
    storage,
    scope: "create",
    discoverEndpoints: () =>
      Promise.resolve({ authorizationEndpoint: "https://auth.example/" }),
  });
  await assertRejects(
    () => client.startAuth("https://profile.example/"),
    Error,
    "Token endpoint is required",
  );
  assertEquals(storage.getAuthState(), null);
});
