import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { FOCUS_LIMIT } from "../../shared/constants";
import { dayOptions, fmtMonth, isoDate, parseIso, weekLabel, weekNo, weekStartOf, weekdayLabel } from "../../shared/time";
import type { Goal, HabitRow, ReviewList, Task } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { RadarChart } from "../areas/RadarChart";
import { TaskRow } from "../week/TaskRow";

export function HomePage() {
  const { areas, settings, notify } = useApp();
  const [weekGoals, setWeekGoals] = useState<Goal[]>([]);
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [locked, setLocked] = useState(false);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [reviews, setReviews] = useState<ReviewList | null>(null);
  const scored = areas.filter((a) => a.score != null).length;
  const today = isoDate();
  const weekStart = weekStartOf(today, settings.week_starts_on);
  const days = dayOptions(weekStart);
  const focus = tasks.filter((t) => t.is_focus && t.planned_date === today);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, plan, habitList, reviewList] = await Promise.all([
          api.listGoals(),
          api.listWeekPlan(weekStart),
          api.listHabits(),
          api.listReviews(),
        ]);
        if (cancelled) return;
        setAllGoals(list);
        setWeekGoals(
          list.filter((g) => g.level === "week" && g.period_start === weekStart && g.status !== "dropped"),
        );
        setTasks(plan.tasks);
        setLocked(plan.locked);
        setHabits(habitList.filter((h) => h.is_active));
        setReviews(reviewList);
      } catch {
        if (!cancelled) {
          setWeekGoals([]);
          setTasks([]);
          setHabits([]);
          setReviews(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  async function mutate(fn: () => Promise<{ tasks: Task[]; locked: boolean }>) {
    try {
      const plan = await fn();
      setTasks(plan.tasks);
      setLocked(plan.locked);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">首页</h1>
          <p className="page-sub">
            第 {weekNo(today)} 周 · {weekLabel(weekStart)} · 任务{" "}
            {tasks.filter((t) => t.status === "done").length}/{tasks.length}
            {" · "}今日习惯 {habits.filter((h) => h.done_today).length}/{habits.length}
          </p>
        </div>
        <div className="head-actions">
          <Link className="btn primary" to="/week">
            进入本周计划
          </Link>
        </div>
      </div>

      {settings.onboarded ? null : (
        <div className="banner warn mb-16">
          <div>建议先走一遍新手引导，把「现状 → 年度目标 → 本周任务 → 习惯」这条链搭起来。</div>
          <Link className="btn sm" to="/onboarding">
            开始引导
          </Link>
        </div>
      )}

      {reviews?.pending.length ? (
        <div className="banner warn mb-16">
          <div>
            你有 {reviews.pending.length} 项复盘待处理：
            {reviews.pending
              .map((p) =>
                p.kind === "weekly"
                  ? `${weekLabel(p.key)} 周复盘${p.draft ? "（草稿）" : ""}`
                  : p.kind === "monthly"
                    ? `${fmtMonth(p.key)} 月复盘`
                    : `${p.key} 年复盘`,
              )
              .join("、")}
          </div>
          <Link className="btn sm" to="/reviews">
            去复盘
          </Link>
        </div>
      ) : null}

      <div className="home-today">
        <section className="card">
          <div className="card-title">
            今日焦点{" "}
            <span className="count">
              <b>{focus.filter((t) => t.status === "done").length}</b>/{focus.length}
            </span>
          </div>
          {focus.length ? (
            focus.map((t) => {
              const goal = t.goal_id ? allGoals.find((g) => g.id === t.goal_id) : undefined;
              const area = goal ? areas.find((a) => a.id === goal.area_id) : undefined;
              return (
                <TaskRow
                  key={t.id}
                  task={t}
                  goal={goal}
                  area={area}
                  locked={locked}
                  compact
                  onToggle={() => void mutate(() => api.toggleTask(t.id))}
                  onFocus={() => void mutate(() => api.toggleFocus(t.id))}
                />
              );
            })
          ) : (
            <p className="empty">今天还没有焦点任务。到「本周计划」里给任务点亮星标。</p>
          )}
          {focus.length < FOCUS_LIMIT ? (
            <Link className="add-line" to="/week">
              + 还可以再选 {FOCUS_LIMIT - focus.length} 个焦点
            </Link>
          ) : null}
        </section>
        <section className="card">
          <div className="card-title">
            今日习惯{" "}
            <span className="count">
              <b>{habits.filter((h) => h.done_today).length}</b>/{habits.length}
            </span>
          </div>
          {habits.length ? (
            habits.map((h) => {
              const area = areas.find((a) => a.id === h.area_id);
              return (
                <div className={`task-item ${h.done_today ? "done" : ""}`} key={h.id}>
                  <button
                    type="button"
                    className={`checkbox ${h.done_today ? "on" : ""}`}
                    aria-label={h.done_today ? "取消今日打卡" : "今日打卡"}
                    onClick={() => {
                      void (async () => {
                        try {
                          await api.toggleHabitLog(h.id, today);
                          setHabits((await api.listHabits()).filter((x) => x.is_active));
                        } catch (e) {
                          notify(e instanceof ApiError ? e.message : "打卡失败");
                        }
                      })();
                    }}
                  />
                  <span className="dot" style={{ background: area?.color ?? "var(--muted)" }} />
                  <span className="task-title">{h.title}</span>
                  <span className="muted small">
                    {h.frequency_type === "daily"
                      ? `连续 ${h.streak_n} ${h.streak_unit}`
                      : `本周 ${h.week_count}/${h.frequency_target}`}
                  </span>
                </div>
              );
            })
          ) : (
            <p className="empty">还没有习惯。到「习惯」里新建一个挂在维度下的小事。</p>
          )}
          <Link className="add-line" to="/habits">
            管理习惯
          </Link>
        </section>
      </div>

      <section className="card home-rhythm">
        <div className="card-title">
          本周节奏 <Link className="muted small" to="/week">本周计划</Link>
        </div>
        <div className="rhythm">
          {days.map((d) => {
            const dayTasks = tasks.filter((t) => t.planned_date === d);
            const done = dayTasks.filter((t) => t.status === "done").length;
            const isToday = d === today;
            return (
              <Link
                key={d}
                className={`rhythm-day${isToday ? " today" : ""}${d < today ? " past" : ""}`}
                to="/week"
              >
                <span className="rd-dow">
                  {weekdayLabel(d)}
                  {isToday ? " · 今天" : ""}
                </span>
                <span className="rd-date">{parseIso(d).getDate()}</span>
                <span className="rd-tasks">
                  {dayTasks.length ? (
                    <>
                      {done}
                      <i>/{dayTasks.length} 任务</i>
                    </>
                  ) : (
                    <i>无任务</i>
                  )}
                </span>
                {habits.length ? (
                  <span className="rd-habits">
                    {habits.map((h) => {
                      const on = h.week_dates.includes(d);
                      const color = areas.find((a) => a.id === h.area_id)?.color;
                      return (
                        <span
                          key={h.id}
                          className={on ? "on" : ""}
                          title={h.title}
                          style={on && color ? { background: color } : undefined}
                        />
                      );
                    })}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>

      <div className="home-bottom">
        <section className="card">
          <div className="card-title">
            本周目标{" "}
            <span className="count">
              <b>{weekGoals.filter((g) => g.status === "done").length}</b>/{weekGoals.length}
            </span>
          </div>
          {weekGoals.length ? (
            weekGoals.map((g) => {
              const color = areas.find((a) => a.id === g.area_id)?.color ?? "var(--accent)";
              const ts = tasks.filter((t) => t.goal_id === g.id);
              return (
                <Link className="goal-card mb-8" key={g.id} to="/goals">
                  <span className="bar" style={{ background: color }} />
                  <div className="body">
                    <div className="title">{g.title}</div>
                    <div className="row mt-8">
                      <div style={{ flex: 1 }}>
                        <div className="progress thin">
                          <div style={{ width: `${g.progress}%` }} />
                        </div>
                      </div>
                      <span className="muted small">
                        {g.progress}% · 任务 {ts.filter((t) => t.status === "done").length}/{ts.length}
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <p className="empty">还没有周目标。请先建立年度目标并逐级拆到本周。</p>
          )}
          <Link className="add-line" to="/goals">
            前往目标
          </Link>
        </section>
        <section className="card">
          <div className="card-title">
            人生之轮 <Link className="muted small" to="/areas">维度详情</Link>
          </div>
          <div className="wheel-body">
            <RadarChart areas={areas} size={200} />
            <div className="wheel-list">
            {areas.map((a) => (
              <div className="wheel-row" key={a.id}>
                <span className="dot" style={{ background: a.color }} />
                <span className="name">{a.name}</span>
                <div className="progress thin">
                  <div style={{ width: `${(a.score ?? 0) * 10}%`, background: a.color }} />
                </div>
                <span className="score">{a.score ?? "—"}</span>
              </div>
            ))}
            </div>
          </div>
          <p className="muted small" style={{ marginTop: 12 }}>
            已预置 {areas.length} 个维度
            {scored ? `，其中 ${scored} 个已打分` : "，尚未打分"}
            {settings.onboarded ? "" : "。也可以从设置里重新运行新手引导。"}
          </p>
          <Link className="add-line" to="/areas">
            前往维度
          </Link>
        </section>
      </div>
    </>
  );
}
