import { useEffect, useMemo, useState } from "react";
import { HABIT_KIND_HINT, HABIT_KIND_LABEL, HABIT_KINDS, HABIT_TITLE_MAX, HabitKind } from "../../shared/constants";
import type { Area, Goal, HabitFrequency, HabitKind as HabitKindId } from "../../shared/types";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";

export type HabitFormState = {
  id?: string;
  title: string;
  kind: HabitKindId;
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
        <span className="label-text">类型</span>
        <div className="row wrap">
          {HABIT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${draft.kind === kind ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, kind })}
            >
              {HABIT_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
        <div className="hint">{HABIT_KIND_HINT[draft.kind]}</div>
      </div>
      <div className="field">
        <label htmlFor="hf-title">名称</label>
        <input
          id="hf-title"
          type="text"
          maxLength={HABIT_TITLE_MAX}
          value={draft.title}
          placeholder={
            draft.kind === HabitKind.Break ? "越具体越好，例如：今晚不刷短视频" : "越具体越好，例如：23:30 前上床"
          }
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </div>
      <div className="field">
        <label htmlFor="hf-area">维度</label>
        <Select
          id="hf-area"
          value={draft.areaId}
          options={areas.map((a) => ({ value: a.id, label: a.name, swatch: a.color }))}
          onChange={(areaId) => setDraft({ ...draft, areaId, goalId: "" })}
        />
      </div>
      {areaGoals.length > 0 || draft.goalId ? (
        <div className="field">
          <label htmlFor="hf-goal">关联目标（可选）</label>
          <Select
            id="hf-goal"
            value={draft.goalId}
            options={[
              { value: "", label: "不关联目标" },
              ...areaGoals.map((g) => ({ value: g.id, label: g.title })),
              ...(draft.goalId && !areaGoals.some((g) => g.id === draft.goalId)
                ? [{ value: draft.goalId, label: goals.find((g) => g.id === draft.goalId)?.title ?? "已选目标" }]
                : []),
            ]}
            onChange={(goalId) => setDraft({ ...draft, goalId })}
          />
          <div className="hint">可以再挂到这个维度下的某个目标；不选就只属于维度。</div>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="hf-freq">频率</label>
        <div className="row">
          <Select
            id="hf-freq"
            style={{ width: 140 }}
            value={draft.frequencyType}
            options={[
              { value: "daily", label: "每天" },
              { value: "weekly", label: "每周 N 次" },
            ]}
            onChange={(next) => {
              const frequencyType = next as HabitFrequency;
              setDraft({
                ...draft,
                frequencyType,
                frequencyTarget:
                  frequencyType === "daily" ? 7 : draft.frequencyType === "weekly" ? draft.frequencyTarget : 3,
              });
            }}
          />
          {draft.frequencyType === "weekly" ? (
            <Select
              id="hf-target"
              style={{ width: 100 }}
              value={String(draft.frequencyTarget)}
              options={[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(next) => setDraft({ ...draft, frequencyTarget: Number(next) })}
            />
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
