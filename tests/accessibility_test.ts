import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { setupSelectionToolbar } from "../src/ui/toolbar.ts";

Deno.test("Accessibility - ツールバーおよびポップオーバーのARIA属性とtype設定", async () => {
  const dom = new JSDOM(`
    <article id="content">
      <p id="p1">アクセシビリティ改善テスト用テキスト</p>
    </article>
  `);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {},
  });

  // 選択範囲を作成
  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  // mouseup イベントを発火させてツールバーを表示
  const event = new dom.window.MouseEvent("mouseup", { bubbles: true });
  container.dispatchEvent(event);

  // handleSelection の setTimeout 20ms を待機
  await new Promise((resolve) => setTimeout(resolve, 50));

  // ツールバー要素の検証
  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  assertNotEquals(toolbarEl, null);
  assertEquals(toolbarEl?.getAttribute("role"), "toolbar");
  assertEquals(Boolean(toolbarEl?.getAttribute("aria-label")), true);

  // ツールバー内ボタンの検証
  const buttons = toolbarEl?.querySelectorAll("button");
  assertNotEquals(buttons, null);
  assertEquals(buttons!.length >= 3, true);
  for (const btn of Array.from(buttons!) as HTMLButtonElement[]) {
    assertEquals(btn.getAttribute("type"), "button");
    assertEquals(Boolean(btn.getAttribute("aria-label")), true);
  }

  // コメントボタンをクリックしてポップオーバーを表示
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") || buttons![1];
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  // ポップオーバー要素の検証
  const popoverEl = doc.querySelector(".marginalia-popover");
  assertNotEquals(popoverEl, null);
  assertEquals(popoverEl?.getAttribute("role"), "dialog");
  assertEquals(Boolean(popoverEl?.getAttribute("aria-label")), true);

  // textarea の検証
  const textarea = popoverEl?.querySelector("textarea");
  assertNotEquals(textarea, null);
  assertEquals(Boolean(textarea?.getAttribute("aria-label")), true);

  // ポップオーバー内ボタンの検証
  const popoverButtons = popoverEl?.querySelectorAll("button");
  assertNotEquals(popoverButtons, null);
  assertEquals(popoverButtons!.length >= 2, true);
  for (const btn of Array.from(popoverButtons!) as HTMLButtonElement[]) {
    assertEquals(btn.getAttribute("type"), "button");
    assertEquals(Boolean(btn.getAttribute("aria-label")), true);
  }

  toolbar.destroy();
});
