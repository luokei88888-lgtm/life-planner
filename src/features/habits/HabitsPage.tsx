import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { habitCheckLabel, HABIT_KIND_LABEL, HABIT_KINDS, habitFreqLabel, habitKindOf, habitToggleError, HabitKind } from "../../shared/constants";
import { addDays, isoDate, weekStartOf } from "../../shared/time";
import type { Goal, HabitKind as HabitKindId, HabitRow } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { HabitFormModal, type HabitFormState } from "./HabitFormModal";

export function HabitsPage() {
  const { areas, settings, notify } = useApp();
  const [habits, setHabits] = useState<HabitRow[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<HabitFormState | null>(null);
  const [filter, setFilter] = useState<"all" | HabitKindId>("all");
  const today = isoDate();
  const weekStart = weekStartOf(today, settings.week_starts_on);
  const visible = habits.filter((h) => filter === "all" || habitKindOf(h.kind) === filter);

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
    const kind = habitKindOf(habits.find((h) => h.id === id)?.kind);
    setBusy(true);
    try {
      await api.toggleHabitLog(id, date);
      await reload();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : habitToggleError(kind));
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
          kind: next.kind,
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
            kind: next.kind,
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
          <p className="page-sub">
            养成要每天做到，戒除要每天守住。两边都是勾上表示今天成功；空白只是还没记。
          </p>
        </div>
        <div className="head-actions">
          <button
            className="btn primary"
            disabled={busy || areas.length === 0}
            onClick={() =>
              setForm({
                title: "",
                kind: HabitKind.Form,
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

      <div className="row wrap mb-8">
        <button
          type="button"
          className={`chip ${filter === "all" ? "on" : ""}`}
          onClick={() => setFilter("all")}
        >
          全部
        </button>
        {HABIT_KINDS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={`chip ${filter === kind ? "on" : ""}`}
            onClick={() => setFilter(kind)}
          >
            {HABIT_KIND_LABEL[kind]}
          </button>
        ))}
      </div>

      <section className="card">
        {habits.length ? (
          visible.length ? (
          HABIT_KINDS.filter((kind) => filter === "all" || filter === kind).map((kind) => {
            const rows = habits.filter((h) => habitKindOf(h.kind) === kind);
            if (!rows.length) return null;
            return (
              <div key={kind}>
                <div className="habit-group">{HABIT_KIND_LABEL[kind]}</div>
                {rows.map((h) => {
            const area = areas.find((a) => a.id === h.area_id);
            const kindId = habitKindOf(h.kind);
            return (
              <div className={`habit-row kind-${kindId} ${h.is_active ? "" : "muted"}`} key={h.id}>
                <Link className="habit-main" to={`/habits/${h.id}`}>
                  <span className="dot" style={{ background: area?.color ?? "var(--muted)" }} />
                  <div className="h-title">
                    <div className="strong">
                      {h.title}
                      <span className={`tag kind-${kindId}`}>{HABIT_KIND_LABEL[kindId]}</span>
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
                    {kindId === HabitKind.Break ? "守住" : ""}
                  </span>
                </Link>
                <button
                  type="button"
                  className={`checkbox ${h.done_today ? "on" : ""} ${h.is_active ? "" : "disabled"}`}
                  disabled={busy || !h.is_active}
                  aria-label={habitCheckLabel(kindId, h.done_today)}
                  title={habitCheckLabel(kindId, h.done_today)}
                  onClick={() => void toggle(h.id, today)}
                />
              </div>
            );
                })}
              </div>
            );
          })
          ) : (
            <p className="empty">这一类还没有习惯。</p>
          )
        ) : (
          <p className="empty">还没有习惯。先建一个养成或戒除的小事。</p>
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

