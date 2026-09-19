import { findRangeBySelector } from "./matcher.ts";
import type { TextQuoteSelector } from "../core/annotation.ts";

export interface HighlightOptions {
  id?: string;
  className?: string;
}

/**
 * Range を <mark> 要素で安全にラップしてハイライトを適用する
 */
/**
 * Range と交差するすべてのテキストノードとそのオフセット区間を収集する
 */
function getTextNodesInRange(
  range: Range,
): { node: Text; startOffset: number; endOffset: number }[] {
  const root = range.commonAncestorContainer.nodeType === 3
    ? range.commonAncestorContainer.parentNode || range.commonAncestorContainer
    : range.commonAncestorContainer;
  const doc = root.ownerDocument || document;
  const walker = doc.createTreeWalker(root, 4, /* SHOW_TEXT */ null);
  const result: { node: Text; startOffset: number; endOffset: number }[] = [];

  let curr = walker.nextNode();
  while (curr) {
    const textNode = curr as Text;
    let isInside = false;
    try {
      isInside = range.intersectsNode(textNode);
    } catch {
      isInside = false;
    }

    if (isInside) {
      let startOffset = 0;
      let endOffset = textNode.length;

      if (textNode === range.startContainer) {
        startOffset = range.startOffset;
      }
      if (textNode === range.endContainer) {
        endOffset = range.endOffset;
      }

      if (endOffset > startOffset) {
        result.push({ node: textNode, startOffset, endOffset });
      }
    }
    curr = walker.nextNode();
  }

  return result;
}

/**
 * Range を <mark> 要素で安全にラップしてハイライトを適用する
 * 複数テキストノードやブロック要素をまたぐ場合でもDOM構造を破壊しない
 */
export function highlightRange(
  range: Range,
  options?: HighlightOptions,
): HTMLElement {
  const doc = range.startContainer.ownerDocument || document;
  const textNodes = getTextNodesInRange(range);

  if (textNodes.length === 0) {
    const mark = doc.createElement("mark");
    mark.className = `marginalia-highlight ${options?.className || ""}`.trim();
    if (options?.id) mark.setAttribute("data-annotation-id", options.id);
    return mark;
  }

  const createdMarks: HTMLElement[] = [];

  for (const { node, startOffset, endOffset } of textNodes) {
    let targetNode = node;
    // 後ろ側を先に切り出す
    if (endOffset < targetNode.length) {
      targetNode.splitText(endOffset);
    }
    // 前側を切り出す
    if (startOffset > 0) {
      targetNode = targetNode.splitText(startOffset);
    }

    const mark = doc.createElement("mark");
    mark.className = `marginalia-highlight ${options?.className || ""}`.trim();
    if (options?.id) {
      mark.setAttribute("data-annotation-id", options.id);
    }

    const parent = targetNode.parentNode;
    if (parent) {
      parent.insertBefore(mark, targetNode);
      mark.appendChild(targetNode);
      createdMarks.push(mark);
    }
  }

  return createdMarks[0] || doc.createElement("mark");
}

/**
 * TextQuoteSelector を基に該当箇所を探してハイライトする
 */
export function highlightSelector(
  container: HTMLElement,
  selector: TextQuoteSelector,
  options?: HighlightOptions,
): HTMLElement | null {
  const range = findRangeBySelector(container, selector);
  if (!range) return null;

  return highlightRange(range, options);
}

/**
 * 特定のアノテーションIDを持つハイライトを解除し、元のDOM構造に戻す
 */
export function removeHighlight(container: HTMLElement, id: string): void {
  const reactions = container.querySelectorAll(
    `.marginalia-reaction[data-annotation-id="${id}"]`,
  );
  reactions.forEach((reaction) => reaction.parentNode?.removeChild(reaction));
  const marks = container.querySelectorAll(`mark[data-annotation-id="${id}"]`);
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
  container.normalize();
}

/**
 * コンテナ内のすべてのハイライトを解除し、元のDOM構造・テキストノードを復元する
 */
export function clearAllHighlights(container: HTMLElement): void {
  const marks = container.querySelectorAll("mark.marginalia-highlight");
  marks.forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) return;
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  });
  container.normalize();
}
