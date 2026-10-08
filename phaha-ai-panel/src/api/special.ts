import { api } from "./client";
import type { JobCreated, SpecialPreset, SpecialRequest } from "./types";

export function createSpecialJob(body: SpecialRequest) {
  return api.post<JobCreated>("/api/special", body);
}

export async function getSpecialPresets(): Promise<SpecialPreset[]> {
  const res = await api.get<{ presets: SpecialPreset[] } | SpecialPreset[]>("/api/special/presets");
  return Array.isArray(res) ? res : res?.presets ?? [];
}
