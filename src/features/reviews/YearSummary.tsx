import { fmtMonth } from "../../shared/time";
import type { YearSnapshot } from "../../shared/types";
import { LineChart } from "./LineChart";

export function YearSummary({ snap }: { snap: YearSnapshot }) {
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
            snap.life_goals.map((g) => (
              <div className="row mb-8" key={g.title}>
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
            <div className="empty">还没有人生目标。</div>
          )}
        </section>
      </div>
      <section className="card mt-16">
        <div className="card-title">习惯年完成率</div>
        {snap.habit_rates.length ? (
          snap.habit_rates.map((h) => (
            <div className="row mb-8" key={h.title}>
              <span style={{ width: 120 }}>{h.title}</span>
              <div style={{ flex: 1 }}>
                <div className="progress thin">
                  <div style={{ width: `${h.rate}%` }} />
                </div>
              </div>
              <span className="muted small" style={{ width: 40, textAlign: "right" }}>
                {h.rate}%
              </span>
            </div>
          ))
        ) : (
          <div className="empty">没有进行中的习惯。</div>
        )}
      </section>
    </>
  );
}
