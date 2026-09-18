import rawConfig from "../../config.json" with { type: "json" };

export interface FormFieldConfig {
  placeholder: string;
  required?: boolean;
}

export interface MarginaliaConfig {
  features?: {
    comments?: {
      enabled?: boolean;
    };
  };
  form?: {
    name?: FormFieldConfig;
    url?: FormFieldConfig;
    comment?: FormFieldConfig;
  };
  messages?: {
    nameRequired?: string;
    commentRequired?: string;
    invalidUrl?: string;
    saveFailed?: string;
  };
}

export const defaultConfig: MarginaliaConfig = rawConfig as MarginaliaConfig;

/**
 * ユーザー指定の設定とデフォルト設定を安全にディープマージする
 */
export function resolveConfig(custom?: MarginaliaConfig): MarginaliaConfig {
  if (!custom) return defaultConfig;

  return {
    features: {
      comments: {
        enabled: custom.features?.comments?.enabled ?? defaultConfig.features?.comments?.enabled ?? true,
      },
    },
    form: {
      name: {
        placeholder: custom.form?.name?.placeholder ?? defaultConfig.form?.name?.placeholder ?? "",
        required: custom.form?.name?.required ?? defaultConfig.form?.name?.required ?? true,
      },
      url: {
        placeholder: custom.form?.url?.placeholder ?? defaultConfig.form?.url?.placeholder ?? "",
        required: custom.form?.url?.required ?? defaultConfig.form?.url?.required ?? false,
      },
      comment: {
        placeholder: custom.form?.comment?.placeholder ?? defaultConfig.form?.comment?.placeholder ?? "",
        required: custom.form?.comment?.required ?? defaultConfig.form?.comment?.required ?? true,
      },
    },
    messages: {
      nameRequired: custom.messages?.nameRequired ?? defaultConfig.messages?.nameRequired ?? "名前を入力してください。",
      commentRequired: custom.messages?.commentRequired ?? defaultConfig.messages?.commentRequired ?? "コメントを入力してください。",
      invalidUrl: custom.messages?.invalidUrl ?? defaultConfig.messages?.invalidUrl ?? "有効なURLを入力してください。",
      saveFailed: custom.messages?.saveFailed ?? defaultConfig.messages?.saveFailed ?? "保存に失敗しました。",
    },
  };
}
