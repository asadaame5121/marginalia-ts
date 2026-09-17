import { assertEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { createMarginalia } from "../src/index.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";

const sampleAnnotations: W3CAnnotation[] = [
  {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id: "urn:uuid:destroy-test-1",
    type: "Annotation",
    created: "2026-09-16T12:00:00Z",
    body: [
      {
        type: "TextualBody",
        purpose: "commenting",
        value: "吾輩のコメント",
      },
    ],
    target: {
      source: "https://example.com",
      selector: {
        type: "TextQuoteSelector",
        exact: "吾輩は猫である",
      },
    },
  },
  {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id: "urn:uuid:destroy-test-2",
    type: "Annotation",
    created: "2026-09-16T12:00:00Z",
    body: [
      {
        type: "TextualBody",
        purpose: "highlighting",
      },
    ],
    target: {
      source: "https://example.com",
      selector: {
        type: "TextQuoteSelector",
        exact: "名前はまだ無い",
      },
    },
  },
];

Deno.test("Marginalia - destroy() でDOM復元およびカード・バッジ・ハイライトの完全除去", () => {
  const initialHtml = `<p>吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。</p>`;
  const dom = new JSDOM(`
    <article id="content">
      ${initialHtml}
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const originalText = container.textContent;

  const marginalia = createMarginalia({
    container,
    enableHashNavigation: false,
  });

  // レンダリング実行
  marginalia.render(sampleAnnotations);

  // レンダリング後は mark, card, badge が存在することを確認
  assertEquals(container.querySelectorAll("mark.marginalia-highlight").length >= 2, true);
  assertEquals(doc.querySelectorAll(".marginalia-card").length, 1);
  assertEquals(container.querySelectorAll(".marginalia-badge").length, 1);

  // destroy() 実行
  marginalia.destroy();

  // 1. 全ての mark.marginalia-highlight がアンラップされて除去されていること
  const remainingMarks = container.querySelectorAll("mark.marginalia-highlight");
  assertEquals(remainingMarks.length, 0);

  // 2. 全ての marginalia-card がDOMから除去されていること
  const remainingCards = doc.querySelectorAll(".marginalia-card");
  assertEquals(remainingCards.length, 0);

  // 3. 全ての marginalia-badge がDOMから除去されていること
  const remainingBadges = doc.querySelectorAll(".marginalia-badge");
  assertEquals(remainingBadges.length, 0);

  // 4. コンテナ内のテキストが元通り完全に復元されていること
  assertEquals(container.textContent, originalText);
});
