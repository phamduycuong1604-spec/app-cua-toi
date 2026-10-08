import { test } from "node:test";
import assert from "node:assert/strict";
import { encode } from "fast-png";
import { base64ToBytes, bytesToBase64 } from "../src/lib/base64";
import { cropGray, decodeImage, decodeMask, featherMask, fitSize, resizeRGBA } from "../src/lib/image";
import { padBounds, placeLayer, prepareLayerPixels } from "../src/jobs/placement";
import type { InsertTarget } from "../src/state/store";

test("base64 mã hóa/giải mã khớp Node", () => {
  for (const len of [0, 1, 2, 3, 4, 5, 1000, 70001]) {
    const b = new Uint8Array(len).map((_, i) => (i * 37 + 11) & 255);
    const ours = bytesToBase64(b);
    assert.equal(ours, Buffer.from(b).toString("base64"));
    assert.deepEqual(Array.from(base64ToBytes(ours)), Array.from(b));
    assert.deepEqual(Array.from(base64ToBytes("data:image/png;base64," + ours)), Array.from(b));
  }
});

test("giải mã PNG RGB / xám / 16-bit ra RGBA", () => {
  const rgb = encode({ width: 2, height: 1, data: new Uint8Array([255, 0, 0, 0, 0, 255]), channels: 3 });
  const a = decodeImage(rgb);
  assert.deepEqual(Array.from(a.data), [255, 0, 0, 255, 0, 0, 255, 255]);
  const gray = encode({ width: 2, height: 1, data: new Uint8Array([10, 200]), channels: 1 });
  assert.deepEqual(Array.from(decodeImage(gray).data), [10, 10, 10, 255, 200, 200, 200, 255]);
  const g16 = encode({ width: 1, height: 1, data: new Uint16Array([65535]), channels: 1, depth: 16 });
  assert.deepEqual(Array.from(decodeImage(g16).data), [255, 255, 255, 255]);
  const m = decodeMask(gray);
  assert.deepEqual(Array.from(m.data), [10, 200]);
});

test("đổi cỡ và cắt", () => {
  const img = { width: 2, height: 2, data: new Uint8Array(16).fill(100) };
  const big = resizeRGBA(img, 4, 4);
  assert.equal(big.data.length, 64);
  assert.ok(big.data.every((v) => v === 100));
  const g = { width: 3, height: 3, data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
  assert.deepEqual(Array.from(cropGray(g, 1, 1, 2, 2).data), [5, 6, 8, 9]);
  assert.deepEqual(Array.from(cropGray(g, -1, 0, 2, 1).data), [0, 1]);
  assert.deepEqual(fitSize(4000, 2000, 2048), { width: 2048, height: 1024 });
  assert.deepEqual(fitSize(500, 300, 2048), { width: 500, height: 300 });
});

test("làm mềm mép mask: mép cứng thành dải chuyển", () => {
  const w = 20;
  const data = new Uint8Array(w * 1).map((_, i) => (i < 10 ? 0 : 255));
  const f = featherMask({ width: w, height: 1, data }, 3);
  assert.equal(f.data[0], 0);
  assert.equal(f.data[19], 255);
  assert.ok(f.data[9] > 0 && f.data[9] < 255, "điểm sát mép phải là màu trung gian");
  assert.ok(f.data[10] > 0 && f.data[10] < 255);
});

const target = (over: Partial<InsertTarget> = {}): InsertTarget => ({
  docId: 1,
  docTitle: "a.jpg",
  docWidth: 4000,
  docHeight: 3000,
  bounds: { left: 1000, top: 500, right: 3000, bottom: 1500 },
  sentWidth: 1000,
  sentHeight: 500,
  layerName: "test",
  mode: "overlay",
  ...over,
});

test("đặt layer: phủ đúng vùng đã gửi", () => {
  assert.deepEqual(placeLayer(target(), { image: "" }, { width: 1024, height: 512 }), {
    left: 1000,
    top: 500,
    width: 2000,
    height: 1000,
  });
});

test("đặt layer mặt (Face 1) theo toạ độ ảnh đã gửi", () => {
  const p = placeLayer(target(), { image: "", x: 100, y: 50, width: 200, height: 100 }, { width: 200, height: 100 });
  assert.deepEqual(p, { left: 1200, top: 600, width: 400, height: 200 });
});

test("upscale: lớn hơn ảnh gốc thì giữ cỡ thật, nhỏ hơn thì phủ vừa khổ", () => {
  const t = target({ mode: "upscale", docWidth: 1000, docHeight: 500 });
  assert.deepEqual(placeLayer(t, { image: "" }, { width: 2000, height: 1000 }), { left: 0, top: 0, width: 2000, height: 1000 });
  assert.deepEqual(placeLayer(t, { image: "" }, { width: 800, height: 400 }), { left: 0, top: 0, width: 1000, height: 500 });
});

test("ghép mask vùng chọn với mask máy chủ", () => {
  const sel = { width: 4, height: 1, data: new Uint8Array([255, 255, 0, 0]) };
  const t = target({ bounds: { left: 0, top: 0, right: 4, bottom: 1 }, sentWidth: 4, sentHeight: 1, selectionMask: sel });
  const img = { width: 4, height: 1, data: new Uint8Array(16).fill(50) };
  const server = { width: 4, height: 1, data: new Uint8Array([255, 0, 255, 0]) };
  const r = prepareLayerPixels(t, { left: 0, top: 0, width: 4, height: 1 }, img, server, 0);
  assert.deepEqual(Array.from(r.mask!.data), [255, 0, 0, 0]);
  const r2 = prepareLayerPixels(t, { left: 0, top: 0, width: 4, height: 1 }, img, null, 0);
  assert.deepEqual(Array.from(r2.mask!.data), [255, 255, 0, 0]);
});

test("nới khung vùng chọn không vượt khổ ảnh", () => {
  assert.deepEqual(padBounds({ left: 10, top: 10, right: 110, bottom: 60 }, 0.2, 120, 65), {
    left: 0,
    top: 0,
    right: 120,
    bottom: 65,
  });
});
