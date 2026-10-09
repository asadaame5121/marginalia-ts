# @marginalia/core

> W3C Web Annotation（JSON-LD）と Scroll to Text Fragment / Fragmention を統合した、ウェブサイト向け軽量ハイライト＆マージナリア（余白注釈）ライブラリ。

`chapmanu/fragmentions`、`kartikprabhu/fragmentioner`、`kartikprabhu/marginalia` の3つの設計思想を現代のWeb標準にモダナイズし、ゼロ依存でTypeScript/ES Modulesとして再構築したものです。

---

## 特長

1. **W3C Web Annotation 準拠（JSON-LD）**:
   - `TextQuoteSelector`（`exact`, `prefix`, `suffix`）を自動抽出し、本文の多少の加筆修正や同一単語の重複にも頑健（Robust）に位置を特定。
2. **共有用URL（Text Fragment / Fragmention）の生成**:
   - 選択されたテキストに対するディープリンク（`#:~:text=` または `##`）を生成・共有可能。URLクリック時に該当箇所へ自動スクロール＆一時ハイライト。
3. **安全な注釈描画（XSS完全防止）**:
   - コメント描画には `textContent` を用い、悪意あるスクリプト（`<script>` 等）が注入されても安全なプレーンテキストとして描画。
4. **疎結合なデータ管理**:
   - フロントエンド（本ライブラリ）は保存処理を持たず、`onAnnotate` コールバックを発火します。Webサイト側（Deno Deploy / Deno KV 等）で自由に保存APIを実装できます。

---

## インストール・ビルド

```bash
# テスト実行
deno task test:run

# dist/marginalia.esm.js および dist/marginalia.css のビルド
deno task build
```

---

## 組み込み方法（Webサイト側での利用例）

### 1. HTMLとCSSの読み込み

```html
<link rel="stylesheet" href="./dist/marginalia.css">

<article id="post-content">
  <p>記事の本文テキスト...</p>
</article>
```

### 2. JavaScriptでの初期化

```javascript
import { createMarginalia } from "./dist/marginalia.esm.js";

const postContent = document.getElementById("post-content");

const marginalia = createMarginalia({
  container: postContent,
  // ユーザーがハイライトまたはコメントを作成したときに発火
  onAnnotate: async (annotation) => {
    // サイト側のバックエンドAPI (Deno Deploy / Deno KV) へ送信
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation)
    });
  }
});

// 保存済みのアノテーション配列を取得してレンダリング
const res = await fetch(`/api/annotations?url=${encodeURIComponent(location.href)}`);
const savedAnnotations = await res.json();
marginalia.render(savedAnnotations);
```

---

## API リファレンス

### `createMarginalia(options: MarginaliaInitOptions)`
- **引数**:
  - `container`: 対象の `HTMLElement`（本文要素）。
  - `onAnnotate`: `(annotation: W3CAnnotation) => void | Promise<void>` 新規作成時のコールバック。
  - `enableHashNavigation`: `boolean`（デフォルト: `true`）。URLハッシュによるジャンプとハイライトを有効化。
- **返り値**:
  - `render(annotations: W3CAnnotation[])`: アノテーション配列を一括描画。
  - `destroy()`: イベントリスナーとツールバーを破棄。

### ユーティリティ関数 & IndieAuth API
- `toTextFragmentUrl(baseUrl, selector)`: Text Fragment URL（`#:~:text=`）を生成。
- `toFragmentionUrl(baseUrl, exact, index)`: Fragmention URL（`##`）を生成。
- `parseFragment(urlOrHash)`: ハッシュをパースして `exact`, `prefix`, `suffix` 等を抽出。
- `createHighlightAnnotation({ source, selector })`: W3Cハイライトアノテーションオブジェクトを作成。
- `createCommentAnnotation({ source, selector, comment })`: W3Cコメントアノテーションオブジェクトを作成。
- `validateAnnotation(data)`: アノテーション構造のバリデーション。
- `IndieAuthClient`: IndieAuth 認証クライアント（ディスカバリー、認可フロー、コールバック処理、PKCE対応）。
- `normalizeProfileUrl(url)`: IndieAuth プロファイルURLの正規化。

---

## IndieAuth 認証（オプショナル）

IndieWeb の分散認証規格である [IndieAuth](https://indieauth.spec.indieweb.org/) に対応しています。
**認証は完全にオプショナル（任意）**であり、認証を必須とせずに未認証ユーザーも通常通り名前とコメントを入力して投稿できます。

```javascript
import { createMarginalia } from "./dist/marginalia.esm.js";

const marginalia = createMarginalia({
  container: document.getElementById("post-content"),
  config: {
    auth: {
      enabled: true, // IndieAuth オプションを有効化（デフォルトは false）
      clientId: window.location.origin,
      redirectUri: window.location.href,
    },
  },
  onAnnotate: async (annotation) => {
    // 認証済みの場合、annotation.creator に認証されたドメイン情報・名前が自動付与されます
    await fetch("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation),
    });
  },
});
```

---

## ライセンス

MIT License
