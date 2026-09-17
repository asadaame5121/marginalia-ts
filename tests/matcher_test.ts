import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { findRangeBySelector, extractSelectorFromRange } from "../src/dom/matcher.ts";

Deno.test("DOM Matcher - 単一のテキストマッチング", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">吾輩は猫である。名前はまだ無い。</p>
      <p id="p2">どこで生れたかとんと見当がつかぬ。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  const range = findRangeBySelector(container, {
    type: "TextQuoteSelector",
    exact: "名前はまだ無い",
    prefix: "吾輩は猫である。",
    suffix: "。",
  });

  assertNotEquals(range, null);
  assertEquals(range?.toString(), "名前はまだ無い");
});

Deno.test("DOM Matcher - 同一単語が複数ある場合の prefix/suffix による区別", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p>林檎がひとつ、林檎がふたつ、林檎がみっつある。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  // 2番目の「林檎」を特定
  const range2 = findRangeBySelector(container, {
    type: "TextQuoteSelector",
    exact: "林檎",
    prefix: "ひとつ、",
    suffix: "がふたつ",
  });

  assertNotEquals(range2, null);
  assertEquals(range2?.toString(), "林檎");
  // 開始位置オフセットを検証 (「林檎がひとつ、」の後なので7文字目)
  assertEquals(range2?.startOffset, 7);
});

Deno.test("DOM Matcher - 複数要素にまたがるテキストまたは入れ子要素のテキスト", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p>この文章は<strong>重要な部分</strong>を含んでいます。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  const range = findRangeBySelector(container, {
    type: "TextQuoteSelector",
    exact: "重要な部分",
    prefix: "この文章は",
    suffix: "を含んでいます。",
  });

  assertNotEquals(range, null);
  assertEquals(range?.toString(), "重要な部分");
});

Deno.test("DOM Selector - Range からの prefix, exact, suffix 抽出", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="target-p">すべての国民は、健康で文化的な最低限度の生活を営む権利を有する。</p>
    </article>
  `);
  const doc = dom.window.document;
  const p = doc.getElementById("target-p")!;
  const textNode = p.firstChild!;

  const range = doc.createRange();
  // 「健康で文化的な最低限度の生活」を選択 (インデックス8から14文字: 8〜22)
  range.setStart(textNode, 8);
  range.setEnd(textNode, 22);

  const selector = extractSelectorFromRange(range, p);

  assertEquals(selector.exact, "健康で文化的な最低限度の生活");
  assertEquals(selector.prefix, "すべての国民は、");
  assertEquals(selector.suffix, "を営む権利を有する。");
});
