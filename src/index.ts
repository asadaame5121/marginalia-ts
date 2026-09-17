import type { W3CAnnotation } from "./core/annotation.ts";
import { renderAnnotation, clearAllMarginalia } from "./dom/marginalia.ts";
import { setupSelectionToolbar, type SelectionToolbar } from "./ui/toolbar.ts";
import { setupHashNavigation } from "./dom/navigator.ts";
import { highlightRange, clearAllHighlights } from "./dom/highlighter.ts";

export * from "./core/url.ts";
export * from "./core/annotation.ts";
export * from "./dom/matcher.ts";
export * from "./dom/highlighter.ts";
export * from "./dom/marginalia.ts";
export * from "./dom/navigator.ts";
export * from "./ui/toolbar.ts";

export interface MarginaliaInstance {
  render: (annotations: W3CAnnotation[]) => void;
  destroy: () => void;
}

export interface MarginaliaInitOptions {
  container: HTMLElement;
  onAnnotate?: (annotation: W3CAnnotation) => void | Promise<void>;
  onError?: (error: unknown) => void;
  enableHashNavigation?: boolean;
}

/**
 * Marginalia & Fragmention 統合インスタンスを初期化する
 */
export function createMarginalia(options: MarginaliaInitOptions): MarginaliaInstance {
  const { container, onAnnotate, onError, enableHashNavigation = true } = options;

  let toolbar: SelectionToolbar | null = null;
  let cleanHashNav: (() => void) | null = null;

  // 1. 選択時ツールバー（ハイライト・コメント・リンクコピー）のセットアップ
  if (onAnnotate) {
    toolbar = setupSelectionToolbar(container, {
      onAnnotate,
      onError,
      onHighlightCreated: (range, anno) => {
        // UI上で作成直後に即時ハイライト表示
        highlightRange(range, { id: anno.id });
      },
    });
  }

  // 2. URLハッシュによる自動スクロール・ハイライトのセットアップ
  if (enableHashNavigation) {
    cleanHashNav = setupHashNavigation(container);
  }

  // 3. アノテーションの描画メソッド
  const renderedIds = new Set<string>();

  const render = (annotations: W3CAnnotation[]) => {
    for (const anno of annotations) {
      if (renderedIds.has(anno.id)) continue;
      const res = renderAnnotation(container, anno);
      if (res) {
        renderedIds.add(anno.id);
      }
    }
  };

  return {
    render,
    destroy: () => {
      toolbar?.destroy();
      cleanHashNav?.();
      clearAllHighlights(container);
      clearAllMarginalia(container);
      renderedIds.clear();
    },
  };
}
