import type { W3CAnnotation } from "./core/annotation.ts";
import {
  annotationClassName,
  attachReaction,
  clearAllMarginalia,
  renderAnnotation,
} from "./dom/marginalia.ts";
import { type SelectionToolbar, setupSelectionToolbar } from "./ui/toolbar.ts";
import { setupHashNavigation } from "./dom/navigator.ts";
import { clearAllHighlights, highlightRange } from "./dom/highlighter.ts";
import type { MarginaliaConfig } from "./core/config.ts";

export * from "./core/config.ts";
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
  config?: MarginaliaConfig;
}

/**
 * Marginalia & Fragmention 統合インスタンスを初期化する
 */
export function createMarginalia(
  options: MarginaliaInitOptions,
): MarginaliaInstance {
  const {
    container,
    onAnnotate,
    onError,
    enableHashNavigation = true,
    config,
  } = options;

  let toolbar: SelectionToolbar | null = null;
  let cleanHashNav: (() => void) | null = null;

  // 1. 選択時ツールバー（ハイライト・コメント・リンクコピー）のセットアップ
  if (onAnnotate) {
    toolbar = setupSelectionToolbar(container, {
      onAnnotate,
      onError,
      config,
      onHighlightCreated: (range, anno) => {
        // UI上で作成直後に即時ハイライト表示
        const mark = highlightRange(range, {
          id: anno.id,
          className: annotationClassName(anno),
        });
        const reaction = anno.body.find((body) => body.purpose === "tagging")
          ?.value;
        if (reaction) attachReaction(mark, anno.id, reaction);
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
