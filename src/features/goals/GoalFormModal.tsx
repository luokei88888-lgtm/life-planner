import { useEffect, useState } from "react";
import { GOAL_TITLE_MAX, GOAL_WHY_MAX, LEVEL_LABEL, type GoalLevel } from "../../shared/constants";
import type { Area, Goal } from "../../shared/types";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";

export type GoalFormState = {
  id?: string;
  parent?: Goal | null;
  level: GoalLevel;
  title: string;
  why: string;
  areaId: string;
  periodLabel: string;
};

export function GoalFormModal({
  form,
  areas,
  busy,
  onClose,
  onSave,
}: {
  form: GoalFormState;
  areas: Area[];
  busy: boolean;
  onClose: () => void;
  onSave: (next: GoalFormState) => void;
}) {
  const [draft, setDraft] = useState(form);
  useEffect(() => setDraft(form), [form]);
  const unit = LEVEL_LABEL[draft.level].replace("度", "");

  return (
    <Modal onClose={onClose}>
      <h3>{draft.id ? "编辑目标" : `新建${LEVEL_LABEL[draft.level]}目标`}</h3>
      {draft.parent ? (
        <p className="muted small mb-16">
          上级：{LEVEL_LABEL[draft.parent.level]} · {draft.parent.title}
        </p>
      ) : null}
      <div className="field">
        <label htmlFor="gf-title">标题</label>
        <input
          id="gf-title"
          type="text"
          maxLength={GOAL_TITLE_MAX}
          value={draft.title}
          placeholder="一句话说清要达成什么"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="gf-area">维度</label>
        <Select
          id="gf-area"
          value={draft.areaId}
          options={areas.map((a) => ({ value: a.id, label: a.name, swatch: a.color }))}
          onChange={(areaId) => setDraft({ ...draft, areaId })}
        />
      </div>
      <div className="field">
        <label htmlFor="gf-why">为什么重要（必填）</label>
        <textarea
          id="gf-why"
          maxLength={GOAL_WHY_MAX}
          value={draft.why}
          placeholder="写给未来的自己看，说不清就先别立这个目标"
          onChange={(e) => setDraft({ ...draft, why: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="gf-period">周期</label>
        <input id="gf-period" type="text" value={draft.periodLabel} disabled />
        <div className="hint">按自然{unit}划分，落在上级周期内。周目标可以直接挂年度，季、月可选。</div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          disabled={busy || !draft.title.trim() || !draft.why.trim()}
          onClick={() => onSave(draft)}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
