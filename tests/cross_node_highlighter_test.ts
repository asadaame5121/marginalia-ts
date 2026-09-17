import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { highlightRange, removeHighlight } from "../src/dom/highlighter.ts";

Deno.test("Highlighter - 複数テキストノードおよびインライン要素をまたぐハイライト", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="target-p">吾輩は<span>猫</span>である。名前は<b>まだ</b>無い。</p>
    </article>
  `);
  const doc = dom.window.document;
  const p = doc.getElementById("target-p")!;
  const span = p.querySelector("span")!;
  const b = p.querySelector("b")!;

  // 選択範囲: "猫である。名前はまだ" (span 内の "猫" から b 内の "まだ" まで)
  const range = doc.createRange();
  range.setStart(span.firstChild!, 0); // "猫"
  range.setEnd(b.firstChild!, 2); // "まだ"

  const mark = highlightRange(range, {
    id: "cross-node-1",
    className: "test-highlight",
  });

  assertNotEquals(mark, null);

  // ハイライト要素が作成されていること
  const marks = p.querySelectorAll('mark[data-annotation-id="cross-node-1"]');
  assertEquals(marks.length >= 1, true);

  // ハイライトされたテキスト全体が "猫である。名前はまだ" に一致すること
  const highlightedText = Array.from(marks).map((m) => (m as Element).textContent).join("");
  assertEquals(highlightedText, "猫である。名前はまだ");

  // DOM構造が破壊されていないこと (span と b が依然として存在している)
  assertNotEquals(p.querySelector("span"), null);
  assertNotEquals(p.querySelector("b"), null);

  // ハイライト解除で元通りに戻ること
  removeHighlight(p, "cross-node-1");
  const remainingMarks = p.querySelectorAll('mark[data-annotation-id="cross-node-1"]');
  assertEquals(remainingMarks.length, 0);
  assertEquals(p.textContent, "吾輩は猫である。名前はまだ無い。");
});

Deno.test("Highlighter - 複数ブロック要素（段落）をまたぐハイライトでDOM構造が破壊されないこと", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">段落1のテキストです。</p>
      <p id="p2">段落2のテキストです。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p1 = doc.getElementById("p1")!;
  const p2 = doc.getElementById("p2")!;

  // p1 の "テキストです。" から p2 の "段落2の" までを選択
  const range = doc.createRange();
  range.setStart(p1.firstChild!, 4);
  range.setEnd(p2.firstChild!, 4);

  const mark = highlightRange(range, { id: "para-cross-1" });
  assertNotEquals(mark, null);

  // 重要: 段落1と段落2がそれぞれ独立して残っており、合体していないこと！
  const updatedP1 = doc.getElementById("p1");
  const updatedP2 = doc.getElementById("p2");
  assertNotEquals(updatedP1, null);
  assertNotEquals(updatedP2, null);

  // p1 内に mark があり、p2 内にも mark があること
  const marksP1 = updatedP1!.querySelectorAll('mark[data-annotation-id="para-cross-1"]');
  const marksP2 = updatedP2!.querySelectorAll('mark[data-annotation-id="para-cross-1"]');
  assertEquals(marksP1.length >= 1, true);
  assertEquals(marksP2.length >= 1, true);

  // p1 の中身が p2 に混ざっていないこと
  assertEquals(updatedP1!.textContent, "段落1のテキストです。");
  assertEquals(updatedP2!.textContent, "段落2のテキストです。");

  // 解除後に完全に元の状態に戻ること
  removeHighlight(container, "para-cross-1");
  assertEquals(doc.getElementById("p1")?.textContent, "段落1のテキストです。");
  assertEquals(doc.getElementById("p2")?.textContent, "段落2のテキストです。");
});

