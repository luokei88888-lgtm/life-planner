import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { habitFreqLabel } from "../../shared/constants";
import { addDays, isoDate, weekStartOf } from "../../shared/time";
import type { Goal, HabitRow } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { HabitFormModal, type HabitFormState } from "./HabitFormModal";

export function HabitsPage() {
  const { areas, settings, notify } = useApp();
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<HabitFormState | null>(null);
  const today = isoDate();
  const weekStart = weekStartOf(today, settings.week_starts_on);

  async function reload() {
    setHabits(await api.listHabits());
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [list, goalList] = await Promise.all([api.listHabits(), api.listGoals()]);
        if (!cancelled) {
          setHabits(list);
          setGoals(goalList);
        }
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载习惯");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  async function toggle(id: string, date: string) {
    setBusy(true);
    try {
      await api.toggleHabitLog(id, date);
      await reload();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "打卡失败");
    } finally {
      setBusy(false);
    }
  }

  async function save(next: HabitFormState) {
    setBusy(true);
    try {
      if (next.id) {
        await api.updateHabit({
          id: next.id,
          title: next.title,
          areaId: next.areaId,
          frequencyType: next.frequencyType,
          frequencyTarget: next.frequencyTarget,
          goalId: next.goalId || null,
        });
        await reload();
        notify("已保存");
      } else {
        setHabits(
          await api.createHabit({
            title: next.title,
            areaId: next.areaId,
            frequencyType: next.frequencyType,
            frequencyTarget: next.frequencyTarget,
            goalId: next.goalId || null,
          }),
        );
        notify("习惯已创建");
      }
      setForm(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">习惯</h1>
          <p className="page-sub">每天或每周固定频率的小事。习惯挂在维度下，也可以再挂到具体目标。</p>
        </div>
        <div className="head-actions">
          <button
            className="btn primary"
            disabled={busy || areas.length === 0}
            onClick={() =>
              setForm({
                title: "",
                areaId: areas[0]?.id ?? "",
                goalId: "",
                frequencyType: "daily",
                frequencyTarget: 7,
              })
            }
          >
            新建习惯
          </button>
        </div>
      </div>

      <section className="card">
        {habits.length ? (
          habits.map((h) => {
            const area = areas.find((a) => a.id === h.area_id);
            return (
              <div className={`habit-row ${h.is_active ? "" : "muted"}`} key={h.id}>
                <Link className="habit-main" to={`/habits/${h.id}`}>
                  <span className="dot" style={{ background: area?.color ?? "var(--muted)" }} />
                  <div className="h-title">
                    <div className="strong">
                      {h.title}
                      {h.is_active ? null : <span className="tag">已停用</span>}
                    </div>
                    <div className="muted small">
                      {area?.name ?? "未知维度"}
                      {h.goal_id
                        ? ` · ${goals.find((g) => g.id === h.goal_id)?.title ?? "目标"}`
                        : ""}{" "}
                      · {habitFreqLabel(h.frequency_type, h.frequency_target)}
                    </div>
                  </div>
                  <div className="habit-week">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(weekStart, i);
                      return <span key={d} className={h.week_dates.includes(d) ? "on" : ""} title={d} />;
                    })}
                  </div>
                  <span className="muted small habit-stat">
                    本周 {h.week_count}/{h.frequency_target}
                  </span>
                  <span className="muted small habit-stat">
                    连续 {h.streak_n} {h.streak_unit}
                  </span>
                </Link>
                <button
                  type="button"
                  className={`checkbox ${h.done_today ? "on" : ""} ${h.is_active ? "" : "disabled"}`}
                  disabled={busy || !h.is_active}
                  aria-label={h.done_today ? "取消今日打卡" : "今日打卡"}
                  onClick={() => void toggle(h.id, today)}
                />
              </div>
            );
          })
        ) : (
          <p className="empty">还没有习惯。先建一个挂在某个维度下的小事。</p>
        )}
      </section>

      {form ? (
        <HabitFormModal
          form={form}
          areas={areas}
          goals={goals}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}
    </>
  );
}

