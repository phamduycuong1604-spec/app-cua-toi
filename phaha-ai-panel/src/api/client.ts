// Bộ gọi máy chủ: tự gắn token, tự gia hạn token khi hết hạn, dịch lỗi sang tiếng Việt.
import { DEFAULT_API_BASE } from "../config";
import { base64ToBytes } from "../lib/base64";

const KEY_BASE = "phaha.apiBase";
const KEY_TOKEN = "phaha.token";
const KEY_REFRESH = "phaha.refresh";
const KEY_EXPIRES = "phaha.expires";

export class ApiError extends Error {
  constructor(message: string, public status = 0, public code?: string) {
    super(message);
  }
}

function lsGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function lsSet(k: string, v: string | null) {
  try {
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* bỏ qua */
  }
}

export function getApiBase(): string {
  return (lsGet(KEY_BASE) || DEFAULT_API_BASE).replace(/\/+$/, "");
}
export function setApiBase(url: string) {
  lsSet(KEY_BASE, url.trim() ? url.trim().replace(/\/+$/, "") : null);
}

export function saveTokens(token: string, refresh?: string, expiresIn?: number) {
  lsSet(KEY_TOKEN, token);
  if (refresh) lsSet(KEY_REFRESH, refresh);
  lsSet(KEY_EXPIRES, expiresIn ? String(Date.now() + expiresIn * 1000) : null);
}
export function clearTokens() {
  lsSet(KEY_TOKEN, null);
  lsSet(KEY_REFRESH, null);
  lsSet(KEY_EXPIRES, null);
}
export function hasToken() {
  return !!lsGet(KEY_TOKEN);
}

/** Được gọi khi phiên đăng nhập hết hẳn (App sẽ chuyển về màn hình đăng nhập). */
let onSessionExpired: () => void = () => undefined;
export function setSessionExpiredHandler(fn: () => void) {
  onSessionExpired = fn;
}

let refreshing: Promise<boolean> | null = null;

async function refreshToken(): Promise<boolean> {
  const refresh = lsGet(KEY_REFRESH);
  if (!refresh) return false;
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await fetch(getApiBase() + "/api/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refresh }),
        });
        if (!res.ok) return false;
        const data = await res.json();
        if (!data.token) return false;
        saveTokens(data.token, data.refresh_token || refresh, data.expires_in);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => (refreshing = null), 0);
      }
    })();
  }
  return refreshing;
}

function friendlyMessage(status: number, serverMsg?: string): string {
  if (serverMsg) return serverMsg;
  if (status === 401) return "Phiên đăng nhập đã hết, hãy đăng nhập lại.";
  if (status === 402) return "Không đủ điểm. Bấm 'Nạp điểm' để nạp thêm.";
  if (status === 413) return "Ảnh quá lớn để gửi lên máy chủ.";
  if (status === 429) return "Bạn gửi quá nhanh, đợi vài giây rồi thử lại.";
  if (status >= 500) return "Máy chủ PhaHa đang gặp sự cố, thử lại sau ít phút.";
  return `Lỗi máy chủ (mã ${status}).`;
}

export async function request<T>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
  opts: { auth?: boolean; retried?: boolean } = {},
): Promise<T> {
  const auth = opts.auth !== false;
  if (auth) {
    const exp = Number(lsGet(KEY_EXPIRES) || 0);
    if (exp && exp - Date.now() < 60_000) await refreshToken();
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const token = lsGet(KEY_TOKEN);
  if (auth && token) headers.Authorization = "Bearer " + token;

  let res: Response;
  try {
    res = await fetch(getApiBase() + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(`Không kết nối được máy chủ (${getApiBase()}). Kiểm tra mạng hoặc địa chỉ máy chủ.`);
  }

  if (res.status === 401 && auth && !opts.retried) {
    if (await refreshToken()) return request<T>(method, path, body, { ...opts, retried: true });
    clearTokens();
    onSessionExpired();
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error || data?.message;
    throw new ApiError(friendlyMessage(res.status, typeof msg === "string" ? msg : undefined), res.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
};

/** Tải ảnh kết quả: nhận base64, data URL hoặc http(s) URL. */
export async function fetchBinary(src: string): Promise<Uint8Array> {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new ApiError(`Không tải được ảnh kết quả (mã ${res.status}).`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
  return base64ToBytes(src);
}
