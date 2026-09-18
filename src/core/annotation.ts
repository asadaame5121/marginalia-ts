/**
 * W3C Web Annotation Data Model (JSON-LD) 定義および生成モジュール
 * 仕様: https://www.w3.org/TR/annotation-model/
 */

export interface TextQuoteSelector {
  type: "TextQuoteSelector";
  exact: string;
  prefix?: string;
  suffix?: string;
}

export interface TextualBody {
  type: "TextualBody";
  value?: string;
  purpose: "commenting" | "highlighting" | "tagging" | "describing";
  format?: string;
}

export interface AnnotationTarget {
  source: string;
  selector: TextQuoteSelector;
}

export interface AnnotationCreator {
  type?: "Person" | "Organization" | "Software";
  name: string;
  url?: string;
}

export interface W3CAnnotation {
  "@context": "http://www.w3.org/ns/anno.jsonld";
  id: string;
  type: "Annotation";
  body: TextualBody[];
  target: AnnotationTarget;
  created: string;
  creator?: AnnotationCreator;
}

export interface CreateHighlightParams {
  source: string;
  selector: {
    exact: string;
    prefix?: string;
    suffix?: string;
  };
  id?: string;
}

export interface CreateCommentParams extends CreateHighlightParams {
  comment: string;
  author?: string;
  url?: string;
  creator?: AnnotationCreator;
}

/**
 * ハイライト用のアノテーション（JSON-LD）を生成
 */
export function createHighlightAnnotation(params: CreateHighlightParams): W3CAnnotation {
  const id = params.id || `urn:uuid:${crypto.randomUUID()}`;
  return {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id,
    type: "Annotation",
    body: [
      {
        type: "TextualBody",
        purpose: "highlighting",
      },
    ],
    target: {
      source: params.source,
      selector: {
        type: "TextQuoteSelector",
        exact: params.selector.exact,
        ...(params.selector.prefix ? { prefix: params.selector.prefix } : {}),
        ...(params.selector.suffix ? { suffix: params.selector.suffix } : {}),
      },
    },
    created: new Date().toISOString(),
  };
}

/**
 * コメント（Marginalia）付きアノテーション（JSON-LD）を生成
 */
export function createCommentAnnotation(params: CreateCommentParams): W3CAnnotation {
  const id = params.id || `urn:uuid:${crypto.randomUUID()}`;
  const creator: AnnotationCreator | undefined = params.creator
    ? params.creator
    : params.author
    ? {
        type: "Person",
        name: params.author,
        ...(params.url ? { url: params.url } : {}),
      }
    : undefined;

  return {
    "@context": "http://www.w3.org/ns/anno.jsonld",
    id,
    type: "Annotation",
    body: [
      {
        type: "TextualBody",
        value: params.comment,
        purpose: "commenting",
        format: "text/plain",
      },
    ],
    target: {
      source: params.source,
      selector: {
        type: "TextQuoteSelector",
        exact: params.selector.exact,
        ...(params.selector.prefix ? { prefix: params.selector.prefix } : {}),
        ...(params.selector.suffix ? { suffix: params.selector.suffix } : {}),
      },
    },
    created: new Date().toISOString(),
    ...(creator ? { creator } : {}),
  };
}

export interface ValidateAnnotationOptions {
  maxCommentLength?: number;
}

const VALID_PURPOSES = new Set(["commenting", "highlighting", "tagging", "describing"]);
const W3C_ANNO_CONTEXT = "http://www.w3.org/ns/anno.jsonld";

/**
 * アノテーションオブジェクトの厳密バリデーション
 */
