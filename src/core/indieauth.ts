/**
 * IndieAuth コアモジュール
 * 仕様: https://indieauth.spec.indieweb.org/
 */

export interface IndieAuthUser {
  me: string;
  name?: string;
  url?: string;
  photo?: string;
  email?: string;
}

export interface IndieAuthEndpoints {
  authorizationEndpoint?: string;
  tokenEndpoint?: string;
  me?: string;
}

export interface IndieAuthAuthRequest {
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  me: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod?: "S256";
  scope?: string;
}

export interface CallbackValidationResult {
  valid: boolean;
  code?: string;
  error?: string;
}

export interface StoredAuthState {
  state: string;
  codeVerifier: string;
  me?: string;
  tokenEndpoint?: string;
  clientId?: string;
  redirectUri?: string;
}

export interface IndieAuthStorage {
  getUser(): IndieAuthUser | null;
  setUser(user: IndieAuthUser): void;
  clearUser(): void;
  saveAuthState(
    state: string,
    codeVerifier: string,
    me?: string,
    tokenEndpoint?: string,
    request?: { clientId: string; redirectUri: string },
  ): void;
  getAuthState(): StoredAuthState | null;
  clearAuthState(): void;
}

/**
 * ユーザーが入力したプロファイルURLを正規化（Canonicalization）する
 * スキームがない場合は https:// を補完し、パスがない場合は末尾スラッシュを補完
 */
export function normalizeProfileUrl(urlStr: string): string | null {
  const trimmed = urlStr.trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    // javascript: などの危険なスキームを防止
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    // パスが空の場合は "/" を補完
    if (parsed.pathname === "") {
      parsed.pathname = "/";
    }
    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * HTML文字列から IndieAuth 関連のエンドポイント（authorization_endpoint, token_endpoint）を抽出する
 */
export function extractEndpointsFromHtml(
  html: string,
  baseUrl?: string,
): IndieAuthEndpoints {
  const result: IndieAuthEndpoints = {};
  const linkRegex = /<(?:link|a)\s+([^>]+)>/gi;

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(html)) !== null) {
    const attrs = match[1];
    const relMatch = /rel=["']?([^"'>]+)["']?/i.exec(attrs);
    const hrefMatch = /href=["']?([^"'>]+)["']?/i.exec(attrs);

    if (!relMatch || !hrefMatch) continue;

    const relTokens = relMatch[1].toLowerCase().split(/\s+/);
    const rawHref = hrefMatch[1];
    let resolvedHref = rawHref;
    if (baseUrl) {
      try {
        resolvedHref = new URL(rawHref, baseUrl).href;
      } catch {
        resolvedHref = rawHref;
      }
    }

    if (relTokens.includes("authorization_endpoint") && !result.authorizationEndpoint) {
      result.authorizationEndpoint = validateEndpointUrl(resolvedHref);
    }
    if (relTokens.includes("token_endpoint") && !result.tokenEndpoint) {
      result.tokenEndpoint = validateEndpointUrl(resolvedHref);
    }
  }

  return result;
}

/**
 * HTTP Link ヘッダーからエンドポイントを抽出する
 */
export function extractEndpointsFromHeaders(
  linkHeader: string,
  baseUrl?: string,
): IndieAuthEndpoints {
  const result: IndieAuthEndpoints = {};
  // Commas inside URI references and quoted parameters are not separators.
  const linkRegex = /<([^>]+)>((?:[^,"<]|"(?:\\.|[^"\\])*")*)/g;

  for (const match of linkHeader.matchAll(linkRegex)) {
    const parameters = match[2].matchAll(/;\s*([^;=\s]+)\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;\s,]+))/g);
    let rel = "";
    for (const parameter of parameters) {
      if (parameter[1].toLowerCase() === "rel") {
        rel = parameter[2] ?? parameter[3];
        break;
      }
    }
    if (!rel) continue;
    const rawHref = match[1];
    const relTokens = rel.toLowerCase().split(/\s+/);
    let resolvedHref = rawHref;
    if (baseUrl) {
      try {
        resolvedHref = new URL(rawHref, baseUrl).href;
      } catch {
        resolvedHref = rawHref;
      }
    }

    if (relTokens.includes("authorization_endpoint") && !result.authorizationEndpoint) {
      result.authorizationEndpoint = validateEndpointUrl(resolvedHref);
    }
    if (relTokens.includes("token_endpoint") && !result.tokenEndpoint) {
      result.tokenEndpoint = validateEndpointUrl(resolvedHref);
    }
  }

  return result;
}

/**
 * PKCE用 code_verifier を生成（43〜128文字）
 */
