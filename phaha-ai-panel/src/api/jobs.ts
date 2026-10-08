import { api } from "./client";
import type { JobState } from "./types";

export function getJob(id: string) {
  return api.get<JobState>(`/api/jobs/${encodeURIComponent(id)}`);
}

export function cancelJob(id: string) {
  return api.post<{ ok: boolean }>(`/api/jobs/${encodeURIComponent(id)}/cancel`);
}
