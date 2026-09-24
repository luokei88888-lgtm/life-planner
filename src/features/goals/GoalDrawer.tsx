import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { LEVEL_LABEL, STATUS_LABEL, childLevelsOf, type GoalLevel, type GoalStatus } from "../../shared/constants";
import type { Area, Goal, GoalTimelineItem, Task } from "../../shared/types";
import { fmtNoteDay, isoDate, weekStartOf } from "../../shared/time";
import { useApp } from "../../app/AppContext";
import { TaskRow } from "../week/TaskRow";
import { LevelTag, levelToneStyle } from "../../ui/levelTone";
import { ancestorWhy } from "./goalWhy";

export function GoalDrawer({
  goal,
  parent,
  children,
  byId,
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
  onTasksMutated,
}: {
  goal: Goal;
  parent: Goal | null;
  children: Goal[];
  byId: Map<string, Goal>;
  areas: Area[];
  progress: number;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onEdit: () => void;
  onAddChild: (level: GoalLevel) => void;
  onDelete: () => void;
  onStatus: (to: GoalStatus) => void;
  onProgressInput: (value: number) => void;
  onProgressCommit: (value: number) => void;
  onTasksMutated?: () => void | Promise<void>;
}) {
  const { notify, settings } = useApp();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weekLocked, setWeekLocked] = useState(false);
  const [timeline, setTimeline] = useState<GoalTimelineItem[]>([]);
  const maskDown = useRef(false);
  const terminal = goal.status === "done" || goal.status === "dropped";
  const nextLevels = childLevelsOf(goal.level);
  const canDelete = goal.child_count === 0 && goal.task_count === 0 && tasks.length === 0;
  const area = areas.find((a) => a.id === goal.area_id);
  const thisWeek = weekStartOf(isoDate(), settings.week_starts_on);
  const thisWeekTasks = tasks.filter((t) => t.week_start === thisWeek);
  const earlierTasks = tasks.filter((t) => t.week_start !== thisWeek);
  const ownWhy = goal.why.trim();
  const inherited = ownWhy ? null : ancestorWhy(parent, byId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = (await api.listGoalTimeline(goal.id)).filter((item) => item.item_kind === "status");
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
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (goal.level === "life") {
      setTasks([]);
      setWeekLocked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listGoalTasks(goal.id);
        const plan = await api.listWeekPlan(thisWeek);
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
  }, [goal.id, goal.level, thisWeek, notify]);

  async function mutateTask(fn: () => Promise<unknown>) {
    try {
      await fn();
      setTasks(await api.listGoalTasks(goal.id));
      await onTasksMutated?.();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  return createPortal(
    <>
      <div
        className="drawer-mask"
        onPointerDown={(event) => {
          maskDown.current = event.target === event.currentTarget;
        }}
        onPointerUp={(event) => {
          if (event.target === event.currentTarget && maskDown.current) onClose();
          maskDown.current = false;
        }}
      />
      <aside className="drawer">
        <div className="drawer-head">
          <div>
            <div className="row mb-8">
              <LevelTag level={goal.level} />
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
          <span>
            {ownWhy ? (
              ownWhy
            ) : inherited ? (
              <>
                <span className="muted">沿用{LEVEL_LABEL[inherited.from.level]} · </span>
                {inherited.text}
              </>
            ) : (
              "未填写"
            )}
          </span>
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
              "无"
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
            <span className="muted small">
              {terminal ? null : "拖动是判断"}
              {thisWeekTasks.length
                ? `${terminal ? "" : " · "}本周 ${thisWeekTasks.filter((t) => t.status === "done").length}/${thisWeekTasks.length} 是执行`
                : null}
            </span>
          </div>
          <input
            type="range"
            className="toned"
            style={levelToneStyle(goal.level)}
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
        {nextLevels.length ? (
          <div className="mt-24">
            <div className="row between mb-8">
              <span className="strong">子目标（{children.length}）</span>
            </div>
            <div className="row wrap mb-8">
              {nextLevels.map((level) => (
                <button
                  key={level}
                  className="btn sm"
                  disabled={busy}
                  onClick={() => onAddChild(level)}
                >
                  + {LEVEL_LABEL[level]}
                </button>
              ))}
            </div>
            {children.length ? (
              children.map((k) => {
                const color = areas.find((a) => a.id === k.area_id)?.color ?? "var(--accent)";
                return (
                  <button key={k.id} className="task-row" onClick={() => onSelect(k.id)}>
                    <span className="dot" style={{ background: color }} />
                    <span className="task-title">{k.title}</span>
                    <LevelTag level={k.level} />
                    <span className={`tag ${k.status}`}>{STATUS_LABEL[k.status]}</span>
                    <span className="muted small">
                      {k.progress}%
                      {k.week_task_total > 0
                        ? ` · 本周 ${k.week_task_done}/${k.week_task_total}`
                        : ""}
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="empty">
                {goal.level === "week"
                  ? "周目标下面不再拆目标，去任务里写这周要做的事。"
                  : `还没有子目标。点上面的「+」挂更短周期，也可以不拆。`}
              </div>
            )}
          </div>
        ) : null}
        {goal.level !== "life" ? (
          <div className="mt-24">
            <div className="row between mb-8">
              <span className="strong">
                任务（{tasks.filter((t) => t.status === "done").length}/{tasks.length}）
              </span>
              <Link className="btn sm" to="/week">
                去任务
              </Link>
            </div>
            {tasks.length ? (
              <>
                {thisWeekTasks.length ? (
                  <>
                    <div className="task-group-title">
                      本周
                      <span className="muted small">
                        {thisWeekTasks.filter((t) => t.status === "done").length}/{thisWeekTasks.length}
                      </span>
                    </div>
                    {thisWeekTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        goal={goal}
                        area={area}
                        locked={weekLocked}
                        onToggle={() => void mutateTask(() => api.toggleTask(t.id))}
                        onFocus={() => void mutateTask(() => api.toggleFocus(t.id))}
                      />
                    ))}
                  </>
                ) : null}
                {earlierTasks.length ? (
                  <>
                    <div className="task-group-title">
                      更早
                      <span className="muted small">{earlierTasks.length}</span>
                    </div>
                    {earlierTasks.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        goal={goal}
                        area={area}
                        locked
                        onToggle={() => undefined}
                        onFocus={() => undefined}
                      />
                    ))}
                  </>
                ) : null}
              </>
            ) : (
              <div className="empty">还没有任务。</div>
            )}
          </div>
        ) : null}
        <div className="mt-24">
          <div className="row between mb-8">
            <span className="strong">时间线</span>
          </div>
          {timeline.length ? (
            <div className="timeline compact">
              {timeline.map((item) => (
                <section className="tl-day status" key={`s-${item.sort_at}`}>
                  <div className="tl-date">{fmtNoteDay(item.date)}</div>
                  <div className="small muted">
                    {labelStatus(item.from_status ?? "")} → {labelStatus(item.to_status ?? "")}
                    {item.reason ? `：${item.reason}` : ""}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="empty">还没有状态变更。</div>
          )}
        </div>
      </aside>
    </>,
    document.body,
  );
}

function labelStatus(s: string) {
  return STATUS_LABEL[s as GoalStatus] ?? s;
}
