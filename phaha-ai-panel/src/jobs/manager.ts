// Hàng đợi job: gửi lên máy chủ → hỏi trạng thái mỗi 2 giây → xong thì tự chèn layer vào Photoshop.
import { POLL_MS, MASK_FEATHER_PX } from "../config";
import { fetchBinary, ApiError } from "../api/client";
import { cancelJob as apiCancel, getJob } from "../api/jobs";
import { getMe } from "../api/auth";
import type { JobCreated, ResultLayer } from "../api/types";
import { decodeImage, decodeMask } from "../lib/image";
import { insertLayers, resizeDocument, type LayerPayload } from "../photoshop/layers";
import { getActiveDocInfo, isDocOpen } from "../photoshop/document";
import { friendlyPsError, runModal } from "../photoshop/modal";
import { useStore, type InsertTarget, type Job, type JobKind } from "../state/store";
import { placeLayer, prepareLayerPixels } from "./placement";

let seq = 1;
const inflight = new Set<string>();
/** Ai đó (vd. chạy hàng loạt) đang chờ job xong. */
const waiters = new Map<string, { resolve: (j: Job) => void; reject: (e: Error) => void }>();

const S = () => useStore.getState();
const getJobLocal = (id: string) => S().jobs.find((j) => j.localId === id);

export interface SubmitOptions {
  kind: JobKind;
  label: string;
  cost: number;
  target: InsertTarget;
  create: () => Promise<JobCreated>;
  /** Không hiện toast thành công (dùng cho hàng loạt). */
  quiet?: boolean;
}

function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.message;
  return friendlyPsError(e);
}

/** Đưa 1 job vào hàng đợi. `done` xong khi layer đã được chèn (hoặc lỗi). */
export function submitJob(opts: SubmitOptions): { localId: string; done: Promise<Job> } {
  const localId = `j${Date.now()}_${seq++}`;
  const job: Job = {
    localId,
    kind: opts.kind,
    label: opts.label,
    status: "submitting",
    cost: opts.cost,
    createdAt: Date.now(),
    target: opts.target,
    inserted: false,
  };
  S().addJob(job);
  if (opts.quiet) quietJobs.add(localId);
  const done = new Promise<Job>((resolve, reject) => waiters.set(localId, { resolve, reject }));
  done.catch(() => undefined);

  opts
    .create()
    .then((res) => {
      if (!res?.job_id) throw new Error("Máy chủ không trả về mã job.");
      S().updateJob(localId, { serverId: res.job_id, status: "pending", cost: res.cost ?? opts.cost });
      if (typeof res.credits_left === "number") S().setCredits(res.credits_left);
      ensurePolling();
    })
    .catch((e) => fail(localId, errMsg(e)));
  return { localId, done };
}

const quietJobs = new Set<string>();

function fail(localId: string, message: string) {
  S().updateJob(localId, { status: "error", error: message, finishedAt: Date.now() });
  S().toast("error", message);
  const w = waiters.get(localId);
  if (w) {
    waiters.delete(localId);
    w.reject(new Error(message));
  }
}

function finish(localId: string) {
  const j = getJobLocal(localId);
  const w = waiters.get(localId);
  if (j && w && j.inserted) {
    waiters.delete(localId);
    w.resolve(j);
  }
}

// ── Hỏi trạng thái ─────────────────────────────────────────────

let timer: ReturnType<typeof setInterval> | null = null;

function ensurePolling() {
  if (timer) return;
  timer = setInterval(tick, POLL_MS);
}

async function tick() {
  const active = S().jobs.filter((j) => j.serverId && (j.status === "pending" || j.status === "running"));
  if (active.length === 0) {
    if (timer) clearInterval(timer);
    timer = null;
    return;
  }
  await Promise.all(active.map((j) => pollOne(j.localId)));
}

async function pollOne(localId: string) {
  if (inflight.has(localId)) return;
  const j = getJobLocal(localId);
  if (!j?.serverId) return;
  inflight.add(localId);
  try {
    const st = await getJob(j.serverId);
    const cur = getJobLocal(localId);
    if (!cur || cur.status === "canceled") return;
    if (typeof st.credits_left === "number") S().setCredits(st.credits_left);
    if (st.status === "pending" || st.status === "running") {
      S().updateJob(localId, { status: st.status, progress: st.progress });
    } else if (st.status === "done") {
      const layers = st.result?.layers ?? [];
      if (!layers.length) return fail(localId, "Máy chủ báo xong nhưng không có ảnh kết quả.");
      S().updateJob(localId, { status: "inserting", resultLayers: layers, progress: 1 });
      refreshCredits();
      await insertResult(localId);
    } else if (st.status === "canceled") {
      S().updateJob(localId, { status: "canceled", finishedAt: Date.now() });
    } else {
      fail(localId, st.error || "AI xử lý thất bại.");
    }
  } catch (e) {
    // Lỗi mạng tạm thời: thử lại ở lượt sau. Lỗi phiên đăng nhập/404: báo lỗi.
    if (e instanceof ApiError && (e.status === 401 || e.status === 404)) fail(localId, e.message);
  } finally {
    inflight.delete(localId);
  }
}