export function generateCodeVerifier(length = 64): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let verifier = "";
  for (let i = 0; i < length; i++) {
    verifier += chars[array[i] % chars.length];
  }
  return verifier;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * PKCE用 code_challenge (S256) を生成
 */
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * CSRF対策用 state 文字列を生成
 */
export function generateState(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  let state = "";
  for (let i = 0; i < length; i++) {
    state += chars[array[i] % chars.length];
  }
  return state;
}

/**
 * 認可リクエストURLを組み立てる
 */
export function buildAuthorizationUrl(params: IndieAuthAuthRequest): string {
  const url = new URL(validateEndpointUrl(params.authorizationEndpoint));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("me", params.me);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", params.codeChallengeMethod || "S256");
  if (params.scope) {
    url.searchParams.set("scope", params.scope);
  }
  return url.href;
}

/**
 * コールバックURLのクエリパラメータを検証する
 */
export function verifyCallbackParams(params: {
  code?: string | null;
  state?: string | null;
  expectedState?: string | null;
}): CallbackValidationResult {
  if (!params.code) {
    return { valid: false, error: "Missing authorization code" };
  }
  if (!params.state || params.state !== params.expectedState) {
    return { valid: false, error: "State mismatch (possible CSRF)" };
  }
  return { valid: true, code: params.code };
}

/**
 * インメモリストレージ実装（テストおよびフォールバック用）
 */
export class IndieAuthMemoryStorage implements IndieAuthStorage {
  private user: IndieAuthUser | null = null;
  private authState: StoredAuthState | null = null;

  getUser(): IndieAuthUser | null {
    return this.user;
  }

  setUser(user: IndieAuthUser): void {
    this.user = { ...user };
  }

  clearUser(): void {
    this.user = null;
  }

  saveAuthState(
    state: string,
    codeVerifier: string,
    me?: string,
    tokenEndpoint?: string,
    request?: { clientId: string; redirectUri: string },
  ): void {
    this.authState = { state, codeVerifier, me, tokenEndpoint, ...request };
  }

  getAuthState(): StoredAuthState | null {
    return this.authState ? { ...this.authState } : null;
  }

  clearAuthState(): void {
    this.authState = null;
  }
}

const STORAGE_KEY_USER = "marginalia_indieauth_user";
const STORAGE_KEY_AUTH = "marginalia_indieauth_state";

/**
 * LocalStorage / SessionStorage を用いたブラウザ用ストレージ実装
 */
export class IndieAuthBrowserStorage implements IndieAuthStorage {
  private memoryFallback = new IndieAuthMemoryStorage();

  constructor(private win: Window | undefined = typeof window !== "undefined" ? window : undefined) {}

  private isLocalStorageAvailable(): boolean {
    try {
      return !!this.win && typeof this.win.localStorage !== "undefined";
    } catch {
      return false;
    }
  }

