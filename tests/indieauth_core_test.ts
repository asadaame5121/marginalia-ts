import { assertEquals, assertNotEquals } from "@std/assert";
import {
  normalizeProfileUrl,
  extractEndpointsFromHtml,
  extractEndpointsFromHeaders,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  verifyCallbackParams,
  IndieAuthMemoryStorage,
  type IndieAuthUser,
} from "../src/core/indieauth.ts";

Deno.test("IndieAuth - normalizeProfileUrl: URLの正規化", () => {
  // スキームなし -> https:// が補完され、パス末尾スラッシュが付与される
  assertEquals(normalizeProfileUrl("example.com"), "https://example.com/");
  // スキームあり、パスなし -> 末尾スラッシュ
  assertEquals(normalizeProfileUrl("https://example.com"), "https://example.com/");
  // パスあり -> パス維持
  assertEquals(normalizeProfileUrl("https://example.com/user"), "https://example.com/user");
  assertEquals(normalizeProfileUrl("http://example.com/user/"), "http://example.com/user/");
  // 不正なスキーム
  assertEquals(normalizeProfileUrl("javascript:alert(1)"), null);
  assertEquals(normalizeProfileUrl("data:text/html,test"), null);
  assertEquals(normalizeProfileUrl(""), null);
  assertEquals(normalizeProfileUrl("   "), null);
});

Deno.test("IndieAuth - extractEndpointsFromHtml: HTMLからのエンドポイント抽出", () => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="authorization_endpoint" href="https://auth.example.com/auth">
        <link rel="token_endpoint" href="/api/token">
      </head>
      <body>
        <a rel="me" href="https://github.com/alice">GitHub</a>
      </body>
    </html>
  `;
  const endpoints = extractEndpointsFromHtml(html, "https://alice.example.com/");
  assertEquals(endpoints.authorizationEndpoint, "https://auth.example.com/auth");
  // 相対パスの解決
  assertEquals(endpoints.tokenEndpoint, "https://alice.example.com/api/token");
});

Deno.test("IndieAuth - extractEndpointsFromHeaders: HTTP Linkヘッダーからの抽出", () => {
  const linkHeader = '<https://auth.example.com/auth>; rel="authorization_endpoint", </token>; rel="token_endpoint"';
  const endpoints = extractEndpointsFromHeaders(linkHeader, "https://alice.example.com/");
  assertEquals(endpoints.authorizationEndpoint, "https://auth.example.com/auth");
  assertEquals(endpoints.tokenEndpoint, "https://alice.example.com/token");
});

Deno.test("IndieAuth - PKCE: generateCodeVerifier & generateCodeChallenge", async () => {
  const verifier = generateCodeVerifier();
  // 長さは43〜128
  assertEquals(verifier.length >= 43 && verifier.length <= 128, true);
  // RFC 7636 unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
  assertEquals(/^[A-Za-z0-9_.~-]+$/.test(verifier), true);

  const challenge = await generateCodeChallenge(verifier);
  // Base64URLセーフ
  assertEquals(/^[A-Za-z0-9_-]+$/.test(challenge), true);
  assertNotEquals(challenge, verifier);

  // 固定verifierでの再現性テスト
  const fixedVerifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const fixedChallenge = await generateCodeChallenge(fixedVerifier);
  // RFC 7636 例示のハッシュ
  // Base64URL encode of SHA256(fixedVerifier)
  assertEquals(fixedChallenge.length > 0, true);
  // 再実行で同一ハッシュになること
  assertEquals(await generateCodeChallenge(fixedVerifier), fixedChallenge);
});

Deno.test("IndieAuth - buildAuthorizationUrl: 認可リクエストURL生成", () => {
  const urlStr = buildAuthorizationUrl({
    authorizationEndpoint: "https://auth.example.com/auth",
    clientId: "https://myblog.example.com/",
    redirectUri: "https://myblog.example.com/callback",
    me: "https://alice.example.com/",
    state: "random-state-123",
    codeChallenge: "challenge-abc",
    scope: "identify",
  });

  const url = new URL(urlStr);
  assertEquals(url.origin, "https://auth.example.com");
  assertEquals(url.pathname, "/auth");
  assertEquals(url.searchParams.get("response_type"), "code");
  assertEquals(url.searchParams.get("client_id"), "https://myblog.example.com/");
  assertEquals(url.searchParams.get("redirect_uri"), "https://myblog.example.com/callback");
  assertEquals(url.searchParams.get("me"), "https://alice.example.com/");
  assertEquals(url.searchParams.get("state"), "random-state-123");
  assertEquals(url.searchParams.get("code_challenge"), "challenge-abc");
  assertEquals(url.searchParams.get("code_challenge_method"), "S256");
  assertEquals(url.searchParams.get("scope"), "identify");
});

Deno.test("IndieAuth - verifyCallbackParams: コールバックパラメータ検証", () => {
  // 正常ケース
  const valid = verifyCallbackParams({
    code: "auth-code-123",
    state: "state-xyz",
    expectedState: "state-xyz",
  });
  assertEquals(valid.valid, true);
  assertEquals(valid.code, "auth-code-123");

  // state不一致
  const invalidState = verifyCallbackParams({
    code: "auth-code-123",
    state: "wrong-state",
    expectedState: "state-xyz",
  });
  assertEquals(invalidState.valid, false);
  assertEquals(invalidState.error, "State mismatch (possible CSRF)");

  // code欠損
  const missingCode = verifyCallbackParams({
    code: null,
    state: "state-xyz",
    expectedState: "state-xyz",
  });
  assertEquals(missingCode.valid, false);
  assertEquals(missingCode.error, "Missing authorization code");
});

Deno.test("IndieAuth - IndieAuthMemoryStorage: セッション保存・クリア", () => {
  const storage = new IndieAuthMemoryStorage();
  assertEquals(storage.getUser(), null);

  const testUser: IndieAuthUser = {
    me: "https://alice.example.com/",
    name: "Alice Example",
    photo: "https://alice.example.com/photo.jpg",
  };

  storage.setUser(testUser);
  assertEquals(storage.getUser(), testUser);

  // auth state (state + verifier)
  storage.saveAuthState("state-1", "verifier-1");
  const authState = storage.getAuthState();
  assertEquals(authState?.state, "state-1");
  assertEquals(authState?.codeVerifier, "verifier-1");

  storage.clearAuthState();
  assertEquals(storage.getAuthState(), null);

  // userはまだ残っている
  assertEquals(storage.getUser(), testUser);

  storage.clearUser();
  assertEquals(storage.getUser(), null);
});
