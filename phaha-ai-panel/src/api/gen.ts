import { api } from "./client";
import type { GenRequest, JobCreated, PromptGroup } from "./types";

export function createGenJob(body: GenRequest) {
  return api.post<JobCreated>("/api/gen", body);
}

export async function getPromptGroups(): Promise<PromptGroup[]> {
  const res = await api.get<{ groups: PromptGroup[] } | PromptGroup[]>("/api/prompts");
  return Array.isArray(res) ? res : res?.groups ?? [];
}