// ── Chèn kết quả vào Photoshop ────────────────────────────────

async function buildPayloads(target: InsertTarget, layers: ResultLayer[]): Promise<LayerPayload[]> {
  const out: LayerPayload[] = [];
  for (let i = 0; i < layers.length; i++) {
    const meta = layers[i];
    const decoded = decodeImage(await fetchBinary(meta.image));
    const serverMask = meta.mask ? decodeMask(await fetchBinary(meta.mask)) : null;
    const p = placeLayer(target, meta, decoded);
    const px = prepareLayerPixels(target, p, decoded, serverMask, MASK_FEATHER_PX);
    const name = meta.name || (layers.length > 1 && i > 0 ? `${target.layerName} ${i + 1}` : target.layerName);
    out.push({ name, image: px.image, mask: px.mask, left: p.left, top: p.top, opacity: target.opacity });
  }
  return out;
}

/** Chèn layer cho job đã xong. `intoDoc` = chèn vào tài liệu khác (khi ảnh gốc đã đóng). */
export async function insertResult(localId: string, intoActiveDoc = false) {
  const j = getJobLocal(localId);
  if (!j?.resultLayers) return;
  let target = j.target;

  if (intoActiveDoc) {
    const doc = getActiveDocInfo();
    if (!doc) {
      S().toast("warning", "Hãy mở một ảnh trong Photoshop trước.");
      return;
    }
    // Co giãn vùng theo tỉ lệ khổ ảnh mới.
    const kx = doc.width / target.docWidth;
    const ky = doc.height / target.docHeight;
    target = {
      ...target,
      docId: doc.id,
      docTitle: doc.title,
      docWidth: doc.width,
      docHeight: doc.height,
      bounds: {
        left: Math.round(target.bounds.left * kx),
        top: Math.round(target.bounds.top * ky),
        right: Math.round(target.bounds.right * kx),
        bottom: Math.round(target.bounds.bottom * ky),
      },
      selectionMask: undefined,
    };
  } else if (!isDocOpen(target.docId)) {
    S().updateJob(localId, { status: "done", waitingManualInsert: true, finishedAt: Date.now() });
    S().toast("warning", `Kết quả "${j.label}" đã xong nhưng ảnh "${target.docTitle}" đã đóng. Bấm "Chèn" trong hàng đợi để chèn vào ảnh đang mở.`);
    return;
  }

  S().updateJob(localId, { status: "inserting" });
  try {
    const payloads = await buildPayloads(target, j.resultLayers);
    const ids = await runModal(
      "PhaHa AI: chèn layer",
      async () => {
        if (target.mode === "upscale") {
          const p = payloads[0];
          if (p.image.width > target.docWidth) await resizeDocument(target.docId, p.image.width, p.image.height);
        }
        return insertLayers(target.docId, payloads);
      },
      { historyDocId: target.docId, historyName: `PhaHa AI – ${j.label}` },
    );
    S().updateJob(localId, {
      status: "done",
      inserted: true,
      waitingManualInsert: false,
      layerIds: ids,
      finishedAt: Date.now(),
      target,
    });
    if (!quietJobs.has(localId)) S().toast("success", `Xong: đã thêm layer "${payloads[0].name}"`);
    finish(localId);
  } catch (e) {
    fail(localId, "Không chèn được layer: " + errMsg(e));
  }
}

export async function cancelJob(localId: string) {
  const j = getJobLocal(localId);
  if (!j) return;
  if (j.serverId) {
    try {
      await apiCancel(j.serverId);
    } catch (e) {
      // Máy chủ không hỗ trợ hủy → vẫn bỏ khỏi hàng đợi phía panel.
      if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405)) {
        S().toast("warning", "Không hủy được trên máy chủ: " + errMsg(e));
      }
    }
  }
  S().updateJob(localId, { status: "canceled", finishedAt: Date.now() });
  const w = waiters.get(localId);
  if (w) {
    waiters.delete(localId);
    w.reject(new Error("Đã hủy"));
  }
  refreshCredits();
}

export async function refreshCredits() {
  try {
    const me = await getMe();
    if (S().authStatus === "loggedIn") S().setAuth("loggedIn", me);
  } catch {
    /* bỏ qua — lần sau thử lại */
  }
}

/** Kiểm tra đủ điểm trước khi chạy. Trả về false (và cảnh báo) nếu thiếu. */
export function checkCredits(cost: number): boolean {
  const credits = S().user?.credits ?? 0;
  if (cost > 0 && credits < cost) {
    S().toast("error", `Không đủ điểm: cần ${cost}đ, bạn còn ${credits}đ. Bấm "Nạp điểm" để nạp thêm.`);
    return false;
  }
  return true;
}

export { errMsg as jobErrorMessage };
