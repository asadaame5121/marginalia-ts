import { parseFragment } from "../core/url.ts";
import { findRangeBySelector } from "./matcher.ts";
import { highlightRange } from "./highlighter.ts";

/**
 * URL のハッシュ（Text Fragment または Fragmention）を検知し、該当テキストへスクロール＆一時ハイライトする
 */
export function navigateToCurrentHash(container: HTMLElement): HTMLElement | null {
  const win = container.ownerDocument?.defaultView || window;
  const hash = win.location.hash;
  if (!hash) return null;

  const parsed = parseFragment(hash);
  if (!parsed) return null;

  const range = findRangeBySelector(container, {
    type: "TextQuoteSelector",
    exact: parsed.exact,
    prefix: parsed.prefix,
    suffix: parsed.suffix,
  });

  if (!range) return null;

  // 一時的なハイライト要素を作成
  const mark = highlightRange(range, {
    className: "marginalia-target is-active",
  });

  mark.scrollIntoView({
    behavior: "smooth",
    block: "center",
  });

  return mark;
}

/**
 * hashchange イベントの監視をセットアップ
 */
export function setupHashNavigation(container: HTMLElement): () => void {
  const win = container.ownerDocument?.defaultView || window;
  const handler = () => navigateToCurrentHash(container);

  win.addEventListener("hashchange", handler);
  // 初回実行
  const timerId = setTimeout(handler, 100);

  return () => {
    clearTimeout(timerId);
    win.removeEventListener("hashchange", handler);
  };
}
