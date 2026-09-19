import { extractSelectorFromRange } from "../dom/matcher.ts";
import { isValidHttpUrl, toTextFragmentUrl } from "../core/url.ts";
import { removeHighlight } from "../dom/highlighter.ts";
import {
  createCommentAnnotation,
  createHighlightAnnotation,
  createReactionAnnotation,
  type HighlightColor,
  type W3CAnnotation,
} from "../core/annotation.ts";
import { type MarginaliaConfig, resolveConfig } from "../core/config.ts";

export interface ToolbarHandlers {
  onAnnotate: (annotation: W3CAnnotation) => void | Promise<void>;
  onHighlightCreated?: (range: Range, annotation: W3CAnnotation) => void;
  onError?: (error: unknown) => void;
  config?: MarginaliaConfig;
}

export interface SelectionToolbar {
  destroy: () => void;
}

function getSafeRangeRect(range: Range) {
  if (typeof range.getBoundingClientRect === "function") {
    return range.getBoundingClientRect();
  }
  return { left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 };
}

interface CreateToolbarOptions {
  doc: Document;
  win: Window;
  container: HTMLElement;
  handlers: ToolbarHandlers;
  config: MarginaliaConfig;
  getActiveRange: () => Range | null;
  onClose: () => void;
  onOpenComment: (range: Range) => void;
}

function createToolbarElement(options: CreateToolbarOptions): HTMLElement {
  const {
    doc,
    win,
    container,
    handlers,
    getActiveRange,
    onClose,
    onOpenComment,
  } = options;
  const toolbar = doc.createElement("div");
  toolbar.className = "marginalia-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "テキスト注釈ツールバー");

  const submitSelection = async (
    create: (
      source: string,
      selector: ReturnType<typeof extractSelectorFromRange>,
    ) => W3CAnnotation,
  ) => {
    const range = getActiveRange();
    if (!range) return;
    const anno = create(
      win.location.href,
      extractSelectorFromRange(range, container),
    );
    handlers.onHighlightCreated?.(range, anno);
    onClose();
    win.getSelection()?.removeAllRanges();
    try {
      await handlers.onAnnotate(anno);
    } catch (err) {
      removeHighlight(container, anno.id);
      handlers.onError?.(err);
    }
  };

  const highlightButtons = (["red", "yellow", "green"] as HighlightColor[]).map(
    (color) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "marginalia-color-button";
      button.dataset.action = "highlight";
      button.dataset.color = color;
      button.setAttribute("aria-label", `${color}でハイライト`);
      button.textContent = "●";
      button.addEventListener(
        "click",
        () =>
          submitSelection((source, selector) =>
            createHighlightAnnotation({ source, selector, color })
          ),
      );
      return button;
    },
  );

  const reactionButtons = ["👍", "❤️", "😂", "🎉"].map((reaction) => {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "marginalia-reaction-button";
    button.dataset.action = "reaction";
    button.setAttribute("aria-label", `${reaction}でリアクション`);
    button.textContent = reaction;
    button.addEventListener(
      "click",
      () =>
        submitSelection((source, selector) =>
          createReactionAnnotation({ source, selector, reaction })
        ),
    );
    return button;
  });

  // 2. コメントボタン（configで有効な場合のみ）
  const commentsEnabled = options.config.features?.comments?.enabled !== false;
  let btnComment: HTMLButtonElement | null = null;
  if (commentsEnabled) {
    btnComment = doc.createElement("button");
    btnComment.setAttribute("type", "button");
    btnComment.setAttribute("aria-label", "コメントを追加");
    btnComment.setAttribute("data-action", "comment");
    btnComment.innerHTML = "<span>💬</span> コメント";
    btnComment.addEventListener("click", () => {
      const range = getActiveRange();
      if (!range) return;
      onOpenComment(range);
    });
  }

  // 3. リンクコピーボタン
  const btnCopyLink = doc.createElement("button");
  btnCopyLink.setAttribute("type", "button");
  btnCopyLink.setAttribute("aria-label", "テキストフラグメントリンクをコピー");
  btnCopyLink.setAttribute("data-action", "link");
  btnCopyLink.innerHTML = "<span>🔗</span> リンク";
  btnCopyLink.addEventListener("click", async () => {
    const range = getActiveRange();
    if (!range) return;
    const selector = extractSelectorFromRange(range, container);
    const url = toTextFragmentUrl(win.location.href, selector);
    if (win.navigator.clipboard) {
      await win.navigator.clipboard.writeText(url);
    }
    btnCopyLink.textContent = "コピー完了!";
    setTimeout(onClose, 1000);
  });

  toolbar.append(...highlightButtons);
  if (btnComment) toolbar.append(btnComment);
  toolbar.append(...reactionButtons, btnCopyLink);
  return toolbar;
}

