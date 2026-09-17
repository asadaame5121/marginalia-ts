/**
 * Text Fragment および Fragmention の URL パース・生成ユーティリティ
 */

export interface ParsedFragment {
  type: "text-fragment" | "fragmention";
  exact: string;
  prefix?: string;
  suffix?: string;
  index?: number;
}

export interface TextFragmentSelector {
  exact: string;
  prefix?: string;
  suffix?: string;
}

/**
/**
 * 安全に decodeURIComponent を実行し、URIError 時は null を返す
 */
function safeDecodeURIComponent(str: string): string | null {
  try {
    return decodeURIComponent(str);
  } catch {
    return null;
  }
}

/**
 * URL またはハッシュ文字列から Text Fragment / Fragmention をパースする
 */
export function parseFragment(urlOrHash: string): ParsedFragment | null {
  if (typeof urlOrHash !== "string" || !urlOrHash.trim()) return null;

  const hashIndex = urlOrHash.indexOf("#");
  if (hashIndex === -1) return null;

  const hash = urlOrHash.slice(hashIndex);
  if (hash === "#" || hash === "##" || hash === "#%23") return null;

  // 1. W3C Text Fragment (#:~:text=...)
  const textDirectivePrefix = "#:~:text=";
  const directiveIdx = hash.indexOf(textDirectivePrefix);
  if (directiveIdx !== -1) {
    const rawDirective = hash.slice(directiveIdx + textDirectivePrefix.length);
    if (!rawDirective.trim()) return null;
    // 複数ディレクティブ対応 (&text=...) を考慮し、最初のディレクティブのみ対象
    const firstPart = rawDirective.split("&text=")[0];
    return parseTextDirective(firstPart);
  }

  // 2. Fragmention (##... または #...)
  const match = hash.match(/^#(#|%23)?(.+)$/);
  if (match) {
    const rawText = match[2];
    if (!rawText.trim()) return null;
    return parseFragmentionDirective(rawText);
  }

  return null;
}

/**
 * Text Fragment ディレクティブ構文 ([prefix-,]exact[,-suffix]) をパース
 */
function parseTextDirective(directive: string): ParsedFragment | null {
  if (!directive || !directive.trim()) return null;

  let prefix: string | undefined;
  let suffix: string | undefined;
  let exact = directive;

  // prefix-, があるか？
  const prefixMatch = exact.match(/^([^-]+)-,(.+)$/);
  if (prefixMatch) {
    const decodedPrefix = safeDecodeURIComponent(prefixMatch[1]);
    if (decodedPrefix === null) return null;
    prefix = decodedPrefix;
    exact = prefixMatch[2];
  }

  // ,-suffix があるか？
  const suffixMatch = exact.match(/^(.+),-([^-]+)$/);
  if (suffixMatch) {
    exact = suffixMatch[1];
    const decodedSuffix = safeDecodeURIComponent(suffixMatch[2]);
    if (decodedSuffix === null) return null;
    suffix = decodedSuffix;
  }

  const decodedExact = safeDecodeURIComponent(exact);
  if (decodedExact === null || !decodedExact.trim()) return null;

  return {
    type: "text-fragment",
    exact: decodedExact,
    ...(prefix ? { prefix } : {}),
    ...(suffix ? { suffix } : {}),
  };
}

/**
 * Fragmention 構文 (text++index または text  index) をパース
 */
function parseFragmentionDirective(rawText: string): ParsedFragment | null {
  // + をスペースに置換
  const decoded = safeDecodeURIComponent(rawText.replace(/\+/g, " "));
  if (decoded === null || !decoded.trim()) return null;

  // ++index または 空白2つ+index
  let exact = decoded;
  let index = 0;

  const plusPlusMatch = exact.match(/^(.+?)\+\+(\d+)$/);
  if (plusPlusMatch) {
    exact = plusPlusMatch[1];
    index = parseInt(plusPlusMatch[2], 10);
  } else {
    const spaceMatch = exact.split("  ");
    if (spaceMatch.length > 1) {
      exact = spaceMatch[0];
      index = parseInt(spaceMatch[1], 10) || 0;
    }
  }

  const trimmedExact = exact.trim();
  if (!trimmedExact) return null;

  return {
    type: "fragmention",
    exact: trimmedExact,
    index: Number.isInteger(index) && index >= 0 ? index : 0,
  };
}

/**
 * Text Fragment URL を生成する
 */
export function toTextFragmentUrl(baseUrl: string, selector: TextFragmentSelector): string {
  const urlWithoutHash = baseUrl.split("#")[0];
  const parts: string[] = [];

  if (selector.prefix) {
    parts.push(`${encodeURIComponent(selector.prefix)}-,`);
  }

  parts.push(encodeURIComponent(selector.exact));

  if (selector.suffix) {
    parts.push(`,-${encodeURIComponent(selector.suffix)}`);
  }

  return `${urlWithoutHash}#:~:text=${parts.join("")}`;
}

/**
 * Fragmention URL を生成する
 */
export function toFragmentionUrl(baseUrl: string, exact: string, index = 0): string {
  const urlWithoutHash = baseUrl.split("#")[0];
  let formatted = encodeURIComponent(exact).replace(/%20/g, "+");

  if (index > 0) {
    formatted += `++${index}`;
  }

  return `${urlWithoutHash}##${formatted}`;
}
