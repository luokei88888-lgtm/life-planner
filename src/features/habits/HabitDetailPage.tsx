import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { habitFreqLabel } from "../../shared/constants";
import { daysInMonth, fmtMd, fmtMonth, isoDate, mondayOffset, weekdayLabel } from "../../shared/time";
import type { Goal, HabitDetail } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { HabitFormModal, type HabitFormState } from "./HabitFormModal";

export function HabitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { areas, notify } = useApp();
  const [habit, setHabit] = useState<HabitDetail | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<HabitFormState | null>(null);
  const today = isoDate();

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [next, goalList] = await Promise.all([api.getHabit(id), api.listGoals()]);
        if (!cancelled) {
          setHabit(next);
          setGoals(goalList);
          setMissing(false);
        }
      } catch (e) {
        if (!cancelled) {
          setMissing(true);
          notify(e instanceof ApiError ? e.message : "无法加载习惯");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, notify]);

  const cells = useMemo(() => {
    if (!habit) return [];
    const dim = daysInMonth(habit.month);
    const offset = mondayOffset(habit.month);
    const out: { key: string; day?: number; date?: string; on?: boolean; today?: boolean; future?: boolean; clickable?: boolean }[] = [];
    for (let i = 0; i < offset; i++) out.push({ key: `e${i}` });
    for (let d = 1; d <= dim; d++) {
      const date = `${habit.month}-${String(d).padStart(2, "0")}`;
      const on = habit.month_logs.includes(date);
      const future = date > today;
      const clickable = !future && date >= habit.backfill_from && habit.is_active;
      out.push({
        key: date,
        day: d,
        date,
        on,
        today: date === today,
        future,
        clickable,
      });
    }
    return out;
  }, [habit, today]);

  async function toggle(date: string) {
    if (!habit) return;
    setBusy(true);
    try {
      setHabit(await api.toggleHabitLog(habit.id, date));
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "打卡失败");
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div>
        <Link className="muted small" to="/habits">
          ← 返回习惯列表
        </Link>
        <p className="empty">习惯不存在。</p>
      </div>
    );
  }

  if (!habit) {
    return <p className="empty">正在加载习惯…</p>;
  }

  const area = areas.find((a) => a.id === habit.area_id);
  const prevLabel = Number(habit.prev_month.slice(5));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row mb-8">
            <Link className="muted small" to="/habits">
              ← 返回习惯列表
            </Link>
          </div>
          <h1 className="page-title">
            <span
              className="dot"
              style={{ background: area?.color ?? "var(--muted)", width: 12, height: 12 }}
            />
            {habit.title}
          </h1>
          <p className="page-sub">
            {area?.name ?? "未知维度"}
            {habit.goal_id ? ` · ${goals.find((g) => g.id === habit.goal_id)?.title ?? "目标"}` : ""}
            {" · "}
            {habitFreqLabel(habit.frequency_type, habit.frequency_target)}
            {habit.is_active ? "" : " · 已停用"}
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn"
            disabled={busy}
            onClick={() =>
              setForm({
                id: habit.id,
                title: habit.title,
                areaId: habit.area_id,
                goalId: habit.goal_id ?? "",
                frequencyType: habit.frequency_type,
                frequencyTarget: habit.frequency_target,
              })
            }
          >
            编辑
          </button>
          <button
            className={`btn ${habit.is_active ? "danger" : "primary"}`}
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                try {
                  const next = await api.setHabitActive(habit.id, !habit.is_active);
                  setHabit(next);
                  notify(next.is_active ? "已启用" : "已停用，历史记录保留");
                } catch (e) {
                  notify(e instanceof ApiError ? e.message : "操作失败");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            {habit.is_active ? "停用" : "启用"}
          </button>
        </div>
      </div>

      <div className="grid-4 mb-16">
        <section className="card">
          <div className="stat">
            <span className="v">
              {habit.streak_n} <span className="small muted">{habit.streak_unit}</span>
            </span>
            <span className="k">当前连续</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">
              {habit.week_count}/{habit.frequency_target}
            </span>
            <span className="k">本周完成</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">{habit.month_rate}%</span>
            <span className="k">{Number(habit.month.slice(5))} 月完成率（截至今天）</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">{habit.prev_month_rate}%</span>
            <span className="k">{prevLabel} 月完成率</span>
          </div>
        </section>
      </div>

      <div className="cols-side">
        <section className="card">
          <div className="card-title">
            最近 7 天 <span className="muted small">可补卡</span>
          </div>
          {habit.recent.map((d) => (
            <div className={`task-item ${d.done ? "done" : ""}`} key={d.date}>
              <button
                type="button"
                className={`checkbox ${d.done ? "on" : ""} ${habit.is_active ? "" : "disabled"}`}
                disabled={busy || !habit.is_active}
                aria-label={d.done ? "取消打卡" : "打卡"}
                onClick={() => void toggle(d.date)}
              />
              <span className="task-title">
                {fmtMd(d.date)} {weekdayLabel(d.date)}
                {d.date === today ? " · 今天" : ""}
              </span>
            </div>
          ))}
          <p className="muted small mt-8">超过 7 天的记录不可补卡。</p>
        </section>
        <section className="card">
          <div className="card-title">{fmtMonth(habit.month)} 打卡热力图</div>
          <div className="heat">
            {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
              <div className="hd" key={d}>
                {d}
              </div>
            ))}
            {cells.map((c) =>
              c.day == null ? (
                <div className="cell empty" key={c.key} />
              ) : (
                <button
                  type="button"
                  key={c.key}
                  className={`cell ${c.on ? "on" : ""} ${c.today ? "today" : ""} ${c.future ? "future" : ""} ${c.clickable ? "clickable" : ""}`}
                  disabled={!c.clickable || busy}
                  title={`${c.date}${c.clickable ? "（可补卡）" : ""}`}
                  onClick={() => c.date && c.clickable && void toggle(c.date)}
                >
                  {c.day}
                </button>
              ),
            )}
          </div>
        </section>
      </div>

      {form ? (
        <HabitFormModal
          form={form}
          areas={areas}
          goals={goals}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={(next) => {
            void (async () => {
              setBusy(true);
              try {
                const updated = await api.updateHabit({
                  id: habit.id,
                  title: next.title,
                  areaId: next.areaId,
                  frequencyType: next.frequencyType,
                  frequencyTarget: next.frequencyTarget,
                  goalId: next.goalId || null,
                });
                setHabit(updated);
                setForm(null);
                notify("已保存");
              } catch (e) {
                notify(e instanceof ApiError ? e.message : "保存失败");
              } finally {
                setBusy(false);
              }
            })();
          }}
        />
      ) : null}
    </>
  );
}
