import { api } from "./client";
import type { JobCreated, UpscaleRequest } from "./types";

export function createUpscaleJob(body: UpscaleRequest) {
  return api.post<JobCreated>("/api/upscale", body);
}
