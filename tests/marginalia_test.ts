import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { attachMarginaliaCard, renderAnnotation } from "../src/dom/marginalia.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";

Deno.test("Marginalia - attachMarginaliaCard で注釈カードを安全に配置 (XSS防止)", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">これは<mark id="target-mark" data-annotation-id="anno-1">ハイライト</mark>されたテキストです。</p>
    </article>
  `);
  const doc = dom.window.document;
  const mark = doc.getElementById("target-mark")!;

  // 悪意のあるスクリプトを含むコメント
  const maliciousComment = "<script>alert('XSS')</script>安全なコメント";

  const card = attachMarginaliaCard(mark, {
    id: "anno-1",
    comment: maliciousComment,
    created: "2026-09-16T12:00:00Z",
  });

  assertNotEquals(card, null);
  // textContent として設定され、HTMLタグとして解釈されていないことを検証
  assertEquals(card.querySelector("script"), null);
  assertEquals(card.textContent?.includes("<script>alert('XSS')</script>"), true);
  assertEquals(card.getAttribute("data-annotation-id"), "anno-1");
});

Deno.test("Marginalia - renderAnnotation で W3CAnnotation をパースしてDOMに反映", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">春はあけぼの。やうやう白くなりゆく山ぎは。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  const annotation: W3CAnnotation = {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id: "anno-spring",
    type: "Annotation",
    created: "2026-09-16T12:00:00Z",
    body: [
      {
        type: "TextualBody",
        purpose: "commenting",
        value: "枕草子の冒頭です。",
      },
    ],
    target: {
      source: "https://example.com/makura",
      selector: {
        type: "TextQuoteSelector",
        exact: "春はあけぼの",
        suffix: "。やうやう",
      },
    },
  };

  const result = renderAnnotation(container, annotation);
  assertNotEquals(result, null);
  assertEquals(result?.mark.textContent, "春はあけぼの");
  assertEquals(result?.card?.textContent?.includes("枕草子の冒頭です。"), true);
});
