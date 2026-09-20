import { fmtMd } from "../../shared/time";
import { areaScorePercent } from "../../shared/constants";
import type { MonthSnapshot } from "../../shared/types";
import { LineChart } from "./LineChart";
import { GoalTaskEvidence } from "./GoalTaskEvidence";
import { ReviewHabitRates } from "./ReviewHabitRates";

export function MonthSummary({ snap, frozen }: { snap: MonthSnapshot; frozen?: boolean }) {
  const avg = snap.submitted_weeks ? snap.satisfaction_avg : "—";
  return (
    <>
      <div className="grid-3">
        <section className="card">
          <div className="stat">
            <span className="v">{avg}</span>
            <span className="k">
              周复盘满意度均值（{snap.submitted_weeks} 周）
              {snap.skipped ? ` · 跳过 ${snap.skipped} 次` : ""}
            </span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">
              {snap.goals_done}/{snap.goals_total}
            </span>
            <span className="k">月度目标完成</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">{snap.habit_rate}%</span>
            <span className="k">习惯平均完成率</span>
          </div>
        </section>
      </div>
      <div className="grid-2 mt-16">
        <section className="card">
          <div className="card-title">每周满意度</div>
          {snap.weeks.length ? (
            <LineChart
              points={snap.weeks.map((w) => ({ v: w.satisfaction, label: fmtMd(w.week_start) }))}
            />
          ) : (
            <div className="empty">本月还没有已提交的周复盘。</div>
          )}
        </section>
        <section className="card">
          <div className="card-title">习惯月完成率</div>
          {snap.habit_rates.length ? (
            <ReviewHabitRates habits={snap.habit_rates} />
          ) : (
            <div className="empty">没有进行中的习惯。</div>
          )}
        </section>
      </div>
      <GoalTaskEvidence items={snap.goal_tasks} frozen={frozen} />
      {snap.area_scores?.length ? (
        <section className="card mt-16">
          <div className="card-title">{frozen ? "维度快照" : "当前维度分数"}</div>
          <div className="area-score-grid">
            {snap.area_scores.map((a) => (
              <div className="row mb-8" key={a.id}>
                <span className="dot" style={{ background: a.color }} />
                <span style={{ width: 72 }}>{a.name}</span>
                <div style={{ flex: 1 }}>
                  <div className="progress thin">
                    <div style={{ width: areaScorePercent(a.score), background: a.color }} />
                  </div>
                </div>
                <span className="muted small" style={{ width: 28, textAlign: "right" }}>
                  {a.score}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
