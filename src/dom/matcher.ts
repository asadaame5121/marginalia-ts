/**
 * DOM内のテキスト探索および Range と TextQuoteSelector の相互変換エンジン
 */

import type { TextQuoteSelector } from "../core/annotation.ts";

interface TextNodeChunk {
  node: Node;
  start: number;
  end: number;
  text: string;
}

interface FullTextMap {
  text: string;
  chunks: TextNodeChunk[];
}

/**
 * コンテナ要素内のすべてのテキストノードを収集し、全文字列とオフセットのマッピングを作成する
 */
function buildFullTextMap(container: Node): FullTextMap {
  const doc = container.ownerDocument || (container as Document);
  // NodeFilter.SHOW_TEXT = 4
  const walker = doc.createTreeWalker(container, 4, null);
  const chunks: TextNodeChunk[] = [];
  let currentOffset = 0;

  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue || "";
    if (text.length > 0) {
      chunks.push({
        node,
        start: currentOffset,
        end: currentOffset + text.length,
        text,
      });
      currentOffset += text.length;
    }
    node = walker.nextNode();
  }

  const fullText = chunks.map((c) => c.text).join("");
  return { text: fullText, chunks };
}

/**
 * 全体テキスト上の文字インデックスから、DOMノードとオフセットのペアを解決する
 */
function resolveNodeOffset(chunks: TextNodeChunk[], charIndex: number): { node: Node; offset: number } | null {
  for (const chunk of chunks) {
    if (charIndex >= chunk.start && charIndex <= chunk.end) {
      return {
        node: chunk.node,
        offset: charIndex - chunk.start,
      };
    }
  }
  return null;
}

/**
 * TextQuoteSelector を基にコンテナ内の DOM Range を特定する
 */
export function findRangeBySelector(container: Node, selector: TextQuoteSelector): Range | null {
  const { exact, prefix = "", suffix = "" } = selector;
  if (!exact) return null;

  const { text, chunks } = buildFullTextMap(container);
  if (!chunks.length) return null;

  // exact が出現するすべてのインデックスを検索
  const matches: number[] = [];
  let pos = text.indexOf(exact);
  while (pos !== -1) {
    matches.push(pos);
    pos = text.indexOf(exact, pos + 1);
  }

  if (matches.length === 0) return null;

  // prefix と suffix の一致スコアを計算し、最良のマッチを選ぶ
  let bestMatchIndex = matches[0];
  let highestScore = -1;

  for (const matchIdx of matches) {
    let score = 0;

    if (prefix) {
      const actualPrefix = text.slice(Math.max(0, matchIdx - prefix.length), matchIdx);
      if (actualPrefix.endsWith(prefix) || prefix.endsWith(actualPrefix)) {
        score += actualPrefix.length;
      }
    }

    if (suffix) {
      const actualSuffix = text.slice(matchIdx + exact.length, matchIdx + exact.length + suffix.length);
      if (actualSuffix.startsWith(suffix) || suffix.startsWith(actualSuffix)) {
        score += actualSuffix.length;
      }
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatchIndex = matchIdx;
    }
  }

  const startLoc = resolveNodeOffset(chunks, bestMatchIndex);
  const endLoc = resolveNodeOffset(chunks, bestMatchIndex + exact.length);

  if (!startLoc || !endLoc) return null;

  const doc = container.ownerDocument || (container as Document);
  const range = doc.createRange();
  range.setStart(startLoc.node, startLoc.offset);
  range.setEnd(endLoc.node, endLoc.offset);

  return range;
}

/**
 * Range から exact, prefix, suffix を抽出して TextQuoteSelector を生成する
 */
export function extractSelectorFromRange(
  range: Range,
  container?: Node,
  contextLength = 32
): TextQuoteSelector {
  const scope = container || range.commonAncestorContainer;
  const { text, chunks } = buildFullTextMap(scope);

  // Range の開始・終了文字インデックスを計算
  let startCharIdx = 0;
  let endCharIdx = 0;

  for (const chunk of chunks) {
    if (chunk.node === range.startContainer) {
      startCharIdx = chunk.start + range.startOffset;
    }
    if (chunk.node === range.endContainer) {
      endCharIdx = chunk.start + range.endOffset;
    }
  }

  const exact = text.slice(startCharIdx, endCharIdx);
  const prefix = text.slice(Math.max(0, startCharIdx - contextLength), startCharIdx);
  const suffix = text.slice(endCharIdx, Math.min(text.length, endCharIdx + contextLength));

  return {
    type: "TextQuoteSelector",
    exact,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}
