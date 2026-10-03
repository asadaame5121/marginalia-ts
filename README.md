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

### 配布方針

導入方法は **jsDelivr CDN からの JavaScript・CSS 読み込み**を優先します。
公開 GitHub リポジトリのバージョンタグから配信する方式を使うため、
利用者は npm・Deno のインストールや Deno Deploy の利用を必要としません。

配信 URL は次の形式です。JavaScript と CSS は同じバージョンに固定します。

```text
https://cdn.jsdelivr.net/gh/asadaame5121/marginalia-ts@v0.1.0/dist/marginalia.iife.js
https://cdn.jsdelivr.net/gh/asadaame5121/marginalia-ts@v0.1.0/dist/marginalia.css
```

**上記は公開予定の URL です。現時点では `v0.1.0` タグを作成していないため、
この URL での導入はまだできません。** jsDelivr の GitHub 配信はリポジトリ内の
ファイルを参照するので、GitHub Releases にアーカイブを添付するだけでは配信できません。
現在 `dist/` は Git の管理対象外です。初回公開時に以下の作業を行います。

1. テストを実行し、リリース対象のソースから `deno task build` で `dist/` を生成する。
2. 配布ファイルを Git の管理対象にする運用を整え、生成物とライセンス情報をコミットする。
3. そのコミットに `v0.1.0` タグを付けて公開する。
4. CDN 経由で JavaScript・CSS が取得でき、別のサイトで動作することを確認する。

公開済みタグは変更せず、更新は新しいバージョンタグで配信します。
セルフホスティング用に **GitHub Releases のブラウザ用アーカイブ**も提供する方針です。

リリース用アーカイブには、同じバージョンの以下のファイルを含めます。

- `marginalia.esm.js` とそのソースマップ（ES Modules 用）
- `marginalia.iife.js` とそのソースマップ（通常の `<script>` 用。グローバル名は `Marginalia`）
- `marginalia.css`
- `README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`

リリースは `v0.1.0` のようなバージョンタグを付け、アーカイブ名は
`marginalia-0.1.0.zip` の形式にします。**この方針の記載だけでは、
リリースの作成やアーカイブの公開は行われません。**

CDN 導入を整えた後、需要に応じて npm 向けパッケージを整備し、Vite などからの導入に対応します。
JSR も Deno 利用者の需要に応じて追加します。パッケージ名の候補は
`@marginalia/core` です。2026-10-03 の確認では npm と JSR の
パッケージメタデータはどちらも HTTP 404 でしたが、名前は未予約です。
公開前にスコープの所有権・公開権限と名前の利用可否を確認します。

### 開発者向けビルド

```bash
# テスト実行
deno task test:run

# dist/marginalia.esm.js および dist/marginalia.css のビルド
deno task build
```

---

## 組み込み方法（Webサイト側での利用例）

### CDN での導入（タグ公開後）

以下は、そのブラウザ内だけに注釈を保存する最小例です。PHP・MySQL などで
他の閲覧者と共有する場合は、`onAnnotate` 内の保存と初期取得をサイト側の API に置き換えます。
保存先は CDN の配信元とは独立しています。

```html
<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/asadaame5121/marginalia-ts@v0.1.0/dist/marginalia.css">

<article id="post-content">
  <p>記事の本文テキストを選択して、ハイライトやコメントを追加できます。</p>
</article>

<script src="https://cdn.jsdelivr.net/gh/asadaame5121/marginalia-ts@v0.1.0/dist/marginalia.iife.js"></script>
<script>
  const storageKey = "marginalia:" + location.href.split("#")[0];
  const marginalia = Marginalia.createMarginalia({
    container: document.getElementById("post-content"),
    onAnnotate(annotation) {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "[]");
      saved.push(annotation);
      localStorage.setItem(storageKey, JSON.stringify(saved));
    },
    onError(error) {
      console.error(error);
      alert("注釈を保存できませんでした。");
    }
  });
  marginalia.render(JSON.parse(localStorage.getItem(storageKey) || "[]"));
</script>
```

ES Modules を使う場合は同じタグの `dist/marginalia.esm.js` から
`createMarginalia` をインポートできます。

### 自分のサイトに配布ファイルを配置する場合

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

### ユーティリティ関数
- `toTextFragmentUrl(baseUrl, selector)`: Text Fragment URL（`#:~:text=`）を生成。
- `toFragmentionUrl(baseUrl, exact, index)`: Fragmention URL（`##`）を生成。
- `parseFragment(urlOrHash)`: ハッシュをパースして `exact`, `prefix`, `suffix` 等を抽出。
- `createHighlightAnnotation({ source, selector })`: W3Cハイライトアノテーションオブジェクトを作成。
- `createCommentAnnotation({ source, selector, comment })`: W3Cコメントアノテーションオブジェクトを作成。
- `validateAnnotation(data)`: アノテーション構造のバリデーション。

---

## 貢献

バグ報告、導入例、翻訳、改善の Pull Request を歓迎します。
参加方法は [CONTRIBUTING.md](./CONTRIBUTING.md)、行動規範は
[CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) を参照してください。

特に **PHP + MySQL の保存 API・導入サンプル**のコントリビューターを募集しています。
現在は未実装です。保存処理は `onAnnotate` を通じて接続し、ブラウザライブラリ本体は
バックエンドから独立した構成を保ちます。

---

## ライセンス

[MIT License](./LICENSE) — Copyright (c) 2026 asadaame5121。

参考にしたプロジェクトの出典とライセンスは
[THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) に記載しています。
