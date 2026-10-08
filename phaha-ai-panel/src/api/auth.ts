import { api, clearTokens, request, saveTokens } from "./client";
import type { LoginResponse, Transaction, User } from "./types";

export async function login(email: string, password: string): Promise<User> {
  const res = await request<LoginResponse>("POST", "/api/auth/login", { email, password }, { auth: false });
  if (!res?.token) throw new Error("Máy chủ không trả về token đăng nhập.");
  saveTokens(res.token, res.refresh_token, res.expires_in);
  return res.user ?? (await getMe());
}

export function getMe(): Promise<User> {
  return api.get<User>("/api/me");
}

export function logout() {
  clearTokens();
}

export async function getTransactions(): Promise<Transaction[]> {
  const res = await api.get<{ items: Transaction[] } | Transaction[]>("/api/transactions");
  return Array.isArray(res) ? res : res?.items ?? [];
}
