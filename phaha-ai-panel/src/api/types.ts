// Định dạng dữ liệu trao đổi với máy chủ PhaHa AI (xem README → "Hợp đồng API").
import type { GenModel } from "../config";
import type { Bounds } from "../lib/bounds";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url?: string;
  credits: number;
}

export interface LoginResponse {
  token: string;
  refresh_token?: string;
  /** số giây token còn hạn */
  expires_in?: number;
  user?: User;
}

/** Máy chủ nhận việc → trả mã job để hỏi trạng thái. */
export interface JobCreated {
  job_id: string;
  cost?: number;
  credits_left?: number;
}

export type JobStatus = "pending" | "running" | "done" | "error" | "canceled";

/** Một layer kết quả. Toạ độ x/y/width/height tính theo ẢNH ĐÃ GỬI (không bắt buộc). */
export interface ResultLayer {
  name?: string;
  /** base64 / data URL / http(s) URL của PNG hoặc JPEG */
  image: string;
  /** mask xám (trắng = hiện) — tùy chọn */
  mask?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface JobState {
  id: string;
  status: JobStatus;
  progress?: number;
  error?: string;
  credits_left?: number;
  result?: { layers: ResultLayer[] };
}

export interface GenRequest {
  prompt: string;
  model: GenModel;
  image?: string;
  mask?: string;
  ref?: string;
  face_lock?: boolean;
  free?: boolean;
  max_side?: number;
}

export type RetouchType = "skin" | "clothes" | "custom";

export interface RetouchRequest {
  image: string;
  region: Bounds;
  mask?: string;
  type: RetouchType;
  name?: string;
  quality?: "standard" | "4k";
}

export interface DetectedRegion {
  label: string; // "head" | "neck_shoulder" | "arms" | "legs" ...
  name?: string; // tên tiếng Việt
  /** khung theo toạ độ ẢNH ĐÃ GỬI */
  bounds: Bounds;
}

export interface SpecialRequest {
  image: string;
  preset: string;
  ref?: string;
}

export interface UpscaleRequest {
  image: string;
  scale?: 2 | 4;
  mpx?: 12 | 24;
  /** Kích thước đầu ra mong muốn (theo khổ ảnh gốc trong Photoshop). */
  target_width?: number;
  target_height?: number;
}

export interface PromptGroup {
  id: string;
  name: string;
  prompts: { title: string; prompt: string }[];
}

export interface SpecialPreset {
  id: string;
  name: string;
  group: "hair" | "makeup" | "dress" | "tone";
  thumbnail?: string;
  supports_ref?: boolean;
}

export interface Transaction {
  id: string;
  created_at: string;
  amount: number;
  description: string;
  balance?: number;
}
