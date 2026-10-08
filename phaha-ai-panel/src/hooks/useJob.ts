import { useStore, isActive } from "../state/store";

export { submitJob, cancelJob, insertResult, checkCredits } from "../jobs/manager";

/** Danh sách job + số job đang chạy (cho JobQueue và nút bấm). */
export function useJobs() {
  const jobs = useStore((s) => s.jobs);
  return { jobs, activeCount: jobs.filter(isActive).length };
}
