import { STATUS_LABEL, type GoalStatus } from "../../shared/constants";
import type { WeekSnapshot } from "../../shared/types";
import { ReviewHabitRates } from "./ReviewHabitRates";

export function WeekSummary({ snap }: { snap: WeekSnapshot }) {
  const pct =
    snap.task_total > 0 ? Math.round((snap.task_done / snap.task_total) * 100) : 0;
  return (
    <>
      <div className="summary-kv">
        <section className="card">
          <div className="stat">
            <span className="v">
              {snap.task_done}/{snap.task_total}
            </span>
            <span className="k">任务完成 · {pct}%</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v">{snap.unlinked}</span>
            <span className="k">未关联目标的任务</span>
          </div>
        </section>
        <section className="card">
          <div className="stat">
            <span className="v" style={{ fontSize: 15 }}>
              {snap.most_carried ? snap.most_carried.title : "无"}
            </span>
            <span className="k">
              {snap.most_carried
                ? `拖延最久 · 已拖 ${snap.most_carried.carried} 周`
                : "没有反复拖延的任务"}
            </span>
          </div>
        </section>
      </div>
      <div className="grid-2 mt-16">
        <section className="card">
          <div className="card-title">习惯完成率</div>
          {snap.habits.length ? (
            <ReviewHabitRates habits={snap.habits} />
          ) : (
            <div className="empty">本周没有进行中的习惯。</div>
          )}
        </section>
        <section className="card">
          <div className="card-title">本周目标状态</div>
          {snap.goals.length ? (
            snap.goals.map((g, i) => (
              <div className="row mb-8" key={`${g.title}-${i}`}>
                <span className="dot" style={{ background: g.color }} />
                <span style={{ flex: 1 }}>{g.title}</span>
                <span className={`tag ${g.status}`}>
                  {STATUS_LABEL[g.status as GoalStatus] ?? g.status}
                </span>
                <span className="muted small">{g.progress}%</span>
              </div>
            ))
          ) : (
            <div className="empty">本周没有周目标。</div>
          )}
        </section>
      </div>
    </>
  );
}
