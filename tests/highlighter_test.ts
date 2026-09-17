import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { highlightRange, highlightSelector } from "../src/dom/highlighter.ts";

Deno.test("Highlighter - highlightRange でテキストを <mark> で囲む", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">これはテストの文章です。</p>
    </article>
  `);
  const doc = dom.window.document;
  const p = doc.getElementById("p1")!;
  const textNode = p.firstChild!;

  const range = doc.createRange();
  // 「テスト」を選択 (3〜6文字目)
  range.setStart(textNode, 3);
  range.setEnd(textNode, 6);

  const mark = highlightRange(range, {
    id: "anno-1",
    className: "custom-highlight",
  });

  assertNotEquals(mark, null);
  assertEquals(mark.tagName.toLowerCase(), "mark");
  assertEquals(mark.getAttribute("data-annotation-id"), "anno-1");
  assertEquals(mark.classList.contains("custom-highlight"), true);
  assertEquals(mark.textContent, "テスト");
  assertEquals(p.innerHTML.includes("<mark"), true);
});

Deno.test("Highlighter - highlightSelector でセレクタから直接ハイライト", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p>重要なキーフレーズがここにあります。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  const mark = highlightSelector(container, {
    type: "TextQuoteSelector",
    exact: "キーフレーズ",
    prefix: "重要な",
    suffix: "がここに",
  }, { id: "anno-2" });

  assertNotEquals(mark, null);
  assertEquals(mark?.textContent, "キーフレーズ");
  assertEquals(mark?.getAttribute("data-annotation-id"), "anno-2");
});
