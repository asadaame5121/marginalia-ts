import { assertEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { createMarginalia } from "../src/index.ts";
import { renderAnnotation } from "../src/dom/marginalia.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";

const sampleAnnotation: W3CAnnotation = {
  "@context": "http://www.w3.org/ns/anno.jsonld",
  id: "urn:uuid:dup-test-1",
  type: "Annotation",
  created: "2026-09-16T12:00:00Z",
  body: [
    {
      type: "TextualBody",
      purpose: "commenting",
      value: "重複テスト用コメント",
    },
  ],
  target: {
    source: "https://example.com",
    selector: {
      type: "TextQuoteSelector",
      exact: "吾輩は猫である",
    },
  },
};

Deno.test("Render - renderAnnotation 単体で同一IDの二重描画を防止", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p>吾輩は猫である。名前はまだ無い。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  // 1回目の描画
  const res1 = renderAnnotation(container, sampleAnnotation);
  assertEquals(res1 !== null, true);

  // 2回目の描画 (同一アノテーション)
  const _res2 = renderAnnotation(container, sampleAnnotation);

  const marks = container.querySelectorAll(
    'mark[data-annotation-id="urn:uuid:dup-test-1"]',
  );
  const cards = doc.querySelectorAll(
    '.marginalia-card[data-annotation-id="urn:uuid:dup-test-1"]',
  );
  const badges = container.querySelectorAll(".marginalia-badge");

  assertEquals(marks.length, 1);
  assertEquals(cards.length, 1);
  assertEquals(badges.length, 1);
});

Deno.test("Render - createMarginalia().render() で同一アノテーションの重複描画を防止", () => {
  const dom = new JSDOM(`
    <article id="content">
      <p>吾輩は猫である。名前はまだ無い。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  const marginalia = createMarginalia({
    container,
    enableHashNavigation: false,
  });

  // 1回目
  marginalia.render([sampleAnnotation]);
  // 2回目（同一配列）
  marginalia.render([sampleAnnotation]);
  // 3回目（同じIDを含む新規配列）
  marginalia.render([sampleAnnotation]);

  const marks = container.querySelectorAll(
    'mark[data-annotation-id="urn:uuid:dup-test-1"]',
  );
  const cards = doc.querySelectorAll(
    '.marginalia-card[data-annotation-id="urn:uuid:dup-test-1"]',
  );
  const badges = container.querySelectorAll(".marginalia-badge");

  assertEquals(marks.length, 1);
  assertEquals(cards.length, 1);
  assertEquals(badges.length, 1);
});

Deno.test("Render - highlight color and reaction badge", () => {
  const dom = new JSDOM(`<article id="content"><p>赤色と拍手</p></article>`);
  const container = dom.window.document.getElementById("content")!;
  const colored: W3CAnnotation = {
    ...sampleAnnotation,
    id: "urn:uuid:red",
    body: [{ type: "TextualBody", purpose: "highlighting", value: "red" }],
    target: {
      source: "https://example.com",
      selector: { type: "TextQuoteSelector", exact: "赤色" },
    },
  };
  const reacted: W3CAnnotation = {
    ...sampleAnnotation,
    id: "urn:uuid:reaction",
    body: [{ type: "TextualBody", purpose: "tagging", value: "👏" }],
    target: {
      source: "https://example.com",
      selector: { type: "TextQuoteSelector", exact: "拍手" },
    },
  };

  renderAnnotation(container, colored);
  renderAnnotation(container, reacted);
  assertEquals(
    container.querySelector("mark")?.classList.contains(
      "marginalia-highlight--red",
    ),
    true,
  );
  assertEquals(
    container.querySelector(".marginalia-reaction")?.textContent,
    "👏",
  );
});
