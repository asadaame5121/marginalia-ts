import { assertEquals, assertRejects } from "@std/assert";
import {
  IndieAuthClient,
  IndieAuthMemoryStorage,
  type IndieAuthUser,
} from "../src/core/indieauth.ts";

Deno.test("IndieAuthClient - discover: LinkヘッダーまたはHTMLからエンドポイントを発見", async () => {
  const fakeHtml = `
    <html>
      <head>
        <link rel="authorization_endpoint" href="https://auth.example.com/oauth/auth">
        <link rel="token_endpoint" href="https://auth.example.com/oauth/token">
      </head>
    </html>
  `;

  const customFetch = (url: string | URL | Request) => {
    return Promise.resolve(new Response(fakeHtml, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    }));
  };

  const client = new IndieAuthClient({
    clientId: "https://myblog.example.com/",
    redirectUri: "https://myblog.example.com/callback",
    storage: new IndieAuthMemoryStorage(),
    fetchFn: customFetch,
  });

  const endpoints = await client.discover("alice.example.com");
  assertEquals(endpoints.authorizationEndpoint, "https://auth.example.com/oauth/auth");
  assertEquals(endpoints.tokenEndpoint, "https://auth.example.com/oauth/token");
  assertEquals(endpoints.me, "https://alice.example.com/");
});

Deno.test("IndieAuthClient - startAuth: 認可URLを構築し、stateとverifierを保存", async () => {
  const customFetch = () => {
    return Promise.resolve(new Response(`
      <link rel="authorization_endpoint" href="https://auth.example.com/auth">
    `, {
      headers: { "Content-Type": "text/html" },
    }));
  };

  const storage = new IndieAuthMemoryStorage();
  const client = new IndieAuthClient({
    clientId: "https://myblog.example.com/",
    redirectUri: "https://myblog.example.com/callback",
    storage,
    fetchFn: customFetch,
  });

  const authUrlStr = await client.startAuth("https://bob.example.com/");
  const authUrl = new URL(authUrlStr);

  assertEquals(authUrl.origin, "https://auth.example.com");
  assertEquals(authUrl.searchParams.get("client_id"), "https://myblog.example.com/");
  assertEquals(authUrl.searchParams.get("redirect_uri"), "https://myblog.example.com/callback");
  assertEquals(authUrl.searchParams.get("me"), "https://bob.example.com/");
  assertEquals(authUrl.searchParams.get("code_challenge_method"), "S256");

  const state = authUrl.searchParams.get("state")!;
  const storedAuth = storage.getAuthState();
  assertEquals(storedAuth?.state, state);
  assertEquals(typeof storedAuth?.codeVerifier, "string");
  assertEquals(storedAuth?.codeVerifier.length! >= 43, true);
});

Deno.test("IndieAuthClient - handleCallback: 認証コード交換とユーザー保存", async () => {
  const storage = new IndieAuthMemoryStorage();
  storage.saveAuthState("test-state", "test-verifier");

  // トークンエンドポイントへのPOSTリクエストをモック
  const customFetch = (input: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (urlStr === "https://auth.example.com/token" && init?.method === "POST") {
      const body = init.body as string;
      const params = new URLSearchParams(body);
      if (
        params.get("grant_type") === "authorization_code" &&
        params.get("code") === "valid-code" &&
        params.get("code_verifier") === "test-verifier" &&
        params.get("client_id") === "https://myblog.example.com/"
      ) {
        return Promise.resolve(new Response(JSON.stringify({
          me: "https://alice.example.com/",
          profile: {
            name: "Alice",
            photo: "https://alice.example.com/avatar.png",
          },
        }), {
          headers: { "Content-Type": "application/json" },
        }));
      }
    }
    return Promise.resolve(new Response("Not found", { status: 404 }));
  };

  const client = new IndieAuthClient({
    clientId: "https://myblog.example.com/",
    redirectUri: "https://myblog.example.com/callback",
    storage,
    fetchFn: customFetch,
  });

  const user = await client.handleCallback({
    code: "valid-code",
    state: "test-state",
    tokenEndpoint: "https://auth.example.com/token",
  });

  assertEquals(user.me, "https://alice.example.com/");
  assertEquals(user.name, "Alice");
  assertEquals(user.photo, "https://alice.example.com/avatar.png");

  // ストレージに保存されていること
  assertEquals(client.getUser()?.me, "https://alice.example.com/");
  // authState はクリアされていること
  assertEquals(storage.getAuthState(), null);

  // signOut
  client.signOut();
  assertEquals(client.getUser(), null);
});

Deno.test("IndieAuthClient - handleCallback: state不一致で失敗", async () => {
  const storage = new IndieAuthMemoryStorage();
  storage.saveAuthState("correct-state", "test-verifier");

  const client = new IndieAuthClient({
    clientId: "https://myblog.example.com/",
    redirectUri: "https://myblog.example.com/callback",
    storage,
  });

  await assertRejects(
    async () => {
      await client.handleCallback({
        code: "some-code",
        state: "wrong-state",
      });
    },
    Error,
    "State mismatch",
  );
});