interface CreatePopoverOptions {
  doc: Document;
  win: Window;
  container: HTMLElement;
  handlers: ToolbarHandlers;
  config: MarginaliaConfig;
  getActiveRange: () => Range | null;
  onClose: () => void;
}

function createCommentPopoverElement(
  options: CreatePopoverOptions,
): HTMLElement {
  const { doc, win, container, handlers, config, getActiveRange, onClose } =
    options;
  const popover = doc.createElement("div");
  popover.className = "marginalia-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-label", "コメント入力フォーム");

  // 名前入力欄（必須）
  const nameInput = doc.createElement("input");
  nameInput.type = "text";
  nameInput.className = "marginalia-input-name";
  nameInput.placeholder = config.form?.name?.placeholder ||
    "名前を入力（必須）";
  nameInput.setAttribute("aria-label", "お名前");

  // URL入力欄（任意）
  const urlInput = doc.createElement("input");
  urlInput.type = "url";
  urlInput.className = "marginalia-input-url";
  urlInput.placeholder = config.form?.url?.placeholder || "URLを入力 (任意)";
  urlInput.setAttribute("aria-label", "WebサイトURL");

  // コメント本文入力欄（必須）
  const textarea = doc.createElement("textarea");
  textarea.className = "marginalia-textarea-comment";
  textarea.placeholder = config.form?.comment?.placeholder ||
    "コメントを入力...";
  textarea.setAttribute("rows", "3");
  textarea.setAttribute("aria-label", "コメント本文");

  const errorDiv = doc.createElement("div");
  errorDiv.className = "marginalia-error-msg";
  errorDiv.style.display = "none";
  errorDiv.style.color = "#dc2626";
  errorDiv.style.fontSize = "12px";

  const actions = doc.createElement("div");
  actions.className = "marginalia-popover-actions";

  const btnCancel = doc.createElement("button");
  btnCancel.className = "btn-cancel";
  btnCancel.setAttribute("type", "button");
  btnCancel.setAttribute("aria-label", "キャンセル");
  btnCancel.textContent = "キャンセル";
  btnCancel.addEventListener("click", onClose);

  const btnSubmit = doc.createElement("button");
  btnSubmit.className = "btn-submit";
  btnSubmit.setAttribute("type", "button");
  btnSubmit.setAttribute("aria-label", "保存");
  btnSubmit.textContent = "保存";
  btnSubmit.addEventListener("click", async () => {
    errorDiv.style.display = "none";

    const name = nameInput.value.trim();
    if (!name) {
      errorDiv.textContent = config.messages?.nameRequired ||
        "名前を入力してください。";
      errorDiv.style.display = "block";
      nameInput.focus();
      return;
    }

    const urlVal = urlInput.value.trim();
    if (urlVal && !isValidHttpUrl(urlVal)) {
      errorDiv.textContent = config.messages?.invalidUrl ||
        "有効なURLを入力してください。";
      errorDiv.style.display = "block";
      urlInput.focus();
      return;
    }

    const commentText = textarea.value.trim();
    const range = getActiveRange();
    if (!commentText) {
      errorDiv.textContent = config.messages?.commentRequired ||
        "コメントを入力してください。";
      errorDiv.style.display = "block";
      textarea.focus();
      return;
    }
    if (!range) return;

    btnSubmit.disabled = true;
    btnCancel.disabled = true;
    btnSubmit.textContent = "保存中...";

    const selector = extractSelectorFromRange(range, container);
    const anno = createCommentAnnotation({
      source: win.location.href,
      selector,
      comment: commentText,
      author: name,
      url: urlVal || undefined,
    });

    handlers.onHighlightCreated?.(range, anno);

    try {
      await handlers.onAnnotate(anno);
      onClose();
      win.getSelection()?.removeAllRanges();
    } catch (err) {
      removeHighlight(container, anno.id);
      btnSubmit.disabled = false;
      btnCancel.disabled = false;
      btnSubmit.textContent = "保存";
      errorDiv.textContent = config.messages?.saveFailed ||
        "保存に失敗しました。再試行してください。";
      errorDiv.style.display = "block";
      handlers.onError?.(err);
    }
  });

  actions.append(btnCancel, btnSubmit);
  popover.append(nameInput, urlInput, textarea, errorDiv, actions);
  return popover;
}

