import { useEffect, useMemo, useState } from "react";
import { LEVEL_LABEL, NOTE_BODY_MAX, NOTE_KIND_LABEL, NOTE_KINDS, type NoteKind } from "../../shared/constants";
import type { Area, Goal, Note } from "../../shared/types";
import { isoDate } from "../../shared/time";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";

export type NoteFormState = {
  id?: string;
  date: string;
  kind: NoteKind;
  body: string;
  areaId: string;
  goalId: string;
};

export function emptyNoteForm(partial?: Partial<NoteFormState>): NoteFormState {
  return {
    date: isoDate(),
    kind: "insight",
    body: "",
    areaId: "",
    goalId: "",
    ...partial,
  };
}

export function noteToForm(note: Note): NoteFormState {
  return {
    id: note.id,
    date: note.date,
    kind: note.kind,
    body: note.body,
    areaId: note.area_id ?? "",
    goalId: note.goal_id ?? "",
  };
}

export function NoteFormModal({
  form,
  areas,
  goals,
  busy,
  lockGoal,
  onClose,
  onSave,
}: {
  form: NoteFormState;
  areas: Area[];
  goals: Goal[];
  busy: boolean;
  lockGoal?: boolean;
  onClose: () => void;
  onSave: (next: NoteFormState) => void;
}) {
  const [draft, setDraft] = useState(form);
  useEffect(() => setDraft(form), [form]);
  const today = isoDate();
  const areaGoals = useMemo(() => {
    const filtered = goals.filter(
      (g) =>
        (!draft.areaId || g.area_id === draft.areaId) &&
        (g.status !== "dropped" || g.id === draft.goalId),
    );
    if (draft.goalId && !filtered.some((g) => g.id === draft.goalId)) {
      const current = goals.find((g) => g.id === draft.goalId);
      if (current) filtered.push(current);
    }
    return filtered;
  }, [goals, draft.areaId, draft.goalId]);
  const canSave = draft.body.trim().length > 0 && draft.date.length === 10;

  return (
    <Modal onClose={onClose}>
      <h3>{draft.id ? "编辑随记" : "写一条随记"}</h3>
      <div className="field">
        <label htmlFor="nf-date">日期</label>
        <input
          id="nf-date"
          type="date"
          max={today}
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
      </div>
      <div className="field">
        <span className="label-text">类型</span>
        <div className="row wrap">
          {NOTE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${draft.kind === kind ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, kind })}
            >
              {NOTE_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="nf-body">正文</label>
        <textarea
          id="nf-body"
          className="note-input"
          maxLength={NOTE_BODY_MAX}
          value={draft.body}
          placeholder="写给自己看的话，不必工整。"
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        />
        <div className="hint">
          {draft.body.trim().length}/{NOTE_BODY_MAX}
        </div>
      </div>
      <div className="field">
        <label htmlFor="nf-area">维度（可选）</label>
        <Select
          id="nf-area"
          value={draft.areaId}
          disabled={lockGoal}
          options={[
            { value: "", label: "不挂维度" },
            ...areas.map((a) => ({ value: a.id, label: a.name, swatch: a.color })),
          ]}
          onChange={(areaId) => setDraft({ ...draft, areaId, goalId: "" })}
        />
      </div>
      <div className="field">
        <label htmlFor="nf-goal">关联目标（可选）</label>
        <Select
          id="nf-goal"
          value={draft.goalId}
          disabled={lockGoal}
          options={[
            { value: "", label: "不挂目标" },
            ...areaGoals.map((g) => ({ value: g.id, label: `${LEVEL_LABEL[g.level]} · ${g.title}` })),
          ]}
          onChange={(goalId) => {
            const goal = goals.find((g) => g.id === goalId);
            setDraft({
              ...draft,
              goalId,
              areaId: goal ? goal.area_id : draft.areaId,
            });
          }}
        />
      </div>
      <div className="modal-foot">
        <button className="btn" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !canSave}
          onClick={() => onSave(draft)}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
