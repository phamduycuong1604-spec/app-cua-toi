"""Máy chủ TransKeep: nhận file, xếp hàng xử lý, trả kết quả, phục vụ trang web."""
import json
from pathlib import Path

from fastapi import Body, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import config, jobs
from .pipeline import image_job, inpaint, translate
from .pipeline.render import FONT_FILES

app = FastAPI(title="TransKeep")
FRONTEND = Path(__file__).resolve().parents[2] / "frontend"
VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv"}
PUBLIC_FILES = {"original.png", "result.png"}


def _check_password(request: Request):
    if config.APP_PASSWORD and request.headers.get("x-app-password") != config.APP_PASSWORD:
        raise HTTPException(401, "Sai mật khẩu vào app.")


@app.get("/api/info")
def info():
    return {
        "need_password": bool(config.APP_PASSWORD),
        "lama": inpaint.lama_available(),
        "server_keys": [p for p, k in config.API_KEYS.items() if k],
        "providers": list(translate.PROVIDERS),
        "domains": translate.DOMAINS,
        "fonts": list(FONT_FILES),
    }


@app.post("/api/jobs")
async def create_job(request: Request, file: UploadFile = File(...), options: str = Form("{}")):
    _check_password(request)
    ext = Path(file.filename or "").suffix.lower()
    if ext in VIDEO_EXT:
        raise HTTPException(400, "Dịch video sẽ có ở Phase 4. Hiện tại hãy thử với ảnh.")
    if ext not in image_job.IMAGE_EXT:
        raise HTTPException(400, f"Chưa hỗ trợ loại file '{ext}'.")
    opts = json.loads(options or "{}")

    job = jobs.create(file.filename, "image")
    src = jobs.job_dir(job["id"]) / f"input{ext}"
    size, limit = 0, config.MAX_UPLOAD_MB * 1024 * 1024
    with open(src, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, f"File quá lớn (tối đa {config.MAX_UPLOAD_MB} MB).")
            f.write(chunk)

    jobs.submit(job, lambda progress: image_job.process(jobs.job_dir(job["id"]), src, opts, progress))
    return job


def _job_or_404(job_id: str) -> dict:
    job = jobs.get(job_id) if job_id.isalnum() else None
    if job is None:
        raise HTTPException(404, "Không tìm thấy việc này (có thể đã bị xóa sau 24 giờ).")
    return job


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    job = dict(_job_or_404(job_id))
    regions_file = jobs.job_dir(job_id) / "regions.json"
    if job["status"] == "done" and "regions" not in job and regions_file.exists():
        job["regions"] = json.loads(regions_file.read_text("utf-8"))
    return job


@app.get("/api/jobs/{job_id}/files/{name}")
def get_file(job_id: str, name: str):
    _job_or_404(job_id)
    path = jobs.job_dir(job_id) / name
    if name not in PUBLIC_FILES or not path.exists():
        raise HTTPException(404, "Chưa có file này.")
    return FileResponse(path, headers={"Cache-Control": "no-store"})


@app.put("/api/jobs/{job_id}/regions")
def update_regions(request: Request, job_id: str, regions: list[dict] = Body(..., embed=True)):
    _check_password(request)
    job = _job_or_404(job_id)
    if job["status"] != "done":
        raise HTTPException(409, "Việc này chưa xử lý xong.")
    regions = image_job.rerender(jobs.job_dir(job_id), regions)
    jobs.update(job_id, regions=regions)
    return {"regions": regions}


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="web")