/**
 * テキスト選択ツールバーおよびコメントポップオーバーの管理
 */
export function setupSelectionToolbar(
  container: HTMLElement,
  handlers: ToolbarHandlers,
): SelectionToolbar {
  const doc = container.ownerDocument || document;
  const win = doc.defaultView || window;

  let toolbarEl: HTMLElement | null = null;
  let popoverEl: HTMLElement | null = null;
  let activeRange: Range | null = null;

  function removeElements() {
    toolbarEl?.parentNode?.removeChild(toolbarEl);
    popoverEl?.parentNode?.removeChild(popoverEl);
    toolbarEl = null;
    popoverEl = null;
  }

  function handleSelection() {
    const sel = win.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) {
      removeElements();
      activeRange = null;
      return;
    }

    const range = sel.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) {
      removeElements();
      activeRange = null;
      return;
    }

    const text = range.toString().trim();
    if (!text) {
      removeElements();
      activeRange = null;
      return;
    }

    activeRange = range.cloneRange();
    showToolbar(range);
  }

  const config = resolveConfig(handlers.config);

  function showToolbar(range: Range) {
    removeElements();
    const rect = getSafeRangeRect(range);
    const scrollX = win.pageXOffset || doc.documentElement.scrollLeft || 0;
    const scrollY = win.pageYOffset || doc.documentElement.scrollTop || 0;

    toolbarEl = createToolbarElement({
      doc,
      win,
      container,
      handlers,
      config,
      getActiveRange: () => activeRange,
      onClose: removeElements,
      onOpenComment: showCommentPopover,
    });

    doc.body.appendChild(toolbarEl);
    const tbWidth = toolbarEl.offsetWidth || 240;
    toolbarEl.style.left = `${
      scrollX + rect.left + rect.width / 2 - tbWidth / 2
    }px`;
    toolbarEl.style.top = `${scrollY + rect.top - 44}px`;
  }

  function showCommentPopover(range: Range) {
    removeElements();
    const rect = getSafeRangeRect(range);
    const scrollX = win.pageXOffset || doc.documentElement.scrollLeft || 0;
    const scrollY = win.pageYOffset || doc.documentElement.scrollTop || 0;

    popoverEl = createCommentPopoverElement({
      doc,
      win,
      container,
      handlers,
      config,
      getActiveRange: () => activeRange,
      onClose: removeElements,
    });

    doc.body.appendChild(popoverEl);
    popoverEl.style.left = `${scrollX + rect.left}px`;
    popoverEl.style.top = `${scrollY + rect.bottom + 8}px`;

    const nameInput = popoverEl.querySelector(".marginalia-input-name") as
      | HTMLElement
      | null;
    (nameInput || popoverEl.querySelector("textarea"))?.focus();
  }

  const onMouseUp = () => setTimeout(handleSelection, 20);
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "Escape") removeElements();
  };

  container.addEventListener("mouseup", onMouseUp);
  container.addEventListener("touchend", onMouseUp);
  doc.addEventListener("keyup", onKeyUp);

  return {
    destroy: () => {
      container.removeEventListener("mouseup", onMouseUp);
      container.removeEventListener("touchend", onMouseUp);
      doc.removeEventListener("keyup", onKeyUp);
      removeElements();
    },
  };
}
