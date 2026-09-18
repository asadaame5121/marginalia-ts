import { assertEquals } from "@std/assert";
import {
  createHighlightAnnotation,
  createCommentAnnotation,
  validateAnnotation,
} from "../src/core/annotation.ts";

Deno.test("Annotation - createHighlightAnnotation", () => {
  const anno = createHighlightAnnotation({
    source: "https://example.com/blog/sample",
    selector: {
      exact: "選択されたテキスト",
      prefix: "前のテキスト、",
      suffix: "、後のテキスト",
    },
    id: "urn:uuid:test-1234",
  });

  assertEquals(anno["@context"], "http://www.w3.org/ns/anno.jsonld");
  assertEquals(anno.type, "Annotation");
  assertEquals(anno.id, "urn:uuid:test-1234");
  assertEquals(anno.target.source, "https://example.com/blog/sample");
  assertEquals(anno.target.selector.type, "TextQuoteSelector");
  assertEquals(anno.target.selector.exact, "選択されたテキスト");
  assertEquals(anno.target.selector.prefix, "前のテキスト、");
  assertEquals(anno.target.selector.suffix, "、後のテキスト");
  assertEquals(anno.body[0].purpose, "highlighting");
});

Deno.test("Annotation - createCommentAnnotation", () => {
  const anno = createCommentAnnotation({
    source: "https://example.com/blog/sample",
    selector: {
      exact: "注釈対象フレーズ",
    },
    comment: "これは素晴らしい考察です。",
    id: "urn:uuid:comment-5678",
  });

  assertEquals(anno.body[0].purpose, "commenting");
  assertEquals(anno.body[0].value, "これは素晴らしい考察です。");
  assertEquals(anno.body[0].type, "TextualBody");
});

Deno.test("Annotation - validateAnnotation", () => {
  const validAnno = createCommentAnnotation({
    source: "https://example.com/blog/sample",
    selector: { exact: "テスト" },
    comment: "コメント",
  });
  assertEquals(validateAnnotation(validAnno).valid, true);

  // 不正なデータ (exact がない)
  const invalid1 = {
    type: "Annotation",
    target: { selector: {} },
  };
  const res1 = validateAnnotation(invalid1);
  assertEquals(res1.valid, false);

  // コメントが空文字列
  const invalid2 = createCommentAnnotation({
    source: "https://example.com/blog/sample",
    selector: { exact: "テスト" },
    comment: "   ",
  });
  const res2 = validateAnnotation(invalid2);
  assertEquals(res2.valid, false);
});

Deno.test("Annotation - validateAnnotation 厳密化チェック", () => {
  const baseValid = createCommentAnnotation({
    source: "https://example.com/page",
    selector: { exact: "ターゲット", prefix: "前", suffix: "後" },
    comment: "コメント本文",
  });

  // 1. @context のチェック
  const badContext = { ...baseValid, "@context": "http://invalid-context.org" };
  assertEquals(validateAnnotation(badContext).valid, false);
  const noContext = { ...baseValid, "@context": undefined };
  assertEquals(validateAnnotation(noContext).valid, false);

  // 配列での @context は許容
  const arrayContext = {
    ...baseValid,
    "@context": ["http://www.w3.org/ns/anno.jsonld", "http://example.org/custom.jsonld"],
  };
  assertEquals(validateAnnotation(arrayContext).valid, true);

  // 2. id のチェック
  const emptyId = { ...baseValid, id: "" };
  assertEquals(validateAnnotation(emptyId).valid, false);
  const wsId = { ...baseValid, id: "   " };
  assertEquals(validateAnnotation(wsId).valid, false);

  // 3. created のチェック
  const badCreated = { ...baseValid, created: "not-a-date" };
  assertEquals(validateAnnotation(badCreated).valid, false);
  const emptyCreated = { ...baseValid, created: "" };
  assertEquals(validateAnnotation(emptyCreated).valid, false);

  // 4. target.source のチェック
  const emptySource = {
    ...baseValid,
    target: { ...baseValid.target, source: "" },
  };
  assertEquals(validateAnnotation(emptySource).valid, false);

  const missingSource = {
    ...baseValid,
    target: { selector: baseValid.target.selector },
  };
  assertEquals(validateAnnotation(missingSource).valid, false);

  // 5. TextQuoteSelector のチェック
  const badSelectorType = {
    ...baseValid,
    target: {
      ...baseValid.target,
      selector: { ...baseValid.target.selector, type: "InvalidSelector" },
    },
  };
  assertEquals(validateAnnotation(badSelectorType).valid, false);

  const badPrefixType = {
    ...baseValid,
    target: {
      ...baseValid.target,
      selector: { ...baseValid.target.selector, prefix: 123 },
    },
  };
  assertEquals(validateAnnotation(badPrefixType).valid, false);

  // 6. body のチェック
  const notArrayBody = { ...baseValid, body: "not-an-array" };
  assertEquals(validateAnnotation(notArrayBody).valid, false);

  const badBodyType = {
    ...baseValid,
    body: [{ type: "OtherBody", purpose: "commenting", value: "test" }],
  };
  assertEquals(validateAnnotation(badBodyType).valid, false);

  const badPurpose = {
    ...baseValid,
    body: [{ type: "TextualBody", purpose: "unknown_purpose", value: "test" }],
  };
  assertEquals(validateAnnotation(badPurpose).valid, false);

  // 7. コメント文字数チェック（空文字および最大長制限）
  const longComment = "a".repeat(10001);
  const tooLongAnno = createCommentAnnotation({
    source: "https://example.com",
    selector: { exact: "a" },
    comment: longComment,
  });
  assertEquals(validateAnnotation(tooLongAnno).valid, false);

  // カスタム文字数制限オプションのテスト
  const customLimitAnno = createCommentAnnotation({
    source: "https://example.com",
    selector: { exact: "a" },
    comment: "123456",
  });
  assertEquals(validateAnnotation(customLimitAnno, { maxCommentLength: 5 }).valid, false);
  assertEquals(validateAnnotation(customLimitAnno, { maxCommentLength: 10 }).valid, true);
});

Deno.test("Annotation - createCommentAnnotation with creator & validateAnnotation", () => {
  // 1. author のみ指定
  const annoWithName = createCommentAnnotation({
    source: "https://example.com/page",
    selector: { exact: "テスト" },
    comment: "コメント",
    author: "山田太郎",
  });
  assertEquals(annoWithName.creator?.name, "山田太郎");
  assertEquals(annoWithName.creator?.url, undefined);
  assertEquals(validateAnnotation(annoWithName).valid, true);

  // 2. author と url を両方指定
  const annoWithNameAndUrl = createCommentAnnotation({
    source: "https://example.com/page",
    selector: { exact: "テスト" },
    comment: "コメント",
    author: "山田太郎",
    url: "https://example.com/yamada",
  });
  assertEquals(annoWithNameAndUrl.creator?.name, "山田太郎");
  assertEquals(annoWithNameAndUrl.creator?.url, "https://example.com/yamada");
  assertEquals(validateAnnotation(annoWithNameAndUrl).valid, true);

  // 3. 不正な creator の検証 (name が空)
  const badCreatorName = {
    ...annoWithName,
    creator: { type: "Person", name: "   " },
  };
  assertEquals(validateAnnotation(badCreatorName).valid, false);

  // 4. 不正な creator の検証 (url が非文字列)
  const badCreatorUrl = {
    ...annoWithName,
    creator: { type: "Person", name: "山田太郎", url: 123 },
  };
  assertEquals(validateAnnotation(badCreatorUrl).valid, false);
});