  getUser(): IndieAuthUser | null {
    if (!this.isLocalStorageAvailable()) return this.memoryFallback.getUser();
    try {
      const raw = this.win!.localStorage.getItem(STORAGE_KEY_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return this.memoryFallback.getUser();
    }
  }

  setUser(user: IndieAuthUser): void {
    if (!this.isLocalStorageAvailable()) {
      this.memoryFallback.setUser(user);
      return;
    }
    try {
      this.win!.localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
    } catch {
      this.memoryFallback.setUser(user);
    }
  }

  clearUser(): void {
    if (!this.isLocalStorageAvailable()) {
      this.memoryFallback.clearUser();
      return;
    }
    try {
      this.win!.localStorage.removeItem(STORAGE_KEY_USER);
    } catch {
      this.memoryFallback.clearUser();
    }
  }

  saveAuthState(
    state: string,
    codeVerifier: string,
    me?: string,
    tokenEndpoint?: string,
    request?: { clientId: string; redirectUri: string },
  ): void {
    if (!this.isLocalStorageAvailable()) {
      this.memoryFallback.saveAuthState(state, codeVerifier, me, tokenEndpoint, request);
      return;
    }
    try {
      this.win!.sessionStorage.setItem(
        STORAGE_KEY_AUTH,
        JSON.stringify({ state, codeVerifier, me, tokenEndpoint, ...request }),
      );
    } catch {
      this.memoryFallback.saveAuthState(state, codeVerifier, me, tokenEndpoint, request);
    }
  }

  getAuthState(): StoredAuthState | null {
    if (!this.isLocalStorageAvailable()) return this.memoryFallback.getAuthState();
    try {
      const raw = this.win!.sessionStorage.getItem(STORAGE_KEY_AUTH);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return this.memoryFallback.getAuthState();
    }
  }

  clearAuthState(): void {
    if (!this.isLocalStorageAvailable()) {
      this.memoryFallback.clearAuthState();
      return;
    }
    try {
      this.win!.sessionStorage.removeItem(STORAGE_KEY_AUTH);
    } catch {
      this.memoryFallback.clearAuthState();
    }
  }
}

export type IndieAuthDiscovery = (profileUrl: string) => Promise<IndieAuthEndpoints>;

/** Resolve an endpoint and require HTTP(S); never allow executable URL schemes. */
export function validateEndpointUrl(endpoint: string, baseUrl?: string): string {
  const url = new URL(endpoint, baseUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("IndieAuth endpoints must use HTTP(S)");
  }
  return url.href;
}

export interface IndieAuthClientOptions {
  clientId: string;
  redirectUri: string;
  storage?: IndieAuthStorage;
  fetchFn?: typeof fetch;
  /** Use a site-provided discovery API for profiles that do not support CORS. */
  discoverEndpoints?: IndieAuthDiscovery;
  /** Browser origin used to avoid direct cross-origin HTML discovery. */
  discoveryOrigin?: string;
  defaultAuthEndpoint?: string;
  defaultTokenEndpoint?: string;
  scope?: string;
}

export interface HandleCallbackOptions {
  code: string;
  state: string;
  tokenEndpoint?: string;
}

/**
 * IndieAuth 認証クライアント
 * ディスカバリー、認可フロー開始、コールバック処理、セッション管理を行う
 */
export class IndieAuthClient {
  private clientId: string;
  private redirectUri: string;
  private storage: IndieAuthStorage;
  private fetchFn: typeof fetch;
  private defaultAuthEndpoint?: string;
  private defaultTokenEndpoint?: string;
  private scope?: string;
  private discoverEndpoints?: IndieAuthDiscovery;
  private discoveryOrigin?: string;

  constructor(options: IndieAuthClientOptions) {
    this.clientId = options.clientId;
    this.redirectUri = options.redirectUri;
    this.storage = options.storage || new IndieAuthBrowserStorage();
    this.fetchFn = options.fetchFn || (
      typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : () => Promise.reject(new Error("fetch is not available"))
    );
    this.defaultAuthEndpoint = options.defaultAuthEndpoint;
    this.defaultTokenEndpoint = options.defaultTokenEndpoint;
    this.scope = options.scope;
    this.discoverEndpoints = options.discoverEndpoints;
    this.discoveryOrigin = options.discoveryOrigin ??
      (typeof window !== "undefined" && !options.fetchFn ? window.location.origin : undefined);
    if (this.defaultAuthEndpoint) this.defaultAuthEndpoint = validateEndpointUrl(this.defaultAuthEndpoint);
    if (this.defaultTokenEndpoint) this.defaultTokenEndpoint = validateEndpointUrl(this.defaultTokenEndpoint);
  }

  async discover(profileUrl: string): Promise<IndieAuthEndpoints> {
    const canonical = normalizeProfileUrl(profileUrl);
    if (!canonical) {
      throw new Error(`Invalid profile URL: ${profileUrl}`);
    }

    let endpoints: IndieAuthEndpoints;
    if (this.discoverEndpoints) {
      endpoints = await this.discoverEndpoints(canonical);
    } else if (this.discoveryOrigin && new URL(canonical).origin !== this.discoveryOrigin) {
      if (!this.defaultAuthEndpoint) {
        throw new Error("External profiles require auth.discoverEndpoints (a same-origin discovery API)");
      }
      endpoints = {};
    } else {
      let res: Response;
      try {
        res = await this.fetchFn(canonical);
        if (!res.ok) throw new Error(`Profile responded with status ${res.status}`);
      } catch (err) {
        if (!this.defaultAuthEndpoint) throw err;
        return { me: canonical, authorizationEndpoint: this.defaultAuthEndpoint, tokenEndpoint: this.defaultTokenEndpoint };
      }
      const baseUrl = res.url || canonical;
      const linkHeader = res.headers.get("Link");
      endpoints = linkHeader ? extractEndpointsFromHeaders(linkHeader, baseUrl) : {};
      if (!endpoints.authorizationEndpoint || !endpoints.tokenEndpoint) {
        const htmlEndpoints = extractEndpointsFromHtml(await res.text(), baseUrl);
        endpoints.authorizationEndpoint ||= htmlEndpoints.authorizationEndpoint;
        endpoints.tokenEndpoint ||= htmlEndpoints.tokenEndpoint;
      }
    }
    const authorizationEndpoint = endpoints.authorizationEndpoint || this.defaultAuthEndpoint;
    const tokenEndpoint = endpoints.tokenEndpoint || this.defaultTokenEndpoint;
    return {
      me: canonical,
      authorizationEndpoint: authorizationEndpoint ? validateEndpointUrl(authorizationEndpoint, canonical) : undefined,
      tokenEndpoint: tokenEndpoint ? validateEndpointUrl(tokenEndpoint, canonical) : undefined,
    };
  }

