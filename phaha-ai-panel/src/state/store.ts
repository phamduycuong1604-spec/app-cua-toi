// Kho trạng thái chung của panel (zustand): người dùng, điểm, tab, hàng đợi job, thông báo.
import { create } from "zustand";
import type { ResultLayer, User } from "../api/types";
import type { GrayImage } from "../lib/image";
import type { Bounds } from "../lib/bounds";

export type TabId = "gen" | "retouch" | "special" | "free" | "upscale";
export type JobKind = TabId;
export type AuthStatus = "checking" | "loggedOut" | "loggedIn";

/** Thông tin để chèn kết quả về đúng chỗ trong Photoshop. */
export interface InsertTarget {
  docId: number;
  docTitle: string;
  docWidth: number;
  docHeight: number;
  /** Vùng ảnh đã gửi đi (toạ độ trong tài liệu). */
  bounds: Bounds;
  /** Kích thước ảnh thực gửi lên (sau khi thu nhỏ). */
  sentWidth: number;
  sentHeight: number;
  /** Mask vùng chọn cỡ bằng `bounds`, đã làm mềm — dùng khi "chỉ sửa vùng chọn". */
  selectionMask?: GrayImage;
  layerName: string;
  /** 0..100 */
  opacity?: number;
  /** overlay = đặt đè lên vùng gốc; upscale = phóng cả tài liệu rồi chèn. */
  mode: "overlay" | "upscale";
}

export type JobUiStatus = "submitting" | "pending" | "running" | "inserting" | "done" | "error" | "canceled";

export interface Job {
  localId: string;
  serverId?: string;
  kind: JobKind;
  label: string;
  status: JobUiStatus;
  progress?: number;
  error?: string;
  cost: number;
  createdAt: number;
  finishedAt?: number;
  target: InsertTarget;
  /** Đã chèn layer vào Photoshop chưa. */
  inserted: boolean;
  /** Kết quả đã về nhưng ảnh gốc bị đóng → chờ người dùng bấm chèn. */
  waitingManualInsert?: boolean;
  resultLayers?: ResultLayer[];
  layerIds?: number[];
}

export type ToastKind = "info" | "success" | "error" | "warning";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
}

interface State {
  authStatus: AuthStatus;
  user: User | null;
  tab: TabId;
  jobs: Job[];
  toasts: Toast[];
  showHistory: boolean;

  setAuth: (status: AuthStatus, user?: User | null) => void;
  setCredits: (credits: number) => void;
  setTab: (tab: TabId) => void;
  setShowHistory: (v: boolean) => void;
  addJob: (job: Job) => void;
  updateJob: (localId: string, patch: Partial<Job>) => void;
  removeJob: (localId: string) => void;
  clearFinishedJobs: () => void;
  toast: (kind: ToastKind, text: string) => void;
  dismissToast: (id: number) => void;
}

let toastSeq = 1;

export const useStore = create<State>((set, get) => ({
  authStatus: "checking",
  user: null,
  tab: "gen",
  jobs: [],
  toasts: [],
  showHistory: false,

  setAuth: (authStatus, user) => set({ authStatus, user: user === undefined ? get().user : user }),
  setCredits: (credits) => {
    const u = get().user;
    if (u) set({ user: { ...u, credits } });
  },
  setTab: (tab) => set({ tab }),
  setShowHistory: (showHistory) => set({ showHistory }),
  addJob: (job) => set({ jobs: [job, ...get().jobs].slice(0, 50) }),
  updateJob: (localId, patch) =>
    set({ jobs: get().jobs.map((j) => (j.localId === localId ? { ...j, ...patch } : j)) }),
  removeJob: (localId) => set({ jobs: get().jobs.filter((j) => j.localId !== localId) }),
  clearFinishedJobs: () =>
    set({ jobs: get().jobs.filter((j) => !isFinished(j)) }),
  toast: (kind, text) => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, kind, text }].slice(-4) });
    setTimeout(() => get().dismissToast(id), kind === "error" ? 8000 : 4500);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function isFinished(j: Job) {
  return (j.status === "done" && !j.waitingManualInsert) || j.status === "error" || j.status === "canceled";
}

export function isActive(j: Job) {
  return j.status === "submitting" || j.status === "pending" || j.status === "running" || j.status === "inserting";
}

/** Dùng ngoài React. */
export const toast = (kind: ToastKind, text: string) => useStore.getState().toast(kind, text);
