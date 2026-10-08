// Test toàn luồng với máy chủ giả lập thật (HTTP) + Photoshop giả.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";

// localStorage giả (Node không có sẵn)
const mem = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

import { calls, fakeState, doc } from "./fakes/photoshop";
import { setApiBase } from "../src/api/client";
import { login, getMe } from "../src/api/auth";
import { createGenJob } from "../src/api/gen";
import { createUpscaleJob } from "../src/api/upscale";
import { captureSource, toTarget } from "../src/jobs/capture";
import { submitJob } from "../src/jobs/manager";
import { useStore } from "../src/state/store";
import { layerNameFromPrompt } from "../src/components/Gen/GenPanel";

const PORT = 18787;
let server: ChildProcess;

before(async () => {
  server = spawn(process.execPath, [join(process.cwd(), "mock-server/server.mjs")], {
    env: { ...process.env, PORT: String(PORT), JOB_SECONDS: "1" },
    stdio: "ignore",
  });
  for (let i = 0; i < 50; i++) {
    try {
      await fetch(`http://localhost:${PORT}/`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  setApiBase(`http://localhost:${PORT}`);
});

after(() => server.kill());

test("đăng nhập → nhận user + 500 điểm, token được lưu", async () => {
  const u = await login("test@phaha.ai", "123");
  assert.equal(u.credits, 500);
  assert.ok(mem.get("phaha.token"));
  useStore.getState().setAuth("loggedIn", u);
});

test("Gen + Chỉ sửa vùng chọn + Giữ mặt → 2 layer có mask, đúng vị trí, trừ 17 điểm", async () => {
  calls.length = 0;
  fakeState.selection = { left: 200, top: 100, right: 600, bottom: 400 };
  const src = await captureSource({ maxSide: 2048, selection: "require", uploadMask: true });
  assert.ok(src.usedSelection);
  assert.ok(src.uploadMask?.startsWith("data:image/png;base64,"));
  // vùng chọn được nới 15% mỗi phía
  assert.deepEqual(src.bounds, { left: 140, top: 55, right: 660, bottom: 445 });

  const prompt = "Thay bầu trời thành hoàng hôn cam tím rực rỡ thật đẹp";
  const { done } = submitJob({
    kind: "gen",
    label: prompt,
    cost: 17,
    target: toTarget(src, layerNameFromPrompt(prompt)),
    create: () => createGenJob({ prompt, model: "gpt-image-2.5", image: src.image, mask: src.uploadMask, face_lock: true }),
  });
  const job = await done;
  assert.equal(job.status, "done");
  assert.equal(job.layerIds?.length, 2);

  const created = calls.filter((c) => c.op === "createPixelLayer").map((c) => c.args.name);
  assert.deepEqual(created, ["Thay bầu trời thành hoàng hôn…", "Face 1"]);
  const puts = calls.filter((c) => c.op === "putPixels");
  assert.deepEqual(puts[0].args.targetBounds, { left: 140, top: 55 });
  assert.equal(puts[0].args.w, 520);
  assert.equal(puts[0].args.h, 390);
  const masks = calls.filter((c) => c.op === "putLayerMask");
  assert.equal(masks.length, 2, "cả nền lẫn mặt đều phải có mask");
  assert.ok(calls.some((c) => c.op === "batchPlay:make"), "phải tạo layer mask");

  const me = await getMe();
  assert.equal(me.credits, 500 - 17);
});

test("không có vùng chọn mà bật 'chỉ sửa vùng chọn' → báo lỗi dễ hiểu", async () => {
  fakeState.selection = null;
  await assert.rejects(captureSource({ maxSide: 2048, selection: "require" }), /chưa chọn vùng/i);
});

test("Upscale 2x → phóng tài liệu lên 1600×1200 rồi chèn layer phủ kín", async () => {
  calls.length = 0;
  const src = await captureSource({ maxSide: 4096, selection: "none" });
  const { done } = submitJob({
    kind: "upscale",
    label: "Upscale 2x",
    cost: 4,
    target: toTarget(src, "Upscale 2x", { mode: "upscale" }),
    create: () => createUpscaleJob({ image: src.image, scale: 2, target_width: 1600, target_height: 1200 }),
  });
  await done;
  assert.deepEqual(calls.find((c) => c.op === "resizeImage")?.args, [1600, 1200]);
  const put = calls.find((c) => c.op === "putPixels")!;
  assert.deepEqual(put.args, { layerID: put.args.layerID, targetBounds: { left: 0, top: 0 }, w: 1600, h: 1200 });
  assert.equal(doc.width, 1600);
});

test("không đủ điểm → máy chủ từ chối, job báo lỗi", async () => {
  const src = await captureSource({ maxSide: 512, selection: "none" });
  const { done } = submitJob({
    kind: "gen",
    label: "x",
    cost: 9999,
    target: toTarget(src, "x"),
    create: async () => {
      const { ApiError } = await import("../src/api/client");
      throw new ApiError("Không đủ điểm", 402);
    },
  });
  await assert.rejects(done, /Không đủ điểm/);
});
