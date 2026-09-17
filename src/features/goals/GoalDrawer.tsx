import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { LEVEL_LABEL, STATUS_LABEL, childLevel, type GoalStatus } from "../../shared/constants";
import type { Area, Goal, GoalTimelineItem, Task } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { TaskRow } from "../week/TaskRow";
import { fmtNoteDay } from "../../shared/time";
import { NoteCard } from "../notes/NoteCard";
import { emptyNoteForm, NoteFormModal, noteToForm, type NoteFormState } from "../notes/NoteFormModal";
import { Modal } from "../../ui/Modal";

export function GoalDrawer({
  goal,
  parent,
  children,
  areas,
  progress,
  busy,
  onClose,
  onSelect,
  onEdit,
  onAddChild,
  onDelete,
  onStatus,
  onProgressInput,
  onProgressCommit,
}: {
  goal: Goal;
  parent: Goal | null;
  children: Goal[];
  areas: Area[];
  progress: number;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onAddChild: () => void;
  onDelete: () => void;
  onStatus: (to: GoalStatus) => void;
  onProgressInput: (value: number) => void;
  onProgressCommit: (value: number) => void;
}) {
  const { notify } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [timeline, setTimeline] = useState<GoalTimelineItem[]>([]);
  const [noteForm, setNoteForm] = useState<NoteFormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GoalTimelineItem["note"]>(null);
  const [noteBusy, setNoteBusy] = useState(false);
  const terminal = goal.status === "done" || goal.status === "dropped";
  const next = childLevel(goal.level);
  const canDelete = goal.child_count === 0 && goal.task_count === 0 && tasks.length === 0;
  const area = areas.find((a) => a.id === goal.area_id);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await api.listGoalTimeline(goal.id);
        if (!cancelled) setTimeline(items);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载时间线");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goal.id, notify]);

  useEffect(() => {
    if (goal.level !== "week") {
      setTasks([]);
      setWeekLocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [list, plan] = await Promise.all([
          api.listGoalTasks(goal.id),
          api.listWeekPlan(goal.period_start),
        ]);
        if (cancelled) return;
        setTasks(list);
        setWeekLocked(plan.locked);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载任务");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [goal.id, goal.level, goal.period_start, notify]);

  async function mutateTask(fn: () => Promise<unknown>) {
    try {
      await fn();
      setTasks(await api.listGoalTasks(goal.id));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  async function reloadTimeline() {
    setTimeline(await api.listGoalTimeline(goal.id));
  }

  async function saveNote(next: NoteFormState) {
    setNoteBusy(true);
    try {
      const payload = {
        date: next.date,
        kind: next.kind,
        body: next.body,
        areaId: next.areaId || goal.area_id,
        goalId: goal.id,
      };
      if (next.id) {
        await api.updateNote({ id: next.id, ...payload });
      } else {
        await api.createNote(payload);
      }
      setNoteForm(null);
      await reloadTimeline();
      notify(next.id ? "已保存" : "已记下");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setNoteBusy(false);
    }
  }

  async function removeNote(id: string) {
    setNoteBusy(true);
    try {
      await api.deleteNote(id);
      setPendingDelete(null);
      await reloadTimeline();
      notify("已删除");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "删除失败");
    } finally {
      setNoteBusy(false);
    }
  }

  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="row mb-8">
              <span className="tag level">{LEVEL_LABEL[goal.level]}</span>
              <span className={`tag ${goal.status}`}>{STATUS_LABEL[goal.status]}</span>
              {area ? (
                <span className="tag" style={{ borderColor: area.color, color: area.color }}>
                  {area.name}
                </span>
              ) : null}
            </div>
            <h3>{goal.title}</h3>
          </div>
          <button className="btn ghost sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="kv">
          <span className="k">为什么重要</span>
          <span>{goal.why}</span>
          <span className="k">周期</span>
          <span>
            {goal.period_start} 至 {goal.period_end}
          </span>
          <span className="k">上级目标</span>
          <span>
            {parent ? (
              <button className="linkish" onClick={() => onSelect(parent.id)}>
                {parent.title}
              </button>
            ) : (
              "无（年度目标）"
            )}
          </span>
          {goal.status_reason ? (
            <>
              <span className="k">{STATUS_LABEL[goal.status]}原因</span>
              <span>{goal.status_reason}</span>
            </>
          ) : null}
          {goal.done_at ? (
            <>
              <span className="k">完成时间</span>
              <span>{goal.done_at.slice(0, 10)}</span>
            </>
          ) : null}
        </div>
        <div className="mt-16">
          <div className="row between">
            <span className="strong">进度 {progress}%</span>
            {terminal ? null : <span className="muted small">拖动调整</span>}
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={progress}
            disabled={terminal || busy}
            onChange={(e) => onProgressInput(Number(e.target.value))}
            onMouseUp={(e) => onProgressCommit(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => onProgressCommit(Number((e.target as HTMLInputElement).value))}
          />
        </div>
        <div className="row wrap mt-16">
          {goal.status === "active" ? (
            <>
              <button className="btn" disabled={busy} onClick={() => onStatus("done")}>
                标记完成
              </button>
              <button className="btn" disabled={busy} onClick={() => onStatus("paused")}>
                搁置
              </button>
              <button className="btn danger" disabled={busy} onClick={() => onStatus("dropped")}>
                放弃
              </button>
            </>
          ) : null}
          {goal.status === "paused" ? (
            <>
              <button className="btn primary" disabled={busy} onClick={() => onStatus("active")}>
                恢复进行
              </button>
              <button className="btn danger" disabled={busy} onClick={() => onStatus("dropped")}>
                放弃
              </button>
            </>
          ) : null}
          {terminal ? (
            <button className="btn" disabled={busy} onClick={() => onStatus("active")}>
              重新打开
            </button>
          ) : null}
          <span style={{ flex: 1 }} />
          <button className="btn sm" disabled={busy} onClick={onEdit}>
            编辑
          </button>
          {canDelete ? (
            <button className="btn sm danger" disabled={busy} onClick={onDelete}>
              删除
            </button>
          ) : null}
        </div>
        {next ? (
          <div className="mt-24">
            <div className="row between mb-8">
              <span className="strong">
                {LEVEL_LABEL[next]}目标（{children.length}）
              </span>
              <button className="btn sm" disabled={busy} onClick={onAddChild}>
                + 新建
              </button>
            </div>
            {children.length ? (
              children.map((k) => {
                const color = areas.find((a) => a.id === k.area_id)?.color ?? "var(--accent)";
                return (
                  <button key={k.id} className="task-row" onClick={() => onSelect(k.id)}>
                    <span className="dot" style={{ background: color }} />
                    <span className="task-title">{k.title}</span>
                    <span className={`tag ${k.status}`}>{STATUS_LABEL[k.status]}</span>
                    <span className="muted small">{k.progress}%</span>
                  </button>
                );
              })
            ) : (
              <div className="empty">还没有子目标。</div>
            )}
          </div>
        ) : null}
        {goal.level === "week" ? (
          <div className="mt-24">
            <div className="row between mb-8">
              <span className="strong">
                任务（{tasks.filter((t) => t.status === "done").length}/{tasks.length}）
              </span>
              <Link className="btn sm" to="/week">
                去本周计划
              </Link>
            </div>
            {tasks.length ? (
              tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  goal={goal}
                  area={area}
                  locked={weekLocked}
                  onToggle={() => void mutateTask(() => api.toggleTask(t.id))}
                  onFocus={() => void mutateTask(() => api.toggleFocus(t.id))}
                />
              ))
            ) : (
              <div className="empty">还没有任务。</div>
            )}
          </div>
        ) : null}
        <div className="mt-24">
            <div className="row between mb-8">
              <span className="strong">时间线</span>
              <button
                className="btn sm"
                type="button"
                onClick={() =>
                  setNoteForm(
                    emptyNoteForm({
                      areaId: goal.area_id,
                      goalId: goal.id,
                    }),
                  )
                }
              >
                + 随记
              </button>
            </div>
            {timeline.length ? (
              <div className="timeline compact">
                {timeline.map((item) =>
                  item.item_kind === "note" && item.note ? (
                    <section className="tl-day" key={`n-${item.note.id}`}>
                      <div className="tl-date">{fmtNoteDay(item.date)}</div>
                      <NoteCard
                        note={item.note}
                        compact
                        onEdit={() => setNoteForm(noteToForm(item.note!))}
                        onDelete={() => setPendingDelete(item.note)}
                      />
                    </section>
                  ) : (
                    <section className="tl-day status" key={`s-${item.sort_at}`}>
                      <div className="tl-date">{fmtNoteDay(item.date)}</div>
                      <div className="small muted">
                        {labelStatus(item.from_status ?? "")} → {labelStatus(item.to_status ?? "")}
                        {item.reason ? `：${item.reason}` : ""}
                      </div>
                    </section>
                  ),
                )}
              </div>
            ) : (
              <div className="empty">还没有随记或状态变更。可以先写一条挂在这个目标上。</div>
            )}
          </div>
      </aside>
      {noteForm ? (
        <NoteFormModal
          form={noteForm}
          areas={areas}
          goals={[goal]}
          busy={noteBusy}
          lockGoal
          onClose={() => setNoteForm(null)}
          onSave={(next) => void saveNote(next)}
        />
      ) : null}
      {pendingDelete ? (
        <Modal onClose={() => setPendingDelete(null)}>
          <h3>删除这条随记？</h3>
          <p className="muted">{pendingDelete.body.slice(0, 80)}</p>
          <div className="modal-foot">
            <button className="btn" type="button" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={noteBusy}
              onClick={() => void removeNote(pendingDelete.id)}
            >
              删除
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function labelStatus(s: string) {
  return STATUS_LABEL[s as GoalStatus] ?? s;
}
