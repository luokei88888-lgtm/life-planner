import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  HABIT_KIND_LABEL,
  HOME_TODAY_LIST_MAX,
  areaScorePercent,
  habitCheckLabel,
  habitKindOf,
  habitToggleError,
} from "../../shared/constants";
import { fmtMonth, isoDate, weekLabel, weekNo, weekStartOf } from "../../shared/time";
import type { Goal, HabitRow, ReviewList, Task } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { RadarChart } from "../areas/RadarChart";
import { TaskRow } from "../week/TaskRow";
import { advancingGoals } from "../week/taskGoals";
import { GoalProgress, LevelTag } from "../../ui/levelTone";

export function HomePage() {
  const { areas, settings, notify } = useApp();
  const [allGoals, setAllGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [locked, setLocked] = useState(false);
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [reviews, setReviews] = useState<ReviewList | null>(null);
  const [wheelHover, setWheelHover] = useState<string | null>(null);
  const today = isoDate();
  const weekStart = weekStartOf(today, settings.week_starts_on);
  const focus = tasks.filter((t) => t.is_focus && t.planned_date === today);
  const advancing = useMemo(() => advancingGoals(allGoals, weekStart), [allGoals, weekStart]);

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
        setTasks(plan.tasks);
        setLocked(plan.locked);
        setHabits(habitList.filter((h) => h.is_active));
        setReviews(reviewList);
      } catch {
        if (!cancelled) {
          setAllGoals([]);
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
      setAllGoals(await api.listGoals());
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
          <Link className="btn" to="/week">
            去任务
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

      {advancing.length ? (
        <section className="card mb-16">
          <div className="card-title">
            本周在推进 <Link className="muted small" to="/week">任务</Link>
          </div>
          {advancing.map((g) => {
            const color = areas.find((a) => a.id === g.area_id)?.color ?? "var(--accent)";
            return (
              <Link className="goal-card mb-8" key={g.id} to="/goals">
                <span className="bar" style={{ background: color }} />
                <div className="body">
                  <div className="title">
                    {g.level !== "week" ? (
                      <LevelTag level={g.level} />
                    ) : null}{" "}
                    {g.title}
                  </div>
                  <div className="row mt-8">
                    <div style={{ flex: 1 }}>
                      <GoalProgress level={g.level} value={g.progress} />
                    </div>
                    <span className="muted small">判断 {g.progress}%</span>
                    {g.week_task_total > 0 ? (
                      <span className="muted small">
                        本周执行 {g.week_task_done}/{g.week_task_total}
                      </span>
                    ) : null}
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      <div className="home-today" style={{ ["--home-today-rows" as string]: HOME_TODAY_LIST_MAX }}>
        <section className="card live-card">
          <div className="card-title">
            今日焦点{" "}
            <span className="count">
              <b>{focus.filter((t) => t.status === "done").length}</b>/{focus.length}
            </span>
          </div>
          {focus.length ? (
            <div className="home-today-list">
            {focus.map((t) => {
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
                  showUnlinked={false}
                  onToggle={() => void mutate(() => api.toggleTask(t.id))}
                  onFocus={() => void mutate(() => api.toggleFocus(t.id))}
                />
              );
            })}
            </div>
          ) : (
            <p className="empty">今天还没有焦点任务。到「任务」里点亮星标。</p>
          )}
          <Link className="add-line" to="/week">
            + 到任务里选今天的焦点
          </Link>
        </section>
        <section className="card live-card">
          <div className="card-title">
            今日习惯{" "}
            <span className="count">
              <b>{habits.filter((h) => h.done_today).length}</b>/{habits.length}
            </span>
          </div>
          {habits.length ? (
            <div className="home-today-list">
            {habits.map((h) => {
              const area = areas.find((a) => a.id === h.area_id);
              const kind = habitKindOf(h.kind);
              return (
                <div className={`task-item kind-${kind} ${h.done_today ? "done" : ""}`} key={h.id}>
                  <button
                    type="button"
                    className={`checkbox ${h.done_today ? "on" : ""}`}
                    aria-label={habitCheckLabel(kind, h.done_today)}
                    title={habitCheckLabel(kind, h.done_today)}
                    onClick={() => {
                      void (async () => {
                        try {
                          await api.toggleHabitLog(h.id, today);
                          setHabits((await api.listHabits()).filter((x) => x.is_active));
                        } catch (e) {
                          notify(e instanceof ApiError ? e.message : habitToggleError(kind));
                        }
                      })();
                    }}
                  />
                  <span className="dot" style={{ background: area?.color ?? "var(--muted)" }} />
                  <span className="task-title">
                    {h.title}
                    <span className={`tag kind-${kind}`}>{HABIT_KIND_LABEL[kind]}</span>
                    {h.goal_id ? (
                      <span className="muted small">
                        {" "}
                        · {allGoals.find((g) => g.id === h.goal_id)?.title ?? "目标"}
                      </span>
                    ) : null}
                  </span>
                  <span className="muted small">
                    {h.frequency_type === "daily"
                      ? `连续 ${h.streak_n} ${h.streak_unit}`
                      : `本周 ${h.week_count}/${h.frequency_target}`}
                  </span>
                </div>
              );
            })}
            </div>
          ) : (
            <p className="empty">还没有习惯。到「习惯」里新建养成或戒除。</p>
          )}
          <Link className="add-line" to="/habits">
            管理习惯
          </Link>
        </section>
      </div>

      <section className="card home-wheel live-card">
        <div className="card-title">
          人生之轮 <Link className="muted small" to="/areas">维度详情</Link>
        </div>
        <div className="wheel-body">
          <RadarChart
            areas={areas}
            size={280}
            highlightId={wheelHover}
            onHover={setWheelHover}
          />
          <div className="wheel-list">
            {areas.map((a) => (
              <div
                className={`wheel-row ${wheelHover === a.id ? "on" : ""}`}
                key={a.id}
                onPointerEnter={() => setWheelHover(a.id)}
                onPointerLeave={() => setWheelHover(null)}
              >
                <span className="dot" style={{ background: a.color }} />
                <span className="name">{a.name}</span>
                <div className="progress thin">
                  <div style={{ width: areaScorePercent(a.score ?? 0), background: a.color }} />
                </div>
                <span className="score">{a.score ?? "—"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
