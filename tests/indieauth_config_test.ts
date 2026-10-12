import { assertEquals } from "@std/assert";
import { resolveConfig, type MarginaliaConfig } from "../src/core/config.ts";

Deno.test("Config - IndieAuth: デフォルト設定では enabled は false（オプショナル）", () => {
  const config = resolveConfig();
  assertEquals(config.auth?.enabled, false);
});

Deno.test("Config - IndieAuth: カスタム設定で enabled: true や各オプションがマージされる", () => {
  const customConfig: MarginaliaConfig = {
    auth: {
      enabled: true,
      clientId: "https://example.com/",
      redirectUri: "https://example.com/callback",
      defaultAuthEndpoint: "https://indieauth.com/auth",
      scope: "identify",
    },
    messages: {
      indieAuthSignInPrompt: "自分のドメインでサインイン",
    },
  };

  const resolved = resolveConfig(customConfig);
  assertEquals(resolved.auth?.enabled, true);
  assertEquals(resolved.auth?.clientId, "https://example.com/");
  assertEquals(resolved.auth?.redirectUri, "https://example.com/callback");
  assertEquals(resolved.auth?.defaultAuthEndpoint, "https://indieauth.com/auth");
  assertEquals(resolved.auth?.scope, "identify");
  assertEquals(resolved.messages?.indieAuthSignInPrompt, "自分のドメインでサインイン");
  // デフォルトメッセージも維持される
  assertEquals(resolved.messages?.nameRequired, "名前を入力してください。");
});
