import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { navigateToCurrentHash } from "../src/dom/navigator.ts";

Deno.test("Navigator - navigateToCurrentHash でハッシュに応じた要素をハイライト", () => {
  const dom = new JSDOM(
    `
    <article id="content">
      <p>この文章の中にターゲットのキーワードが存在します。</p>
    </article>
  `,
    { url: "https://example.com/post#:~:text=ターゲットのキーワード" }
  );

  const doc = dom.window.document;
  const container = doc.getElementById("content")!;

  // JSDOM に scrollIntoView がない場合のモック
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};

  const mark = navigateToCurrentHash(container);
  assertNotEquals(mark, null);
  assertEquals(mark?.textContent, "ターゲットのキーワード");
  assertEquals(mark?.classList.contains("marginalia-target"), true);
});
