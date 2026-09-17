import { useEffect, useMemo, useState } from "react";
import { HABIT_TITLE_MAX } from "../../shared/constants";
import type { Area, Goal, HabitFrequency } from "../../shared/types";
import { Modal } from "../../ui/Modal";

export type HabitFormState = {
  id?: string;
  title: string;
  areaId: string;
  goalId: string;
  frequencyType: HabitFrequency;
  frequencyTarget: number;
};

export function HabitFormModal({
  form,
  areas,
  goals,
  busy,
  onClose,
  onSave,
}: {
  form: HabitFormState;
  areas: Area[];
  goals: Goal[];
  busy: boolean;
  onClose: () => void;
  onSave: (next: HabitFormState) => void;
}) {
  const [draft, setDraft] = useState(form);
  useEffect(() => setDraft(form), [form]);
  const areaGoals = useMemo(
    () => goals.filter((g) => g.area_id === draft.areaId && g.status !== "dropped"),
    [goals, draft.areaId],
  );

  return (
    <Modal onClose={onClose}>
      <h3>{draft.id ? "编辑习惯" : "新建习惯"}</h3>
      <div className="field">
        <label htmlFor="hf-title">名称</label>
        <input
          id="hf-title"
          type="text"
          maxLength={HABIT_TITLE_MAX}
          value={draft.title}
          placeholder="越具体越好，例如：23:30 前上床"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="hf-area">维度</label>
        <select
          id="hf-area"
          value={draft.areaId}
          onChange={(e) => setDraft({ ...draft, areaId: e.target.value, goalId: "" })}
        >
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="hf-goal">关联目标（可选）</label>
        <select
          id="hf-goal"
          value={draft.goalId}
          onChange={(e) => setDraft({ ...draft, goalId: e.target.value })}
        >
          <option value="">只挂在维度下</option>
          {areaGoals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title}
            </option>
          ))}
        </select>
        <div className="hint">习惯必须挂在维度下，也可以再挂到同一维度的某个目标。</div>
      </div>
      <div className="field">
        <label htmlFor="hf-freq">频率</label>
        <div className="row">
          <select
            id="hf-freq"
            style={{ width: 140 }}
            value={draft.frequencyType}
            onChange={(e) => {
              const frequencyType = e.target.value as HabitFrequency;
              setDraft({
                ...draft,
                frequencyType,
                frequencyTarget:
                  frequencyType === "daily" ? 7 : draft.frequencyType === "weekly" ? draft.frequencyTarget : 3,
              });
            }}
          >
            <option value="daily">每天</option>
            <option value="weekly">每周 N 次</option>
          </select>
          {draft.frequencyType === "weekly" ? (
            <select
              id="hf-target"
              style={{ width: 100 }}
              value={draft.frequencyTarget}
              onChange={(e) => setDraft({ ...draft, frequencyTarget: Number(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !draft.title.trim() || !draft.areaId}
          onClick={() => onSave({ ...draft, title: draft.title.trim() })}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