export function validateAnnotation(
  data: unknown,
  options?: ValidateAnnotationOptions
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { valid: false, errors: ["Invalid annotation object (must be a non-null object)"] };
  }

  const anno = data as Record<string, unknown>;

  // 1. @context
  const context = anno["@context"];
  if (context !== W3C_ANNO_CONTEXT) {
    if (!Array.isArray(context) || !context.includes(W3C_ANNO_CONTEXT)) {
      errors.push(`Invalid or missing '@context' (must include '${W3C_ANNO_CONTEXT}')`);
    }
  }

  // 2. type
  if (anno.type !== "Annotation") {
    errors.push("Missing or invalid 'type' property (must be 'Annotation')");
  }

  // 3. id
  if (typeof anno.id !== "string" || !anno.id.trim()) {
    errors.push("Missing or invalid 'id' property (must be a non-empty string)");
  }

  // 4. created
  if (typeof anno.created !== "string" || !anno.created.trim() || isNaN(Date.parse(anno.created))) {
    errors.push("Missing or invalid 'created' property (must be a valid ISO 8601 date string)");
  }

  // 5. target & target.source
  const target = anno.target as Record<string, unknown> | undefined;
  if (!target || typeof target !== "object" || Array.isArray(target)) {
    errors.push("Missing 'target' property");
  } else {
    if (typeof target.source !== "string" || !target.source.trim()) {
      errors.push("Missing or invalid 'target.source' property (must be a non-empty string)");
    }

    const selector = target.selector as Record<string, unknown> | undefined;
    if (!selector || typeof selector !== "object" || Array.isArray(selector)) {
      errors.push("Missing 'target.selector' property");
    } else {
      if (selector.type !== "TextQuoteSelector") {
        errors.push("Invalid 'target.selector.type' (must be 'TextQuoteSelector')");
      }
      if (typeof selector.exact !== "string" || !selector.exact.trim()) {
        errors.push("Invalid or empty 'target.selector.exact'");
      }
      if (selector.prefix !== undefined && typeof selector.prefix !== "string") {
        errors.push("Invalid 'target.selector.prefix' (must be a string if specified)");
      }
      if (selector.suffix !== undefined && typeof selector.suffix !== "string") {
        errors.push("Invalid 'target.selector.suffix' (must be a string if specified)");
      }
    }
  }

  // 6. body
  const bodies = anno.body;
  if (!Array.isArray(bodies)) {
    errors.push("Missing or invalid 'body' property (must be an array)");
  } else {
    const maxCommentLength = options?.maxCommentLength ?? 10000;
    for (const b of bodies) {
      if (!b || typeof b !== "object" || Array.isArray(b)) {
        errors.push("Invalid body item (must be an object)");
        continue;
      }
      const bodyObj = b as Record<string, unknown>;
      if (bodyObj.type !== "TextualBody") {
        errors.push("Invalid body type (must be 'TextualBody')");
      }
      if (typeof bodyObj.purpose !== "string" || !VALID_PURPOSES.has(bodyObj.purpose)) {
        errors.push(`Invalid body purpose (must be one of: ${Array.from(VALID_PURPOSES).join(", ")})`);
      }
      if (bodyObj.purpose === "commenting") {
        if (typeof bodyObj.value !== "string" || !bodyObj.value.trim()) {
          errors.push("Comment body value cannot be empty or whitespace only");
        } else if (bodyObj.value.length > maxCommentLength) {
          errors.push(`Comment body value exceeds maximum length of ${maxCommentLength} characters`);
        }
      }
    }
  }

  // 7. creator (任意)
  if ("creator" in anno && anno.creator !== undefined) {
    const creator = anno.creator;
    if (typeof creator === "string") {
      if (!creator.trim()) {
        errors.push("Invalid 'creator' property (must be a non-empty string)");
      }
    } else if (typeof creator === "object" && creator !== null && !Array.isArray(creator)) {
      const creatorObj = creator as Record<string, unknown>;
      if (typeof creatorObj.name !== "string" || !creatorObj.name.trim()) {
        errors.push("Invalid or missing 'creator.name' property (must be a non-empty string)");
      }
      if (creatorObj.url !== undefined && typeof creatorObj.url !== "string") {
        errors.push("Invalid 'creator.url' property (must be a string if specified)");
      }
    } else {
      errors.push("Invalid 'creator' property (must be a string or object)");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
