import { useEffect, useState } from "react";
import {
  GOAL_LEVELS,
  GOAL_TITLE_MAX,
  GOAL_WHY_MAX,
  LEVEL_LABEL,
  goalWhyRequired,
  type GoalLevel,
} from "../../shared/constants";
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

export function periodHint(level: GoalLevel, hasParent: boolean) {
  if (hasParent) return "保存后按自然周期写入，并落在上级周期内";
  switch (level) {
    case "life":
      return "保存后写入长期方向，不按某一年切";
    case "year":
      return "保存后按当前所选自然年度写入";
    case "quarter":
      return "保存后按当前自然季度写入";
    case "month":
      return "保存后按当前自然月写入";
    case "week":
      return "保存后按当前自然周写入";
  }
}

export function GoalFormModal({
  form,
  areas,
  busy,
  inheritedWhy,
  onClose,
  onSave,
}: {
  form: GoalFormState;
  areas: Area[];
  busy: boolean;
  inheritedWhy?: { text: string; fromLabel: string } | null;
  onClose: () => void;
  onSave: (next: GoalFormState) => void;
}) {
  const [draft, setDraft] = useState(form);
  useEffect(() => setDraft(form), [form]);
  const areaLocked = Boolean(draft.parent && draft.parent.level !== "life");
  const lockedAreaId = areaLocked ? draft.parent?.area_id ?? draft.areaId : draft.areaId;
  const lockedArea = areas.find((a) => a.id === lockedAreaId);
  const canPickLevel = !draft.id && !draft.parent;
  const whyRequired = goalWhyRequired(draft.level, Boolean(draft.parent));
  const hint = draft.id
    ? "周期在创建时按自然层级写入，编辑不改周期。"
    : periodHint(draft.level, Boolean(draft.parent));

  return (
    <Modal onClose={onClose}>
      <h3>{draft.id ? "编辑目标" : `新建${LEVEL_LABEL[draft.level]}目标`}</h3>
      {draft.parent ? (
        <p className="muted small mb-16">
          上级：{LEVEL_LABEL[draft.parent.level]} · {draft.parent.title}
        </p>
      ) : null}
      {canPickLevel ? (
        <div className="field">
          <label htmlFor="gf-level">层级</label>
          <Select
            id="gf-level"
            value={draft.level}
            options={GOAL_LEVELS.map((level) => ({
              value: level,
              label: LEVEL_LABEL[level],
            }))}
            onChange={(level) =>
              setDraft({
                ...draft,
                level: level as GoalLevel,
                periodLabel: periodHint(level as GoalLevel, false),
              })
            }
          />
        </div>
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
        {areaLocked ? (
          <>
            <input
              id="gf-area"
              type="text"
              value={lockedArea?.name ?? "上级维度"}
              disabled
            />
            <div className="hint">跟随上级，不能改到别的维度。</div>
          </>
        ) : (
          <Select
            id="gf-area"
            value={draft.areaId}
            options={areas.map((a) => ({ value: a.id, label: a.name, swatch: a.color }))}
            onChange={(areaId) => setDraft({ ...draft, areaId })}
          />
        )}
      </div>
      <div className="field">
        <label htmlFor="gf-why">{whyRequired ? "为什么重要（必填）" : "为什么重要（选填）"}</label>
        <textarea
          id="gf-why"
          maxLength={GOAL_WHY_MAX}
          value={draft.why}
          placeholder={
            whyRequired
              ? "写给未来的自己看，说不清就先别立这个目标"
              : "这层有特别的理由再写；不写就沿用上级"
          }
          onChange={(e) => setDraft({ ...draft, why: e.target.value })}
        />
        {!whyRequired && inheritedWhy ? (
          <div className="hint">
            未填写时沿用{inheritedWhy.fromLabel}：{inheritedWhy.text}
          </div>
        ) : null}
      </div>
      <div className="field">
        <label htmlFor="gf-period">周期</label>
        <input id="gf-period" type="text" value={draft.periodLabel} disabled />
        <div className="hint">{hint}</div>
      </div>
      <div className="modal-foot">
        <button className="btn" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          disabled={busy || !draft.title.trim() || (whyRequired && !draft.why.trim())}
          onClick={() => onSave({ ...draft, areaId: lockedAreaId })}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
