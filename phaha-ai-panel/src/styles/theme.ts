// Màu sắc dùng chung (khớp với panel.css). Tông tối giống Photoshop.
export const theme = {
  bg: "#323232",
  bgDark: "#262626",
  bgInput: "#1f1f1f",
  border: "#454545",
  text: "#e6e6e6",
  textDim: "#a0a0a0",
  accent: "#7c5cff",
  accentHover: "#8f74ff",
  success: "#3fb27f",
  warning: "#e8a33d",
  danger: "#e5534b",
};

export const statusColor: Record<string, string> = {
  submitting: theme.textDim,
  pending: theme.textDim,
  running: theme.accent,
  inserting: theme.accent,
  done: theme.success,
  error: theme.danger,
  canceled: theme.textDim,
};
