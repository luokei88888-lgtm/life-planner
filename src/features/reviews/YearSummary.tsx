import { fmtMonth } from "../../shared/time";
import { STATUS_LABEL, type GoalStatus } from "../../shared/constants";
import type { YearSnapshot } from "../../shared/types";
import { LineChart } from "./LineChart";
import { GoalTaskEvidence } from "./GoalTaskEvidence";
import { ReviewHabitRates } from "./ReviewHabitRates";

export function YearSummary({ snap, frozen }: { snap: YearSnapshot; frozen?: boolean }) {
  const avg = snap.submitted_months ? snap.satisfaction_avg : "—";
  return (
    <>
      <div className="grid-3">
        <section className="card">
          <div className="stat">
            <span className="v">{avg}</span>
            <span className="k">
              月复盘满意度均值（{snap.submitted_months} 月）
              {snap.skipped ? ` · 跳过 ${snap.skipped} 次` : ""}
            </span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">
              {snap.goals_done}/{snap.goals_total}
            </span>
            <span className="k">年度目标完成</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">{snap.habit_rate}%</span>
            <span className="k">习惯年平均完成率</span>
          </div>
        </section>
      </div>
      <div className="grid-2 mt-16">
        <section className="card">
          <div className="card-title">每月满意度</div>
          {snap.months.length ? (
            <LineChart
              points={snap.months.map((m) => ({ v: m.satisfaction, label: fmtMonth(m.month) }))}
            />
          ) : (
            <div className="empty">本年还没有已提交的月复盘。</div>
          )}
        </section>
        <section className="card">
          <div className="card-title">人生目标进度</div>
          {snap.life_goals.length ? (
            <>
              {snap.life_goals.filter((g) => g.status === "active" || !g.status).length ? (
                snap.life_goals
                  .filter((g) => g.status === "active" || !g.status)
                  .map((g, i) => (
                    <div className="row mb-8" key={`${g.title}-active-${i}`}>
                      <span className="bar" style={{ background: g.color, height: 18 }} />
                      <span style={{ width: 120 }}>{g.title}</span>
                      <div style={{ flex: 1 }}>
                        <div className="progress thin">
                          <div style={{ width: `${g.progress}%` }} />
                        </div>
                      </div>
                      <span className="muted small" style={{ width: 40, textAlign: "right" }}>
                        {g.progress}%
                      </span>
                    </div>
                  ))
              ) : (
                <div className="empty">没有进行中的人生目标。</div>
              )}
              {snap.life_goals.some((g) => g.status && g.status !== "active") ? (
                <div className="muted small mt-8">
                  其他状态：
                  {snap.life_goals
                    .filter((g) => g.status && g.status !== "active")
                    .map((g) => `${g.title}（${STATUS_LABEL[g.status as GoalStatus] ?? g.status}）`)
                    .join(" · ")}
                </div>
              ) : null}
            </>
          ) : (
            <div className="empty">还没有人生目标。</div>
          )}
        </section>
      </div>
      <section className="card mt-16">
        <div className="card-title">习惯年完成率</div>
        {snap.habit_rates.length ? (
          <ReviewHabitRates habits={snap.habit_rates} />
        ) : (
          <div className="empty">没有进行中的习惯。</div>
        )}
      </section>
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
                    <div style={{ width: `${a.score * 10}%`, background: a.color }} />
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
