import { assertEquals } from "@std/assert";
import { parseFragment, toTextFragmentUrl, toFragmentionUrl, isValidHttpUrl } from "../src/core/url.ts";

Deno.test("URL Parser - W3C Text Fragment", () => {
  // exact のみ
  const res1 = parseFragment("https://example.com/post#:~:text=hello%20world");
  assertEquals(res1, {
    type: "text-fragment",
    exact: "hello world",
  });

  // prefix-,exact,-suffix
  const res2 = parseFragment("https://example.com/post#:~:text=before-,target%20text,-after");
  assertEquals(res2, {
    type: "text-fragment",
    exact: "target text",
    prefix: "before",
    suffix: "after",
  });

  // prefix-,exact
  const res3 = parseFragment("#:~:text=before-,target");
  assertEquals(res3, {
    type: "text-fragment",
    exact: "target",
    prefix: "before",
  });

  // exact,-suffix
  const res4 = parseFragment("#:~:text=target,-after");
  assertEquals(res4, {
    type: "text-fragment",
    exact: "target",
    suffix: "after",
  });
});

Deno.test("URL Parser - Fragmention (##)", () => {
  // 通常の ##
  const res1 = parseFragment("https://example.com/post##simple+text");
  assertEquals(res1, {
    type: "fragmention",
    exact: "simple text",
    index: 0,
  });

  // インデックス付き (++1)
  const res2 = parseFragment("https://example.com/post##repeated+word++2");
  assertEquals(res2, {
    type: "fragmention",
    exact: "repeated word",
    index: 2,
  });

  // インデックス付き (空白2つ + 数値)
  const res3 = parseFragment("https://example.com/post##repeated+word%20%203");
  assertEquals(res3, {
    type: "fragmention",
    exact: "repeated word",
    index: 3,
  });
});

Deno.test("URL Parser - 不正な入力の安全なハンドリング", () => {
  // 1. 空・非文字列・ハッシュなし
  assertEquals(parseFragment(""), null);
  assertEquals(parseFragment("https://example.com/post"), null);
  assertEquals(parseFragment("#"), null);
  assertEquals(parseFragment("#:~:text="), null);
  assertEquals(parseFragment("##"), null);
  assertEquals(parseFragment(null as unknown as string), null);
  assertEquals(parseFragment(undefined as unknown as string), null);

  // 2. exact が空白のみ
  assertEquals(parseFragment("#:~:text=%20%20"), null);
  assertEquals(parseFragment("##%20%20"), null);
  assertEquals(parseFragment("##+++"), null);

  // 3. 不正なパーセントエンコーディング（URIError 発生箇所）
  // %E0%A4%A は UTF-8 不完全シーケンス
  assertEquals(parseFragment("https://example.com/post#:~:text=%E0%A4%A"), null);
  assertEquals(parseFragment("https://example.com/post#:~:text=before-,%E0%A4%A,-after"), null);
  assertEquals(parseFragment("https://example.com/post##invalid%E0%A4%A"), null);
  assertEquals(parseFragment("https://example.com/post#:~:text=invalid%"), null);
  assertEquals(parseFragment("https://example.com/post#:~:text=%ZZ"), null);
});


Deno.test("URL Generator - toTextFragmentUrl", () => {
  const url1 = toTextFragmentUrl("https://example.com/post", {
    exact: "hello world",
  });
  assertEquals(url1, "https://example.com/post#:~:text=hello%20world");

  const url2 = toTextFragmentUrl("https://example.com/post", {
    exact: "target",
    prefix: "before",
    suffix: "after",
  });
  assertEquals(url2, "https://example.com/post#:~:text=before-,target,-after");
});

Deno.test("URL Generator - toFragmentionUrl", () => {
  const url1 = toFragmentionUrl("https://example.com/post", "hello world");
  assertEquals(url1, "https://example.com/post##hello+world");

  const url2 = toFragmentionUrl("https://example.com/post", "hello world", 2);
  assertEquals(url2, "https://example.com/post##hello+world++2");
});

Deno.test("URL Validator - isValidHttpUrl", () => {
  assertEquals(isValidHttpUrl("https://example.com"), true);
  assertEquals(isValidHttpUrl("http://example.com/sub/path?query=1"), true);
  assertEquals(isValidHttpUrl("javascript:alert(1)"), false);
  assertEquals(isValidHttpUrl("ftp://example.com"), false);
  assertEquals(isValidHttpUrl("data:text/plain,hello"), false);
  assertEquals(isValidHttpUrl(""), false);
  assertEquals(isValidHttpUrl("not-a-url"), false);
});
