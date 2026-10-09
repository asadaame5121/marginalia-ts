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
      // サイト側で実装する同一オリジンのディスカバリーAPI
      discoverEndpoints: async (profileUrl) => {
        const res = await fetch(`/api/indieauth/discover?me=${encodeURIComponent(profileUrl)}`);
        if (!res.ok) throw new Error("プロフィールの認証先を取得できませんでした。");
        return res.json();
      },
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

認証先からこのページに戻ると、保存した state・PKCE verifier・プロフィール URL・
エンドポイントを使ってコードを交換し、ユーザーを保存します。成功時には URL から
`code` と `state` を除去し、他のクエリとハッシュは保持します。認証失敗は
`onError` とコメントフォームのエラー欄に通知され、未認証での投稿も引き続き可能です。
戻り先ページでも同じ設定で `createMarginalia` と `onAnnotate` を初期化してください。

外部プロフィールの HTML は通常 CORS に対応していないため、上の
`/api/indieauth/discover` は **導入サイト側で実装が必要**です。このライブラリや
デモにはサーバー実装は含まれません。API は `me` のプロフィールをサーバー側で取得し、
HTML または Link ヘッダーを解析して、次の JSON を返します。

```json
{
  "authorizationEndpoint": "https://auth.example.com/auth",
  "tokenEndpoint": "https://auth.example.com/token"
}
```

サーバー側では HTTP(S) の公開 URL のみを取得し、プライベート IP・ローカルホストへの
接続を拒否してください。リダイレクト先にも同じ検証を適用し、取得サイズ・時間・回数に
上限を設定してください。返されたエンドポイントもクライアント側で HTTP(S) を検証します。
API が返す `me` は採用せず、認証開始時に入力した正規化済み URL とコード交換で返る
`me` の一致を確認します。プロフィールの別名・異なる URL への変更は許可しません。

特定の認証サービスを使うサイトでは `defaultAuthEndpoint` / `defaultTokenEndpoint` を
設定できます。より細かい取得処理は `auth.client` に独自の `IndieAuthClient` を渡し、
`discoverEndpoints` または `fetchFn` で実装できます。外部プロフィールに対する既定 UI の
直接取得は行わず、フックも認証先設定もない場合は設定を促すエラーを表示します。
コード交換先にはブラウザから POST できる CORS 対応が必要です。

---

## ライセンス

MIT License
