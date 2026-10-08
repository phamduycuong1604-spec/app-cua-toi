import { api } from "./client";
import type { DetectedRegion, JobCreated, RetouchRequest } from "./types";

export function createRetouchJob(body: RetouchRequest) {
  return api.post<JobCreated>("/api/retouch", body);
}

/** Nhận diện vùng cơ thể: Đầu / Cổ vai / Tay / Chân. */
export async function detectRegions(image: string): Promise<DetectedRegion[]> {
  const res = await api.post<{ regions: DetectedRegion[] }>("/api/retouch/detect", { image });
  return res?.regions ?? [];
}
