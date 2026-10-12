import { IndieAuthClient } from "../../src/core/indieauth.ts";

interface AuthorizationCode {
  me: string;
  clientId: string;
  redirectUri: string;
  challenge: string;
  scope: string;
}

/** Local HTTP fixture, never a production discovery proxy or identity provider. */
export function startIndieAuthMockApi() {
  const codes = new Map<string, AuthorizationCode>();
  const requests: string[] = [];
  let responseMe: string | undefined;
  let tokenStatus = 200;
  let origin = "";
  const authServer = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    onListen() {},
  }, async (request) => {
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    if (url.pathname === "/profile/html") {
      // Profiles deliberately omit CORS headers, as real IndieAuth sites commonly do.
      return new Response(
        '<link rel="authorization_endpoint" href="/authorize"><link rel="token_endpoint" href="/token">',
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    }
    if (url.pathname === "/profile/header") {
      return new Response("", {
        headers: {
          Link:
            '</authorize>; type="text/html"; rel="authorization_endpoint", </token>; type="application/json"; rel="token_endpoint"',
        },
      });
    }
    if (url.pathname === "/profile/unquoted") {
      return new Response(
        "<link rel=authorization_endpoint href=/authorize><link href=/token rel=token_endpoint>",
        { headers: { "Content-Type": "text/html" } },
      );
    }
    if (url.pathname === "/profile/metadata-html") {
      return new Response("<link rel=indieauth-metadata href=/metadata>", {
        headers: { "Content-Type": "text/html" },
      });
    }
    if (url.pathname === "/profile/metadata-header") {
      return new Response("", {
        headers: {
          Link:
            '</metadata>; type="application/json"; rel="indieauth-metadata"',
        },
      });
    }
    if (url.pathname === "/metadata") {
      return Response.json({
        issuer: origin,
        authorization_endpoint: `${origin}/authorize`,
        token_endpoint: `${origin}/token`,
        code_challenge_methods_supported: ["S256"],
      });
    }
    if (url.pathname === "/authorize" && request.method === "GET") {
      const params = url.searchParams;
      if (
        params.get("response_type") !== "code" ||
        params.get("code_challenge_method") !== "S256" ||
        ["me", "client_id", "redirect_uri", "state", "code_challenge"].some((
          key,
        ) => !params.get(key))
      ) {
        return Response.json({ error: "invalid_request" }, { status: 400 });
      }
      const code = crypto.randomUUID();
      codes.set(code, {
        me: params.get("me")!,
        clientId: params.get("client_id")!,
        redirectUri: params.get("redirect_uri")!,
        challenge: params.get("code_challenge")!,
        scope: params.get("scope") || "",
      });
      const callback = new URL(params.get("redirect_uri")!);
      callback.searchParams.set("code", code);
      callback.searchParams.set("state", params.get("state")!);
      return new Response(null, {
        status: 302,
        headers: { Location: callback.href },
      });
    }
    if (
      ["/token", "/authorize"].includes(url.pathname) &&
      request.method === "POST"
    ) {
      const cors = { "Access-Control-Allow-Origin": "*" };
      if (
        !request.headers.get("content-type")?.startsWith(
          "application/x-www-form-urlencoded",
        )
      ) {
        return Response.json({ error: "invalid_request" }, {
          status: 415,
          headers: cors,
        });
      }
      const params = new URLSearchParams(await request.text());
      const code = params.get("code") || "";
      const authorization = codes.get(code);
      // Validate PKCE independently of the client library.
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(params.get("code_verifier") || ""),
      );
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
        .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
      if (
        !authorization || params.get("grant_type") !== "authorization_code" ||
        params.get("client_id") !== authorization.clientId ||
        params.get("redirect_uri") !== authorization.redirectUri ||
        challenge !== authorization.challenge ||
        url.pathname !==
          (authorization.scope.split(/\s+/).some((scope) =>
              scope && scope !== "profile" && scope !== "email"
            )
            ? "/token"
            : "/authorize")
      ) {
        return Response.json({ error: "invalid_grant" }, {
          status: 400,
          headers: cors,
        });
      }
      codes.delete(code);
      if (tokenStatus !== 200) {
        return Response.json({ error: "temporarily_unavailable" }, {
          status: tokenStatus,
          headers: cors,
        });
      }
      return Response.json({
        me: responseMe || authorization.me,
        profile: { name: "Mock Alice" },
      }, { headers: cors });
    }
    return new Response("Not found", { status: 404 });
  });
  origin = `http://127.0.0.1:${authServer.addr.port}`;

  const siteServer = Deno.serve({
    hostname: "127.0.0.1",
    port: 0,
    onListen() {},
  }, async (request) => {
    const url = new URL(request.url);
    requests.push(`${request.method} ${url.pathname}`);
    if (url.pathname === "/api/indieauth/discover") {
      const profile = url.searchParams.get("me");
      // Only retrieve this fixture's known profiles, never arbitrary URLs.
      if (
        !profile ||
        !["html", "header", "unquoted", "metadata-html", "metadata-header"]
          .some((kind) => profile === `${origin}/profile/${kind}`)
      ) {
        return new Response("Unknown mock profile", { status: 400 });
      }
      const discovery = new IndieAuthClient({
        clientId: origin,
        redirectUri: origin,
      });
      const endpoints = await discovery.discover(profile);
      return Response.json(endpoints);
    }
    if (url.pathname === "/article") return new Response("Mock article");
    return new Response("Not found", { status: 404 });
  });
  const siteOrigin = `http://127.0.0.1:${siteServer.addr.port}`;
  return {
    origin,
    siteOrigin,
    requests,
    profileUrl: `${origin}/profile/html`,
    redirectUri: `${siteOrigin}/article?view=full#paragraph`,
    setResponseMe(me: string) {
      responseMe = me;
    },
    setTokenStatus(status: number) {
      tokenStatus = status;
    },
    async authorize(authorizationUrl: string) {
      const response = await fetch(authorizationUrl, { redirect: "manual" });
      await response.body?.cancel();
      if (response.status !== 302) {
        throw new Error(`Mock authorization failed: ${response.status}`);
      }
      return new URL(response.headers.get("Location")!);
    },
    async discoverEndpoints(profileUrl: string) {
      const response = await fetch(
        `${siteOrigin}/api/indieauth/discover?me=${
          encodeURIComponent(profileUrl)
        }`,
      );
      if (!response.ok) {
        throw new Error(`Mock discovery failed: ${response.status}`);
      }
      return response.json();
    },
    async close() {
      await Promise.all([siteServer.shutdown(), authServer.shutdown()]);
    },
  };
}
