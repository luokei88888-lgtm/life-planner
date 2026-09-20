import { habitKindLabel, habitKindOf } from "../../shared/constants";
import type { SnapHabit } from "../../shared/types";

export function ReviewHabitRates({ habits }: { habits: SnapHabit[] }) {
  return (
    <>
      {habits.map((h, i) => (
        <div className="row mb-8" key={`${h.title}-${h.goal_title ?? ""}-${i}`}>
          <span style={{ minWidth: 148, flex: "0 1 240px" }}>
            {h.title}
            {h.kind ? (
              <span className={`tag kind-${habitKindOf(h.kind)}`}>{habitKindLabel(h.kind)}</span>
            ) : null}
            {h.goal_title ? <span className="muted small"> · {h.goal_title}</span> : null}
          </span>
          <div style={{ flex: 1 }}>
            <div className="progress thin">
              <div style={{ width: `${h.rate}%` }} />
            </div>
          </div>
          <span className="muted small" style={{ width: 40, textAlign: "right" }}>
            {h.rate}%
          </span>
        </div>
      ))}
    </>
  );
}
