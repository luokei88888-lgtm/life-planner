import type { CSSProperties } from "react";
import { LEVEL_COLOR, LEVEL_LABEL, type GoalLevel } from "../shared/constants";

export function levelToneStyle(level: GoalLevel): CSSProperties {
  return { ["--level-color"]: LEVEL_COLOR[level] } as CSSProperties;
}

export function LevelTag({ level }: { level: GoalLevel }) {
  return (
    <span className="tag level toned" style={levelToneStyle(level)}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

export function GoalProgress({
  level,
  value,
  className = "thin",
}: {
  level: GoalLevel;
  value: number;
  className?: string;
}) {
  return (
    <div className={`progress ${className} toned`} style={levelToneStyle(level)}>
      <div style={{ width: `${value}%` }} />
    </div>
  );
}
