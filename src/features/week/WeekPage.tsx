import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { LEVEL_LABEL, TASK_TITLE_MAX } from "../../shared/constants";
import {
  addDays,
  dayOptions,
  fmtMd,
  isoDate,
  parseIso,
  weekLabel,
  weekNo,
  weekStartOf,
  weekdayLabel,
} from "../../shared/time";
import type { Goal, Task, WeekPlan } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";
import { TaskRow } from "./TaskRow";
import { isTaskAncestorGoal, isTaskWeekGoal, advancingGoals, taskGoalSelectOptions } from "./taskGoals";

export function WeekPage() {
  const { areas, settings, notify } = useApp();
  const [params] = useSearchParams();
  const [offset, setOffset] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [goalId, setGoalId] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [editing, setEditing] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editGoalId, setEditGoalId] = useState("");
  const [editDate, setEditDate] = useState("");

  const today = isoDate();
  const thisWeek = weekStartOf(today, settings.week_starts_on);
  const weekStart = addDays(thisWeek, 7 * offset);
  const days = dayOptions(weekStart);
  const locked = plan?.locked ?? false;

  useEffect(() => {
    const ws = params.get("ws");
    if (!ws) return;
    const n = Math.round((parseIso(ws).getTime() - parseIso(thisWeek).getTime()) / 86400000 / 7);
    if (!Number.isNaN(n)) setOffset(n);
  }, [params, thisWeek]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [allGoals, nextPlan] = await Promise.all([
          api.listGoals(),
          api.listWeekPlan(weekStart),
        ]);
        if (cancelled) return;
        setGoals(allGoals);
        setPlan(nextPlan);
        setPlannedDate((prev) => {
          if (prev && days.includes(prev)) return prev;
          return days.includes(today) ? today : "";
        });
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载本周计划");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart, notify, today]);

  const weekGoals = useMemo(
    () => goals.filter((g) => isTaskWeekGoal(g, weekStart)),
    [goals, weekStart],
  );
  const ancestorGoals = useMemo(
    () => goals.filter((g) => isTaskAncestorGoal(g, weekStart)),
    [goals, weekStart],
  );
  const advancing = useMemo(() => advancingGoals(goals, weekStart), [goals, weekStart]);
  const tasks = plan?.tasks ?? [];
  const byGoal = (id: string) => tasks.filter((t) => t.goal_id === id);
  const unlinked = tasks.filter((t) => !t.goal_id);
  const groupedGoals = useMemo(() => {
    const hanging = ancestorGoals.filter((g) => tasks.some((t) => t.goal_id === g.id));
    return [...weekGoals, ...hanging];
  }, [weekGoals, ancestorGoals, tasks]);
  const stray = tasks.filter(
    (t) => t.goal_id && !groupedGoals.some((g) => g.id === t.goal_id),
  );
  const addGoalOptions = useMemo(
    () => taskGoalSelectOptions(goals, weekStart, areas, goalId),
    [goals, weekStart, areas, goalId],
  );
  const editGoalOptions = useMemo(
    () => taskGoalSelectOptions(goals, weekStart, areas, editGoalId),
    [goals, weekStart, areas, editGoalId],
  );
  const prev = plan?.prev_unfinished ?? [];
  const showCarry = weekStart >= thisWeek && prev.length > 0;
  const heading =
    offset === 0 ? "本周计划" : offset === -1 ? "上周" : offset === 1 ? "下周计划" : "周计划";

  useEffect(() => {
    const ok =
      !goalId ||
      weekGoals.some((g) => g.id === goalId && g.status === "active") ||
      ancestorGoals.some((g) => g.id === goalId);
    if (!ok) setGoalId("");
  }, [weekStart, weekGoals, ancestorGoals, goalId]);

  async function apply(fn: () => Promise<WeekPlan>, ok?: string) {
    setBusy(true);
    try {
      setPlan(await fn());
      if (ok) notify(ok);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function addTask() {
    const nextTitle = title.trim();
    if (!nextTitle) {
      notify("先写一个任务标题");
      return;
    }
    await apply(
      () =>
        api.createTask({
          title: nextTitle,
          weekStart,
          goalId: goalId || null,
          plannedDate: plannedDate || null,
        }),
    );
    setTitle("");
  }

  function openMenu(task: Task) {
    setEditing(task);
    setEditTitle(task.title);
    setEditGoalId(task.goal_id ?? "");
    setEditDate(task.planned_date ?? "");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">
            {heading}
            {locked ? <span className="tag lock">已复盘，只读</span> : null}
          </h1>
          <p className="page-sub">
            {weekLabel(weekStart)} · 第 {weekNo(weekStart)} 周 · 任务{" "}
            {tasks.filter((t) => t.status === "done").length}/{tasks.length}
          </p>
        </div>
        <div className="head-actions btn-group">
          <button className="btn" onClick={() => setOffset((n) => n - 1)}>
            上一周
          </button>
          <button className="btn" onClick={() => setOffset(0)}>
            本周
          </button>
          <button className="btn" onClick={() => setOffset((n) => n + 1)}>
            下一周
          </button>
        </div>
      </div>

      {showCarry ? (
        <div className="banner mb-16">
          <div>
            {weekLabel(addDays(weekStart, -7))} 有 <b>{prev.length}</b>{" "}
            个任务未完成（仍是原来的任务，不是复盘里新写的）：
            {prev.map((t) => t.title).join("、")}
          </div>
          <button
            className="btn sm primary"
            disabled={busy}
            onClick={() =>
              void apply(() => api.carryUnfinished(addDays(weekStart, -7)), "未完成任务已移到本周")
            }
          >
            批量移到本周
          </button>
        </div>
      ) : null}

      <div className="cols-side">
        <div className="stack">
          <section className="card">
            <div className="card-title">
              本周在推进 <Link className="muted small" to="/goals">管理</Link>
            </div>
            {advancing.length ? (
              advancing.map((g) => {
                const color = areas.find((a) => a.id === g.area_id)?.color ?? "var(--accent)";
                return (
                  <Link className="goal-card mb-8" key={g.id} to="/goals">
                    <span className="bar" style={{ background: color }} />
                    <div className="body">
                      <div className="title">
                        {g.level !== "week" ? (
                          <span className="tag level">{LEVEL_LABEL[g.level]}</span>
                        ) : null}{" "}
                        {g.title}
                      </div>
                      <div className="row mt-8">
                        <div style={{ flex: 1 }}>
                          <div className="progress thin">
                            <div style={{ width: `${g.progress}%` }} />
                          </div>
                        </div>
                        <span className="muted small">{g.progress}%</span>
                        {g.week_task_total > 0 ? (
                          <span className="muted small">
                            本周 {g.week_task_done}/{g.week_task_total}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                );
              })
            ) : (
              <p className="empty">
                不必先建周目标。右侧直接加任务，可挂覆盖本周的月 / 季 / 年目标；也可以先到目标页立一条年度目标。
              </p>
            )}
          </section>
          <section className="card">
            <div className="card-title">按天分布</div>
            {days.map((d) => {
              const n = tasks.filter((t) => t.planned_date === d).length;
              return (
                <div className="row between small" key={d} style={{ padding: "3px 0" }}>
                  <span className={d === today ? "strong" : "muted"}>
                    {fmtMd(d)} {weekdayLabel(d)}
                    {d === today ? " · 今天" : ""}
                  </span>
                  <span className="muted">{n ? `${n} 个` : ""}</span>
                </div>
              );
            })}
          </section>
        </div>

        <section className="card">
          {locked ? null : (
            <form
              className="inline-form mb-16"
              onSubmit={(e) => {
                e.preventDefault();
                void addTask();
              }}
            >
              <input
                type="text"
                maxLength={TASK_TITLE_MAX}
                placeholder="新任务标题，回车添加"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <Select
                value={goalId}
                options={addGoalOptions}
                onChange={setGoalId}
              />
              <Select
                style={{ width: 130 }}
                value={plannedDate}
                options={[
                  { value: "", label: "不定日期" },
                  ...days.map((d) => ({ value: d, label: `${fmtMd(d)} ${weekdayLabel(d)}` })),
                ]}
                onChange={setPlannedDate}
              />
              <button className="btn primary" disabled={busy} type="submit">
                添加
              </button>
            </form>
          )}

          {groupedGoals.map((g) => {
            const ts = byGoal(g.id);
            const color = areas.find((a) => a.id === g.area_id)?.color ?? "var(--accent)";
            return (
              <div key={g.id}>
                <div className="task-group-title">
                  <span className="dot" style={{ background: color }} />
                  {g.title}
                  {g.level !== "week" ? (
                    <span className="tag level">{LEVEL_LABEL[g.level]}</span>
                  ) : null}
                  <span className="muted small">
                    {ts.filter((t) => t.status === "done").length}/{ts.length}
                  </span>
                </div>
                {ts.length ? (
                  ts.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      goal={g}
                      area={areas.find((a) => a.id === g.area_id)}
                      locked={locked}
                      onToggle={() => void apply(() => api.toggleTask(t.id))}
                      onFocus={() =>
                        void apply(
                          () => api.toggleFocus(t.id),
                          t.is_focus ? undefined : t.planned_date === today || !t.planned_date ? "已设为今日焦点" : `已设为 ${fmtMd(t.planned_date)} 的焦点`,
                        )
                      }
                      onMenu={() => openMenu(t)}
                    />
                  ))
                ) : (
                  <div className="empty">这个目标下还没有任务。</div>
                )}
              </div>
            );
          })}

          {stray.length ? (
            <>
              <div className="task-group-title">其他目标</div>
              {stray.map((t) => {
                const g = goals.find((x) => x.id === t.goal_id);
                const area = g ? areas.find((a) => a.id === g.area_id) : undefined;
                return (
                  <TaskRow
                    key={t.id}
                    task={t}
                    goal={g}
                    area={area}
                    locked={locked}
                    onToggle={() => void apply(() => api.toggleTask(t.id))}
                    onFocus={() => void apply(() => api.toggleFocus(t.id))}
                    onMenu={() => openMenu(t)}
                  />
                );
              })}
            </>
          ) : null}

          <div className="task-group-title">
            <span className="tag unlinked">未关联</span>
            没有挂在目标下的任务
            <span className="muted small">{unlinked.length}</span>
          </div>
          {unlinked.length ? (
            unlinked.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                locked={locked}
                onToggle={() => void apply(() => api.toggleTask(t.id))}
                onFocus={() => void apply(() => api.toggleFocus(t.id))}
                onMenu={() => openMenu(t)}
              />
            ))
          ) : (
            <div className="empty">很好，本周所有任务都服务于某个目标。</div>
          )}
        </section>
      </div>

      {editing ? (
        <Modal onClose={() => setEditing(null)}>
          <h3>任务</h3>
          <div className="field">
            <label htmlFor="tm-title">标题</label>
            <input
              id="tm-title"
              type="text"
              maxLength={TASK_TITLE_MAX}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="tm-goal">关联目标</label>
            <Select
              id="tm-goal"
              value={editGoalId}
              options={editGoalOptions}
              onChange={setEditGoalId}
            />
            <div className="hint">可以不挂，或挂本周目标、覆盖本周的月 / 季 / 年目标。</div>
          </div>
          <div className="field">
            <label htmlFor="tm-date">计划日期</label>
            <Select
              id="tm-date"
              value={editDate}
              options={[
                { value: "", label: "不定日期" },
                ...days.map((d) => ({ value: d, label: `${fmtMd(d)} ${weekdayLabel(d)}` })),
              ]}
              onChange={setEditDate}
            />
          </div>
          <div className="modal-foot" style={{ justifyContent: "space-between" }}>
            <div className="btn-group">
              <button
                className="btn danger"
                disabled={busy}
                onClick={() =>
                  void apply(async () => {
                    const next = await api.deleteTask(editing.id);
                    setEditing(null);
                    return next;
                  }, "任务已删除")
                }
              >
                删除
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  void apply(async () => {
                    const next = await api.carryTask(editing.id);
                    setEditing(null);
                    return next;
                  }, "已移到下周")
                }
              >
                移到下周
              </button>
            </div>
            <div className="btn-group">
              <button className="btn" onClick={() => setEditing(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={busy || !editTitle.trim()}
                onClick={() =>
                  void apply(async () => {
                    const next = await api.updateTask(
                      editing.id,
                      editTitle.trim(),
                      editGoalId || null,
                      editDate || null,
                    );
                    setEditing(null);
                    return next;
                  }, "已保存")
                }
              >
                保存
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
