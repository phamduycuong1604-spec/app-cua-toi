import React, { useEffect, useState } from "react";
import { useStore, isActive, type Job } from "../../state/store";
import { cancelJob, insertResult } from "../../jobs/manager";
import { statusColor } from "../../styles/theme";

const STATUS_TEXT: Record<string, string> = {
  submitting: "Đang gửi",
  pending: "Đang chờ",
  running: "AI đang xử lý",
  inserting: "Đang chèn layer",
  done: "Xong",
  error: "Lỗi",
  canceled: "Đã hủy",
};

function elapsed(job: Job, now: number) {
  const s = Math.max(0, Math.round(((job.finishedAt ?? now) - job.createdAt) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}p${String(s % 60).padStart(2, "0")}`;
}

function JobRow({ job, now }: { job: Job; now: number }) {
  const active = isActive(job);
  let sub = STATUS_TEXT[job.status] ?? job.status;
  if (job.status === "error" && job.error) sub = "Lỗi: " + job.error;
  if (job.waitingManualInsert) sub = "Xong — ảnh gốc đã đóng";
  return (
    <div className="job">
      <div className="dot" style={{ backgroundColor: job.waitingManualInsert ? "#e8a33d" : statusColor[job.status] }} />
      <div className="jl">
        <div className="jt" title={job.label}>
          {job.label}
        </div>
        <div className="js">
          {sub} · {elapsed(job, now)}
          {job.cost > 0 ? ` · ${job.cost}đ` : ""}
        </div>
        {active && job.progress != null && job.progress > 0 && (
          <div className="progress">
            <div className="bar" style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
        )}
      </div>
      {job.waitingManualInsert && (
        <div className="btn small primary" onClick={() => insertResult(job.localId, true)}>
          Chèn
        </div>
      )}
      {active && job.status !== "inserting" ? (
        <div className="jx" title="Hủy job" onClick={() => cancelJob(job.localId)}>
          Hủy
        </div>
      ) : (
        !active && (
          <div className="jx" title="Ẩn" onClick={() => useStore.getState().removeJob(job.localId)}>
            ✕
          </div>
        )
      )}
    </div>
  );
}

export function JobQueue() {
  const jobs = useStore((s) => s.jobs);
  const clear = useStore((s) => s.clearFinishedJobs);
  const [now, setNow] = useState(Date.now());
  const running = jobs.filter(isActive).length;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!jobs.length) return null;
  return (
    <div className="queue">
      <div className="queue-head">
        <span>Hàng đợi · {running ? `${running} đang chạy` : "không có job chạy"}</span>
        <span className="spacer" />
        <span className="link" onClick={clear}>
          Dọn job xong
        </span>
      </div>
      {jobs.map((j) => (
        <JobRow key={j.localId} job={j} now={now} />
      ))}
    </div>
  );
}