  async startAuth(profileUrl: string): Promise<string> {
    const endpoints = await this.discover(profileUrl);
    if (!endpoints.authorizationEndpoint) {
      throw new Error(`Authorization endpoint not found for ${profileUrl}`);
    }

    const state = generateState();
    const verifier = generateCodeVerifier();
    const challenge = await generateCodeChallenge(verifier);

    const authUrl = buildAuthorizationUrl({
      authorizationEndpoint: endpoints.authorizationEndpoint,
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      me: endpoints.me || profileUrl,
      state,
      codeChallenge: challenge,
      scope: this.scope,
    });
    // For identity-only authorization, the code is verified at the authorization endpoint.
    this.storage.saveAuthState(
      state,
      verifier,
      endpoints.me,
      endpoints.tokenEndpoint || endpoints.authorizationEndpoint,
      { clientId: this.clientId, redirectUri: this.redirectUri },
    );
    return authUrl;
  }

  async handleCallback(options: HandleCallbackOptions): Promise<IndieAuthUser> {
    const authState = this.storage.getAuthState();
    if (!authState) {
      throw new Error("No stored auth state found");
    }

    const validation = verifyCallbackParams({
      code: options.code,
      state: options.state,
      expectedState: authState.state,
    });

    if (!validation.valid || !validation.code) {
      throw new Error(validation.error || "Callback validation failed");
    }

    const tokenEndpoint = authState.tokenEndpoint || options.tokenEndpoint || this.defaultTokenEndpoint;
    if (!tokenEndpoint) {
      throw new Error("Token endpoint is required to exchange authorization code");
    }

    validateEndpointUrl(tokenEndpoint);
    if (!authState.me) throw new Error("Stored auth state is missing the requested profile; sign in again");
    // Consume the validated state before exchanging the code to prevent callback replay.
    this.storage.clearAuthState();

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: validation.code,
      client_id: authState.clientId || this.clientId,
      redirect_uri: authState.redirectUri || this.redirectUri,
      code_verifier: authState.codeVerifier,
    });

    const res = await this.fetchFn(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      throw new Error(`Token endpoint responded with status ${res.status}`);
    }

    const data = (await res.json()) as Record<string, unknown>;
    const me = typeof data.me === "string" ? normalizeProfileUrl(data.me) : null;
    if (!me) {
      throw new Error("Response from token endpoint did not contain 'me'");
    }

    if (me !== authState.me) {
      throw new Error("Returned identity does not match the requested profile");
    }

    const profile = (typeof data.profile === "object" && data.profile !== null)
      ? (data.profile as Record<string, unknown>)
      : {};

    const user: IndieAuthUser = {
      me,
      name: typeof profile.name === "string" ? profile.name : undefined,
      url: typeof profile.url === "string" ? profile.url : me,
      photo: typeof profile.photo === "string" ? profile.photo : undefined,
      email: typeof profile.email === "string" ? profile.email : undefined,
    };

    this.storage.setUser(user);

    return user;
  }

  /** Process only redirects for an outstanding request on the configured callback page. */
  async handleRedirect(callbackUrl: string): Promise<boolean> {
    const url = new URL(callbackUrl);
    const authState = this.storage.getAuthState();
    const redirect = new URL(authState?.redirectUri || this.redirectUri);
    if (url.origin !== redirect.origin || url.pathname !== redirect.pathname ||
      !authState ||
      (!url.searchParams.has("code") && !url.searchParams.has("error"))) return false;
    if (url.searchParams.has("error")) {
      if (url.searchParams.get("state") !== authState.state) {
        throw new Error("State mismatch (possible CSRF)");
      }
      this.storage.clearAuthState();
      throw new Error(`IndieAuth authorization failed: ${url.searchParams.get("error")}`);
    }
    await this.handleCallback({ code: url.searchParams.get("code") || "", state: url.searchParams.get("state") || "" });
    return true;
  }

  getUser(): IndieAuthUser | null {
    return this.storage.getUser();
  }

  signOut(): void {
    this.storage.clearUser();
    this.storage.clearAuthState();
  }
}

