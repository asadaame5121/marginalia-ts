import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { setupSelectionToolbar } from "../src/ui/toolbar.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";
import defaultConfig from "../config.json" with { type: "json" };

Deno.test("Config - コメント機能が閉鎖 (enabled: false) の場合、ツールバーにコメントボタンが表示されない", async () => {
  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {},
    config: {
      features: {
        comments: {
          enabled: false,
        },
      },
    },
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  assertNotEquals(toolbarEl, null);

  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']");
  assertEquals(commentBtn, null);

  toolbar.destroy();
});

Deno.test("Config - フォーム各項目のプレースホルダーが config.json で制御され反映される", async () => {
  const customConfig = {
    form: {
      name: {
        placeholder: "カスタム名前プレースホルダー",
        required: true,
      },
      url: {
        placeholder: "カスタムURLプレースホルダー",
        required: false,
      },
      comment: {
        placeholder: "カスタムコメントプレースホルダー",
        required: true,
      },
    },
  };

  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {},
    config: customConfig,
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  assertNotEquals(commentBtn, null);
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover");
  assertNotEquals(popoverEl, null);

  const nameInput = popoverEl?.querySelector(".marginalia-input-name") as HTMLInputElement;
  assertNotEquals(nameInput, null);
  assertEquals(nameInput.placeholder, "カスタム名前プレースホルダー");

  const urlInput = popoverEl?.querySelector(".marginalia-input-url") as HTMLInputElement;
  assertNotEquals(urlInput, null);
  assertEquals(urlInput.placeholder, "カスタムURLプレースホルダー");

  const commentTextarea = popoverEl?.querySelector(".marginalia-textarea-comment, textarea") as HTMLTextAreaElement;
  assertNotEquals(commentTextarea, null);
  assertEquals(commentTextarea.placeholder, "カスタムコメントプレースホルダー");

  toolbar.destroy();
});

Deno.test("Form Validation - 名前欄が未入力の場合にエラーとなり保存されない", async () => {
  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  let annotateCalled = false;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {
      annotateCalled = true;
    },
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  const nameInput = popoverEl.querySelector(".marginalia-input-name") as HTMLInputElement;
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;
  const errorDiv = popoverEl.querySelector(".marginalia-error-msg") as HTMLElement;

  // 名前は空のまま、コメントのみ入力
  nameInput.value = "   ";
  commentTextarea.value = "有益なコメント";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertEquals(annotateCalled, false);
  assertEquals(errorDiv.style.display, "block");
  assertEquals(errorDiv.textContent, defaultConfig.messages.nameRequired);

  toolbar.destroy();
});

Deno.test("Form Validation - 名前入力済み・URL空でも正常に保存できる (URLはオプション値)", async () => {
  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  let savedAnno: W3CAnnotation | null = null;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: (anno) => {
      savedAnno = anno;
    },
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  const nameInput = popoverEl.querySelector(".marginalia-input-name") as HTMLInputElement;
  const urlInput = popoverEl.querySelector(".marginalia-input-url") as HTMLInputElement;
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;

  nameInput.value = "山田太郎";
  urlInput.value = "";
  commentTextarea.value = "素晴らしい！";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertNotEquals(savedAnno, null);
  const resultAnno1 = savedAnno as unknown as W3CAnnotation;
  assertEquals(resultAnno1.creator?.name, "山田太郎");
  assertEquals(resultAnno1.creator?.url, undefined);

  toolbar.destroy();
});

Deno.test("Form Validation - 名前とURL入力時に両方が creator に保存される", async () => {
  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  let savedAnno: W3CAnnotation | null = null;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: (anno) => {
      savedAnno = anno;
    },
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  const nameInput = popoverEl.querySelector(".marginalia-input-name") as HTMLInputElement;
  const urlInput = popoverEl.querySelector(".marginalia-input-url") as HTMLInputElement;
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;

  nameInput.value = "佐藤花子";
  urlInput.value = "https://example.com/hanako";
  commentTextarea.value = "同感です。";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertNotEquals(savedAnno, null);
  const resultAnno2 = savedAnno as unknown as W3CAnnotation;
  assertEquals(resultAnno2.creator?.name, "佐藤花子");
  assertEquals(resultAnno2.creator?.url, "https://example.com/hanako");

  toolbar.destroy();
});

Deno.test("Form Validation - 不正なURL形式の場合はエラーとなり保存されない", async () => {
  const dom = new JSDOM(`<article id="content"><p id="p1">テスト本文テキスト</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;

  let annotateCalled = false;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {
      annotateCalled = true;
    },
  });

  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  const nameInput = popoverEl.querySelector(".marginalia-input-name") as HTMLInputElement;
  const urlInput = popoverEl.querySelector(".marginalia-input-url") as HTMLInputElement;
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;
  const errorDiv = popoverEl.querySelector(".marginalia-error-msg") as HTMLElement;

  nameInput.value = "佐藤花子";
  urlInput.value = "not-a-valid-url";
  commentTextarea.value = "同感です。";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertEquals(annotateCalled, false);
  assertEquals(errorDiv.style.display, "block");
  assertEquals(errorDiv.textContent, defaultConfig.messages.invalidUrl);

  toolbar.destroy();
});
