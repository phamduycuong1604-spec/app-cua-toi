"""Hàng đợi việc: xử lý lần lượt từng file ở chạy ngầm để trang web không bị treo."""
import json
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import config

# Mỗi lần chỉ xử lý 1 file (mô hình AI tốn RAM), file sau xếp hàng chờ
_executor = ThreadPoolExecutor(max_workers=1)
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def job_dir(job_id: str) -> Path:
    return config.DATA_DIR / job_id


def create(filename: str, kind: str) -> dict:
    _cleanup_old()
    job = {
        "id": uuid.uuid4().hex,
        "filename": filename,
        "kind": kind,
        "status": "queued",  # queued → running → done | error
        "progress": 0.0,
        "message": "Đang xếp hàng chờ…",
        "created": time.time(),
    }
    job_dir(job["id"]).mkdir(parents=True)
    with _lock:
        _jobs[job["id"]] = job
    return job


def get(job_id: str) -> dict | None:
    with _lock:
        job = _jobs.get(job_id)
    if job is None:  # máy chủ vừa khởi động lại: đọc từ ổ đĩa
        meta = job_dir(job_id) / "job.json"
        if meta.exists():
            job = json.loads(meta.read_text("utf-8"))
    return job


def update(job_id: str, **fields) -> None:
    with _lock:
        if job_id in _jobs:
            _jobs[job_id].update(fields)


def submit(job: dict, fn) -> None:
    """Chạy fn(progress) ở chạy ngầm; fn trả về dict gộp vào kết quả job."""
    jid = job["id"]

    def progress(value: float, message: str):
        update(jid, progress=round(value, 3), message=message)

    def run():
        update(jid, status="running", message="Đang bắt đầu…")
        try:
            result = fn(progress) or {}
            update(jid, status="done", progress=1.0,
                   message=result.pop("message", "Xong!"), **result)
        except Exception as e:  # báo lỗi rõ ràng cho người dùng
            traceback.print_exc()
            update(jid, status="error", message=str(e) or e.__class__.__name__)
        with _lock:
            meta = {k: v for k, v in _jobs[jid].items() if k != "regions"}
        (job_dir(jid) / "job.json").write_text(json.dumps(meta, ensure_ascii=False), "utf-8")

    _executor.submit(run)


def _cleanup_old() -> None:
    limit = time.time() - config.KEEP_HOURS * 3600
    for d in config.DATA_DIR.iterdir():
        if d.is_dir() and d.stat().st_mtime < limit:
            shutil.rmtree(d, ignore_errors=True)
            with _lock:
                _jobs.pop(d.name, None)
