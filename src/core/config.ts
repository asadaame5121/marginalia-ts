import rawConfig from "../../config.json" with { type: "json" };
import type { IndieAuthClient } from "./indieauth.ts";

export interface FormFieldConfig {
  placeholder: string;
  required?: boolean;
}

export interface IndieAuthConfig {
  enabled?: boolean;
  clientId?: string;
  redirectUri?: string;
  defaultAuthEndpoint?: string;
  defaultTokenEndpoint?: string;
  scope?: string;
  client?: IndieAuthClient;
}

export interface MarginaliaConfig {
  features?: {
    comments?: {
      enabled?: boolean;
    };
  };
  auth?: IndieAuthConfig;
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
    indieAuthSignInPrompt?: string;
    indieAuthSignInButton?: string;
    indieAuthSignOutButton?: string;
    indieAuthProfilePlaceholder?: string;
    indieAuthInvalidUrl?: string;
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
    auth: {
      enabled: custom.auth?.enabled ?? defaultConfig.auth?.enabled ?? false,
      clientId: custom.auth?.clientId ?? defaultConfig.auth?.clientId,
      redirectUri: custom.auth?.redirectUri ?? defaultConfig.auth?.redirectUri,
      defaultAuthEndpoint: custom.auth?.defaultAuthEndpoint ?? defaultConfig.auth?.defaultAuthEndpoint,
      defaultTokenEndpoint: custom.auth?.defaultTokenEndpoint ?? defaultConfig.auth?.defaultTokenEndpoint,
      scope: custom.auth?.scope ?? defaultConfig.auth?.scope,
      client: custom.auth?.client,
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
      indieAuthSignInPrompt: custom.messages?.indieAuthSignInPrompt ?? defaultConfig.messages?.indieAuthSignInPrompt ?? "IndieAuthで認証 (任意)",
      indieAuthSignInButton: custom.messages?.indieAuthSignInButton ?? defaultConfig.messages?.indieAuthSignInButton ?? "サインイン",
      indieAuthSignOutButton: custom.messages?.indieAuthSignOutButton ?? defaultConfig.messages?.indieAuthSignOutButton ?? "サインアウト",
      indieAuthProfilePlaceholder: custom.messages?.indieAuthProfilePlaceholder ?? defaultConfig.messages?.indieAuthProfilePlaceholder ?? "https://yourdomain.com",
      indieAuthInvalidUrl: custom.messages?.indieAuthInvalidUrl ?? defaultConfig.messages?.indieAuthInvalidUrl ?? "有効なIndieAuth URLを入力してください。",
    },
  };
}
