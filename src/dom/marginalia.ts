import type { W3CAnnotation } from "../core/annotation.ts";
import { highlightSelector } from "./highlighter.ts";
import { isValidHttpUrl } from "../core/url.ts";

export interface MarginaliaCardOptions {
  id: string;
  comment: string;
  created?: string;
  author?: string;
  authorUrl?: string;
}

export interface RenderResult {
  mark: HTMLElement;
  card?: HTMLElement;
}

/**
 * ハイライト要素の近傍に注釈（マージナリア）カードを配置する
 * XSS対策: コメントや作者名は必ず textContent を通してプレーンテキストとして安全に設定する
 */
export function attachMarginaliaCard(
  mark: HTMLElement,
  options: MarginaliaCardOptions
): HTMLElement {
  const doc = mark.ownerDocument || document;

  // 既に同一IDのカードが存在する場合は二重作成しない
  const existingCard = doc.querySelector(`.marginalia-card[data-annotation-id="${options.id}"]`) as HTMLElement | null;
  if (existingCard) return existingCard;

  // 1. マージナリアカード要素を生成
  const card = doc.createElement("aside");
  card.className = "marginalia-card";
  card.setAttribute("data-annotation-id", options.id);

  // コメントヘッダー（作成日時、投稿者名など）
  const header = doc.createElement("div");
  header.className = "marginalia-card-header";

  if (options.author) {
    const authorSpan = doc.createElement("span");
    authorSpan.className = "marginalia-card-author";

    if (options.authorUrl && isValidHttpUrl(options.authorUrl)) {
      const link = doc.createElement("a");
      link.href = options.authorUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = options.author;
      authorSpan.appendChild(link);
    } else {
      authorSpan.textContent = options.author;
    }
    header.appendChild(authorSpan);
  }

  if (options.created) {
    const time = doc.createElement("time");
    time.textContent = new Date(options.created).toLocaleString();
    header.appendChild(time);
  }
  card.appendChild(header);

  // コメント本文 (重要: textContent で安全に挿入し XSS を完全に防ぐ)
  const body = doc.createElement("div");
  body.className = "marginalia-card-body";
  body.textContent = options.comment;
  card.appendChild(body);

  // 2. トグルボタンをハイライト要素の直後に付加（インラインバッジ）
  let toggleBtn = mark.nextElementSibling as HTMLButtonElement | null;
  if (!toggleBtn || !toggleBtn.classList.contains("marginalia-badge")) {
    toggleBtn = doc.createElement("button");
    toggleBtn.className = "marginalia-badge";
    toggleBtn.setAttribute("type", "button");
    toggleBtn.setAttribute("aria-label", "Toggle comment");
    toggleBtn.textContent = "💬";
    mark.parentNode?.insertBefore(toggleBtn, mark.nextSibling);
  }

  // 3. クリック時のトグル開閉処理
  const toggleAction = (e?: Event) => {
    if (e) e.stopPropagation();
    const isActive = card.classList.toggle("is-active");
    mark.classList.toggle("is-active", isActive);
  };

  toggleBtn.addEventListener("click", toggleAction);
  mark.addEventListener("click", () => {
    card.classList.add("is-active");
    mark.classList.add("is-active");
  });

  // 4. カードのDOM挿入（親ブロック要素の直後、または mark の直後）
  const parentBlock = mark.closest("p, li, blockquote, div, h1, h2, h3, h4, h5, h6") || mark;
  if (parentBlock.nextSibling) {
    parentBlock.parentNode?.insertBefore(card, parentBlock.nextSibling);
  } else {
    parentBlock.parentNode?.appendChild(card);
  }

  return card;
}

/**
 * W3CAnnotation オブジェクトをDOMにレンダリングする
 */
export function renderAnnotation(
  container: HTMLElement,
  annotation: W3CAnnotation
): RenderResult | null {
  const selector = annotation.target?.selector;
  if (!selector || selector.type !== "TextQuoteSelector") return null;

  // 既に同一IDのハイライトが存在する場合は二重描画を防止
  const existingMark = container.querySelector(
    `mark[data-annotation-id="${annotation.id}"]`
  ) as HTMLElement | null;
  if (existingMark) {
    const doc = container.ownerDocument || document;
    const existingCard = doc.querySelector(
      `.marginalia-card[data-annotation-id="${annotation.id}"]`
    ) as HTMLElement | null;
    return { mark: existingMark, card: existingCard || undefined };
  }

  // 1. テキストをハイライト
  const mark = highlightSelector(container, selector, { id: annotation.id });
  if (!mark) return null;

  // 2. コメント本文があればマージナリアカードをアタッチ
  const commentBody = annotation.body?.find((b) => b.purpose === "commenting");
  let card: HTMLElement | undefined;

  if (commentBody && commentBody.value) {
    let author: string | undefined;
    let authorUrl: string | undefined;
    if (annotation.creator) {
      if (typeof annotation.creator === "string") {
        author = annotation.creator;
      } else {
        author = annotation.creator.name;
        authorUrl = annotation.creator.url;
      }
    }

    card = attachMarginaliaCard(mark, {
      id: annotation.id,
      comment: commentBody.value,
      created: annotation.created,
      author,
      authorUrl,
    });
  }

  return { mark, card };
}

/**
 * コンテナおよび関連ドキュメントに存在するすべての注釈カードとバッジを削除する
 */
export function clearAllMarginalia(container: HTMLElement): void {
  const doc = container.ownerDocument || document;
  const cards = doc.querySelectorAll(".marginalia-card");
  cards.forEach((card) => {
    card.parentNode?.removeChild(card);
  });

  const badges = container.querySelectorAll(".marginalia-badge");
  badges.forEach((badge) => {
    badge.parentNode?.removeChild(badge);
  });
}
