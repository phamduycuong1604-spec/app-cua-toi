// Mọi thao tác SỬA tài liệu trong Photoshop phải chạy trong "executeAsModal".
// Photoshop chỉ cho 1 modal tại một thời điểm → xếp hàng chạy lần lượt.
import { core, action } from "photoshop";

let chain: Promise<unknown> = Promise.resolve();

export function runModal<T>(
  commandName: string,
  fn: (ctx: any) => Promise<T>,
  opts: { historyDocId?: number; historyName?: string } = {},
): Promise<T> {
  const task = chain.then(() =>
    core.executeAsModal(
      async (ctx: any) => {
        // Gộp cả thao tác thành 1 bước Undo (Ctrl+Z một lần là xóa hết).
        let suspension: any = null;
        if (opts.historyDocId != null && ctx?.hostControl?.suspendHistory) {
          try {
            suspension = await ctx.hostControl.suspendHistory({
              documentID: opts.historyDocId,
              name: opts.historyName || commandName,
            });
          } catch {
            suspension = null;
          }
        }
        try {
          const result = await fn(ctx);
          if (suspension) await ctx.hostControl.resumeHistory(suspension, true);
          return result;
        } catch (e) {
          if (suspension) await ctx.hostControl.resumeHistory(suspension, false).catch(() => undefined);
          throw e;
        }
      },
      { commandName },
    ),
  );
  chain = task.catch(() => undefined);
  return task as Promise<T>;
}

export async function batchPlay(descriptors: any[], options: any = {}): Promise<any[]> {
  return action.batchPlay(descriptors, { synchronousExecution: false, modalBehavior: "execute", ...options });
}

/** Dịch lỗi Photoshop sang câu dễ hiểu. */
export function friendlyPsError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/modal/i.test(msg)) return "Photoshop đang bận (đang mở hộp thoại hoặc công cụ khác). Hãy đóng nó rồi thử lại.";
  return msg;
}
