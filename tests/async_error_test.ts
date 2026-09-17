import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { createMarginalia } from "../src/index.ts";

Deno.test("Async - onAnnotate が Promise rejection を返した時に onError が呼ばれハイライトがロールバックされる", async () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">非同期エラーハンドリングのテスト用文章です。</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  let capturedError: unknown = null;
  const expectedError = new Error("ネットワークエラー: 保存に失敗しました");

  const marginalia = createMarginalia({
    container,
    enableHashNavigation: false,
    onAnnotate: async () => {
      await Promise.resolve();
      throw expectedError;
    },
    onError: (err: unknown) => {
      capturedError = err;
    },
  });

  // 選択範囲を作成
  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  // mouseup でツールバーを表示
  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));

  // 少し待機（ツールバー表示のタイマー待機）
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  assertNotEquals(toolbarEl, null);

  // ハイライトボタンをクリック
  const btnHighlight = toolbarEl?.querySelector("button");
  assertNotEquals(btnHighlight, null);

  btnHighlight?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  // 非同期処理の完了を待機
  await new Promise((resolve) => setTimeout(resolve, 50));

  // 1. onError が呼ばれたこと
  assertEquals(capturedError, expectedError);

  // 2. ハイライトがロールバック（削除）されていること
  const marks = container.querySelectorAll("mark.marginalia-highlight");
  assertEquals(marks.length, 0);

  marginalia.destroy();
});
