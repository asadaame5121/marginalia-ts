import { extractSelectorFromRange } from "../dom/matcher.ts";
import { toTextFragmentUrl } from "../core/url.ts";
import { removeHighlight } from "../dom/highlighter.ts";
import {
  createHighlightAnnotation,
  createCommentAnnotation,
  type W3CAnnotation,
} from "../core/annotation.ts";

export interface ToolbarHandlers {
  onAnnotate: (annotation: W3CAnnotation) => void | Promise<void>;
  onHighlightCreated?: (range: Range, annotation: W3CAnnotation) => void;
  onError?: (error: unknown) => void;
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
  getActiveRange: () => Range | null;
  onClose: () => void;
  onOpenComment: (range: Range) => void;
}

function createToolbarElement(options: CreateToolbarOptions): HTMLElement {
  const { doc, win, container, handlers, getActiveRange, onClose, onOpenComment } = options;
  const toolbar = doc.createElement("div");
  toolbar.className = "marginalia-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "テキスト注釈ツールバー");

  // 1. ハイライトボタン
  const btnHighlight = doc.createElement("button");
  btnHighlight.setAttribute("type", "button");
  btnHighlight.setAttribute("aria-label", "テキストをハイライト");
  btnHighlight.setAttribute("data-action", "highlight");
  btnHighlight.innerHTML = "<span>🖍️</span> ハイライト";
  btnHighlight.addEventListener("click", async () => {
    const range = getActiveRange();
    if (!range) return;
    const selector = extractSelectorFromRange(range, container);
    const anno = createHighlightAnnotation({
      source: win.location.href,
      selector,
    });
    handlers.onHighlightCreated?.(range, anno);
    onClose();
    win.getSelection()?.removeAllRanges();

    try {
      await handlers.onAnnotate(anno);
    } catch (err) {
      removeHighlight(container, anno.id);
      handlers.onError?.(err);
    }
  });

  // 2. コメントボタン
  const btnComment = doc.createElement("button");
  btnComment.setAttribute("type", "button");
  btnComment.setAttribute("aria-label", "コメントを追加");
  btnComment.setAttribute("data-action", "comment");
  btnComment.innerHTML = "<span>💬</span> コメント";
  btnComment.addEventListener("click", () => {
    const range = getActiveRange();
    if (!range) return;
    onOpenComment(range);
  });

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

  toolbar.append(btnHighlight, btnComment, btnCopyLink);
  return toolbar;
}

interface CreatePopoverOptions {
  doc: Document;
  win: Window;
  container: HTMLElement;
  handlers: ToolbarHandlers;
  getActiveRange: () => Range | null;
  onClose: () => void;
}

function createCommentPopoverElement(options: CreatePopoverOptions): HTMLElement {
  const { doc, win, container, handlers, getActiveRange, onClose } = options;
  const popover = doc.createElement("div");
  popover.className = "marginalia-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-modal", "false");
  popover.setAttribute("aria-label", "コメント入力フォーム");

  const textarea = doc.createElement("textarea");
  textarea.placeholder = "コメントを入力...";
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
    const commentText = textarea.value.trim();
    const range = getActiveRange();
    if (!commentText || !range) return;

    btnSubmit.disabled = true;
    btnCancel.disabled = true;
    btnSubmit.textContent = "保存中...";

    const selector = extractSelectorFromRange(range, container);
    const anno = createCommentAnnotation({
      source: win.location.href,
      selector,
      comment: commentText,
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
      errorDiv.textContent = "保存に失敗しました。再試行してください。";
      errorDiv.style.display = "block";
      handlers.onError?.(err);
    }
  });

  actions.append(btnCancel, btnSubmit);
  popover.append(textarea, errorDiv, actions);
  return popover;
}

/**
 * テキスト選択ツールバーおよびコメントポップオーバーの管理
 */
export function setupSelectionToolbar(
  container: HTMLElement,
  handlers: ToolbarHandlers
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
      getActiveRange: () => activeRange,
      onClose: removeElements,
      onOpenComment: showCommentPopover,
    });

    doc.body.appendChild(toolbarEl);
    const tbWidth = toolbarEl.offsetWidth || 240;
    toolbarEl.style.left = `${scrollX + rect.left + rect.width / 2 - tbWidth / 2}px`;
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
      getActiveRange: () => activeRange,
      onClose: removeElements,
    });

    doc.body.appendChild(popoverEl);
    popoverEl.style.left = `${scrollX + rect.left}px`;
    popoverEl.style.top = `${scrollY + rect.bottom + 8}px`;

    const textarea = popoverEl.querySelector("textarea");
    textarea?.focus();
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
