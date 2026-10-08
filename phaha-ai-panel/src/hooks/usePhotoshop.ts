import { useEffect, useState } from "react";
import { action, app } from "photoshop";

export interface ActiveDocState {
  id: number;
  title: string;
  width: number;
  height: number;
}

function read(): ActiveDocState | null {
  try {
    const d = app.activeDocument;
    return d ? { id: d.id, title: d.title, width: d.width, height: d.height } : null;
  } catch {
    return null;
  }
}

/** Ảnh đang mở trong Photoshop, tự cập nhật khi người dùng đổi/mở/đóng ảnh. */
export function useActiveDoc(): ActiveDocState | null {
  const [doc, setDoc] = useState<ActiveDocState | null>(read);
  useEffect(() => {
    const update = () =>
      setDoc((prev) => {
        const next = read();
        const same =
          prev && next && prev.id === next.id && prev.title === next.title && prev.width === next.width && prev.height === next.height;
        return same || (!prev && !next) ? prev : next;
      });
    const events = ["select", "open", "close", "make", "imageSize", "canvasSize"];
    let added = false;
    try {
      action.addNotificationListener(events, update);
      added = true;
    } catch {
      /* bản Photoshop cũ: dùng hẹn giờ */
    }
    const t = setInterval(update, 1500);
    return () => {
      clearInterval(t);
      if (added) action.removeNotificationListener(events, update).catch?.(() => undefined);
    };
  }, []);
  return doc;
}
