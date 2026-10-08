import React, { useEffect, useState } from "react";
import { getPromptGroups } from "../../api/gen";
import type { PromptGroup } from "../../api/types";
import { DEFAULT_PROMPT_GROUPS } from "../../data/prompts";

let cache: PromptGroup[] | null = null;

/** 14 nhóm prompt mẫu: bấm nhóm → hiện các mẫu → bấm mẫu để điền vào ô prompt. */
export function PromptPresets(p: { onPick: (prompt: string) => void }) {
  const [groups, setGroups] = useState<PromptGroup[]>(cache ?? DEFAULT_PROMPT_GROUPS);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (cache) return;
    getPromptGroups()
      .then((g) => {
        if (g.length) {
          cache = g;
          setGroups(g);
        }
      })
      .catch(() => undefined); // dùng danh sách dự phòng
  }, []);

  const current = groups.find((g) => g.id === open);
  return (
    <div>
      <div className="section-title">Prompt mẫu</div>
      <div className="chips">
        {groups.map((g) => (
          <div key={g.id} className={"chip" + (open === g.id ? " on" : "")} onClick={() => setOpen(open === g.id ? null : g.id)}>
            {g.name}
          </div>
        ))}
      </div>
      {current && (
        <div style={{ marginTop: 4 }}>
          {current.prompts.map((pr) => (
            <div key={pr.title} className="preset-item" onClick={() => p.onPick(pr.prompt)}>
              <div className="pt">{pr.title}</div>
              <div className="pp">{pr.prompt}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
