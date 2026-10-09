import { assertEquals, assertNotEquals } from "@std/assert";
import { JSDOM } from "jsdom";
import { setupSelectionToolbar } from "../src/ui/toolbar.ts";
import { IndieAuthClient, IndieAuthMemoryStorage } from "../src/core/indieauth.ts";
import type { W3CAnnotation } from "../src/core/annotation.ts";

function setupDom() {
  const dom = new JSDOM(`<article id="content"><p id="p1">これはテスト段落です。</p></article>`);
  const doc = dom.window.document;
  const container = doc.getElementById("content")!;
  const p = doc.getElementById("p1")!;
  const range = doc.createRange();
  range.selectNodeContents(p);
  const sel = dom.window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  return { dom, doc, container };
}

Deno.test("UI - IndieAuth無効時（デフォルト）: IndieAuth UI要素は表示されない", async () => {
  const { dom, doc, container } = setupDom();

  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {},
  });

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  assertNotEquals(popoverEl, null);

  // IndieAuthセクションは存在しない
  const authSection = popoverEl.querySelector(".marginalia-indieauth-section");
  assertEquals(authSection, null);

  toolbar.destroy();
});

Deno.test("UI - IndieAuth有効時 & 未認証: 認証は必須ではなく、認証なしでも通常通り保存できる", async () => {
  const { dom, doc, container } = setupDom();
  const storage = new IndieAuthMemoryStorage();
  const authClient = new IndieAuthClient({
    clientId: "https://example.com/",
    redirectUri: "https://example.com/callback",
    storage,
  });

  let savedAnno: W3CAnnotation | null = null;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: (anno) => {
      savedAnno = anno;
    },
    config: {
      auth: {
        enabled: true,
        client: authClient,
      },
    },
  });

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  // IndieAuthセクションが存在する
  const authSection = popoverEl.querySelector(".marginalia-indieauth-section");
  assertNotEquals(authSection, null);

  // 未認証状態なので、手動で名前とコメントを入力して保存できる（認証必須ではない！）
  const nameInput = popoverEl.querySelector(".marginalia-input-name") as HTMLInputElement;
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;

  nameInput.value = "未認証ユーザー";
  commentTextarea.value = "認証なしでのコメント投稿です。";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertNotEquals(savedAnno, null);
  const resultAnno1 = savedAnno as unknown as W3CAnnotation;
  assertEquals(resultAnno1.creator?.name, "未認証ユーザー");
  assertEquals(resultAnno1.body[0].value, "認証なしでのコメント投稿です。");

  toolbar.destroy();
});

Deno.test("UI - IndieAuth有効時 & 未認証: サインインボタンクリックでstartAuthが呼び出される", async () => {
  const { dom, doc, container } = setupDom();
  const storage = new IndieAuthMemoryStorage();
  let startAuthCalledWith: string | null = null;

  const authClient = new IndieAuthClient({
    clientId: "https://example.com/",
    redirectUri: "https://example.com/callback",
    storage,
  });
  // startAuth をモック
  authClient.startAuth = (profileUrl: string) => {
    startAuthCalledWith = profileUrl;
    return Promise.resolve("https://auth.example.com/oauth?test=1");
  };

  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: () => {},
    config: {
      auth: {
        enabled: true,
        client: authClient,
      },
    },
  });

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  const authInput = popoverEl.querySelector(".marginalia-indieauth-input") as HTMLInputElement;
  const authBtn = popoverEl.querySelector(".marginalia-indieauth-btn-signin") as HTMLButtonElement;

  assertNotEquals(authInput, null);
  assertNotEquals(authBtn, null);

  authInput.value = "alice.example.com";
  authBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertEquals(startAuthCalledWith, "alice.example.com");

  toolbar.destroy();
});

Deno.test("UI - IndieAuth有効時 & 認証済み: ユーザー情報が表示され、保存時にcreatorに自動反映される", async () => {
  const { dom, doc, container } = setupDom();
  const storage = new IndieAuthMemoryStorage();
  storage.setUser({
    me: "https://bob.example.com/",
    name: "Bob Builder",
  });

  const authClient = new IndieAuthClient({
    clientId: "https://example.com/",
    redirectUri: "https://example.com/callback",
    storage,
  });

  let savedAnno: W3CAnnotation | null = null;
  const toolbar = setupSelectionToolbar(container, {
    onAnnotate: (anno) => {
      savedAnno = anno;
    },
    config: {
      auth: {
        enabled: true,
        client: authClient,
      },
    },
  });

  container.dispatchEvent(new dom.window.MouseEvent("mouseup", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 50));

  const toolbarEl = doc.querySelector(".marginalia-toolbar");
  const commentBtn = toolbarEl?.querySelector("button[data-action='comment']") as HTMLButtonElement;
  commentBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  const popoverEl = doc.querySelector(".marginalia-popover")!;
  // 認証済みユーザー情報バッジが存在すること
  const userBadge = popoverEl.querySelector(".marginalia-indieauth-user-badge");
  assertNotEquals(userBadge, null);
  assertEquals(userBadge?.textContent?.includes("Bob Builder"), true);

  // コメントのみ入力して保存（名前欄の手動入力は不要）
  const commentTextarea = popoverEl.querySelector("textarea") as HTMLTextAreaElement;
  const btnSubmit = popoverEl.querySelector(".btn-submit") as HTMLButtonElement;
  commentTextarea.value = "Bobからの認証付きコメント";

  btnSubmit.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assertNotEquals(savedAnno, null);
  const resultAnno2 = savedAnno as unknown as W3CAnnotation;
  assertEquals(resultAnno2.creator?.name, "Bob Builder");
  assertEquals(resultAnno2.creator?.url, "https://bob.example.com/");

  // サインアウトボタンをクリックすると未認証状態に戻ること
  const signoutBtn = popoverEl.querySelector(".marginalia-indieauth-btn-signout") as HTMLButtonElement;
  assertNotEquals(signoutBtn, null);
  signoutBtn.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));

  assertEquals(authClient.getUser(), null);

  toolbar.destroy();
});
