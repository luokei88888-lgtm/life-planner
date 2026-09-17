import { fmtMd, weekdayLabel } from "../../shared/time";
import type { Area, Goal, Task } from "../../shared/types";

export function TaskRow({
  task,
  goal,
  area,
  locked,
  compact,
  onToggle,
  onFocus,
  onMenu,
}: {
  task: Task;
  goal?: Goal;
  area?: Area;
  locked: boolean;
  compact?: boolean;
  onToggle: () => void;
  onFocus: () => void;
  onMenu?: () => void;
}) {
  return (
    <div className={`task-item ${task.status}`}>
      <button
        type="button"
        className={`checkbox ${task.status === "done" ? "on" : ""} ${locked ? "disabled" : ""}`}
        disabled={locked}
        aria-label={task.status === "done" ? "标为未完成" : "标为完成"}
        onClick={onToggle}
      />
      <span
        className="dot"
        style={
          area
            ? { background: area.color }
            : { background: "transparent", border: "1px dashed var(--muted)" }
        }
      />
      <span className="task-title">
        {task.title}
        {compact && goal ? <span className="task-goal">{goal.title}</span> : null}
      </span>
      <div className="task-meta">
        {!task.goal_id ? <span className="tag unlinked">未关联</span> : null}
        {!compact && task.carried_over_count > 0 ? (
          <span className="tag">已拖 {task.carried_over_count} 周</span>
        ) : null}
        {compact ? null : task.planned_date ? (
          <span className="muted small">
            {fmtMd(task.planned_date)} {weekdayLabel(task.planned_date)}
          </span>
        ) : (
          <span className="muted small">未定日期</span>
        )}
        {locked ? null : (
          <button
            type="button"
            className={`star ${task.is_focus ? "on" : ""}`}
            title="今日焦点"
            onClick={onFocus}
          >
            ★
          </button>
        )}
        {locked || !onMenu ? null : (
          <button type="button" className="btn sm ghost" onClick={onMenu}>
            ···
          </button>
        )}
      </div>
    </div>
  );
}
