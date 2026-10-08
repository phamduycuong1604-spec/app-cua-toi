// Preset Special dự phòng (khi máy chủ chưa có /api/special/presets).
import type { SpecialPreset } from "../api/types";

export const SPECIAL_GROUPS: { id: SpecialPreset["group"]; name: string; ico: string; supportsRef: boolean }[] = [
  { id: "hair", name: "Tóc", ico: "💇", supportsRef: true },
  { id: "makeup", name: "Makeup", ico: "💄", supportsRef: false },
  { id: "dress", name: "Dáng váy", ico: "👗", supportsRef: false },
  { id: "tone", name: "Fake tone", ico: "🎨", supportsRef: true },
];

const p = (group: SpecialPreset["group"], id: string, name: string): SpecialPreset => ({ id: `${group}.${id}`, name, group });

export const DEFAULT_SPECIAL_PRESETS: SpecialPreset[] = [
  p("hair", "bun", "Búi thấp"),
  p("hair", "wave", "Xoăn sóng"),
  p("hair", "straight", "Thẳng mượt"),
  p("hair", "bob", "Bob ngắn"),
  p("hair", "braid", "Tết lệch"),
  p("hair", "volume", "Tăng độ phồng"),
  p("makeup", "natural", "Tự nhiên"),
  p("makeup", "korean", "Hàn Quốc"),
  p("makeup", "bride", "Cô dâu"),
  p("makeup", "party", "Dự tiệc"),
  p("makeup", "lip", "Môi đỏ"),
  p("makeup", "peach", "Cam đào"),
  p("dress", "aline", "Chữ A"),
  p("dress", "ballgown", "Xòe công chúa"),
  p("dress", "mermaid", "Đuôi cá"),
  p("dress", "train", "Đuôi dài"),
  p("tone", "korean", "Hàn trong"),
  p("tone", "warm", "Ấm vàng"),
  p("tone", "film", "Film"),
  p("tone", "moody", "Moody"),
  p("tone", "pastel", "Pastel"),
  p("tone", "bw", "Trắng đen"),
];
