import { GOAL_LEVELS } from "../../shared/constants";
import type { SnapGoalTasks } from "../../shared/types";
import { LevelTag } from "../../ui/levelTone";

export function GoalTaskEvidence({
  items,
  frozen,
}: {
  items?: SnapGoalTasks[];
  frozen?: boolean;
}) {
  const rows = items ?? [];
  if (!rows.length) return null;
  const done = rows.reduce((n, row) => n + row.done, 0);
  const total = rows.reduce((n, row) => n + row.total, 0);
  return (
    <section className="card mt-16">
      <div className="card-title">
        {frozen ? "上级目标执行快照" : "挂在上级目标上的任务"}
        <span className="muted small">
          {done}/{total}
        </span>
      </div>
      {rows.map((row) => {
        const level = GOAL_LEVELS.find((item) => item === row.level);
        return (
          <div className="row mb-8" key={row.id}>
            <span className="dot" style={{ background: row.color }} />
            {level ? <LevelTag level={level} /> : <span className="tag level">{row.level}</span>}
            <span style={{ flex: 1 }}>{row.title}</span>
            <span className="muted small">
              {row.done}/{row.total}
            </span>
          </div>
        );
      })}
    </section>
  );
}
