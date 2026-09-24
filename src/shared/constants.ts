import catalog from "../../contracts/catalog.json";

export const ErrorCode = Object.fromEntries(
  catalog.errorCodes.map((code) => [code, code]),
) as { [K in (typeof catalog.errorCodes)[number]]: K };

export type ErrorCode = (typeof catalog.errorCodes)[number];

export const THEMES: { id: (typeof catalog.themes)[number]; name: string; desc: string }[] = [
  { id: "dark", name: "墨夜 · 星钟", desc: "深色墨底、黄铜点缀、衬线刻字。" },
  { id: "ink", name: "宣纸 · 朱砂", desc: "宣纸底、朱砂一点、宋体直角。" },
  { id: "moss", name: "苔径 · 松烟", desc: "墨绿底、青苔与松烟。" },
  { id: "dusk", name: "暮色 · 绛霞", desc: "暮紫底、暖绛点缀。" },
  { id: "snow", name: "素雪 · 青瓷", desc: "冷白底、青瓷色描边。" },
];

export type ThemeId = (typeof THEMES)[number]["id"];

export const ThemeId = {
  Dark: "dark",
  Ink: "ink",
  Moss: "moss",
  Dusk: "dusk",
  Snow: "snow",
} as const satisfies Record<string, ThemeId>;

export const AREA_PALETTE = catalog.areaPalette;
export const AREA_NAME_MAX = catalog.areaNameMax;
export const AREA_COUNT_MAX = catalog.areaCountMax;
export const AREA_SCORE_MIN = catalog.areaScoreMin;
export const AREA_SCORE_MAX = catalog.areaScoreMax;
export const AREA_SCORE_DEFAULT = Math.ceil((AREA_SCORE_MIN + AREA_SCORE_MAX) / 2);

export function areaScorePercent(score: number) {
  return `${(Math.max(0, score) / AREA_SCORE_MAX) * 100}%`;
}
export const GOAL_TITLE_MAX = catalog.goalTitleMax;
export const GOAL_WHY_MAX = catalog.goalWhyMax;
export const ACTIVE_LIMITS = catalog.activeLimits;
export const TASK_TITLE_MAX = catalog.taskTitleMax;
export const HOME_TODAY_LIST_MAX = catalog.homeTodayListMax;
export const HABIT_TITLE_MAX = catalog.habitTitleMax;
export const HABIT_BACKFILL_DAYS = catalog.habitBackfillDays;
export const HABIT_KINDS = catalog.habitKinds;
export type HabitKind = (typeof HABIT_KINDS)[number];
export const HabitKind = {
  Form: "form",
  Break: "break",
} as const satisfies Record<string, HabitKind>;
export const HABIT_KIND_LABEL: Record<HabitKind, string> = {
  form: "养成",
  break: "戒除",
};
export const HABIT_KIND_HINT: Record<HabitKind, string> = {
  form: "勾选表示今天做到了。空白只是还没记，不是失败。",
  break: "勾选表示今天忍住了、没有做这件事。空白只是还没记，不是破功。",
};

export function habitKindOf(value: string | null | undefined): HabitKind {
  return value === HabitKind.Break ? HabitKind.Break : HabitKind.Form;
}

export function habitKindLabel(value: string | null | undefined): string {
  return HABIT_KIND_LABEL[habitKindOf(value)];
}

export function habitCheckLabel(kind: HabitKind, done: boolean) {
  if (kind === HabitKind.Break) {
    return done ? "取消今日守住" : "今日守住";
  }
  return done ? "取消今日打卡" : "今日打卡";
}

export function habitToggleError(kind: HabitKind) {
  return kind === HabitKind.Break ? "记录守住失败" : "打卡失败";
}

export function habitHeatTitle(kind: HabitKind) {
  return kind === HabitKind.Break ? "守住热力图" : "打卡热力图";
}

export function habitHeatLegend(kind: HabitKind) {
  return kind === HabitKind.Break
    ? "点亮 = 这一天守住了。空白 = 还没标记，不是自动记成破功。"
    : "点亮 = 这一天做到了。空白 = 还没标记。";
}

export const REVIEW_ANSWER_MAX = catalog.reviewAnswerMax;
export const REVIEW_NEXT_TASK_MAX = catalog.reviewNextTaskMax;
export const WEEK_ADVANCING_MAX = ACTIVE_LIMITS.week;
export const NOTE_BODY_MAX = catalog.noteBodyMax;
export const NOTE_PAGE_SIZE = catalog.notePageSize;
export const KEEP_BACKUP_COUNTS = catalog.keepBackupCounts;
export const IMPORT_JSON_MAX = catalog.importJsonMaxBytes;

export const GOAL_LEVELS = ["life", "year", "quarter", "month", "week"] as const;
export type GoalLevel = (typeof GOAL_LEVELS)[number];

export const LEVEL_LABEL: Record<GoalLevel, string> = {
  life: "人生",
  year: "年度",
  quarter: "季度",
  month: "月度",
  week: "周",
};

/** Time-level tones for tags and progress (scheme 2). Area bars stay on area color. */
export const LEVEL_COLOR: Record<GoalLevel, string> = {
  life: "#9b6dd4",
  year: "#e8c547",
  quarter: "#3d8bff",
  month: "#ff5a3c",
  week: "#8e99ad",
};

export function goalWhyRequired(_level: GoalLevel, hasParent: boolean) {
  return !hasParent;
}

export const GOAL_STATUSES = ["active", "done", "paused", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const NOTE_KINDS = catalog.noteKinds;
export type NoteKind = (typeof NOTE_KINDS)[number];

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  insight: "感悟",
  diary: "日记",
  vent: "吐槽",
};

/** Card tag tones (scheme B): gold / blue / gray with a light wash. */
export const NOTE_KIND_COLOR: Record<NoteKind, string> = {
  insight: "#d2b36e",
  diary: "#3d8bff",
  vent: "#8d97a8",
};

export const STATUS_LABEL: Record<GoalStatus, string> = {
  active: "进行中",
  done: "已完成",
  paused: "搁置",
  dropped: "放弃",
};

export const NAV = [
  { to: "/", label: "首页" },
  { to: "/areas", label: "维度" },
  { to: "/goals", label: "目标" },
  { to: "/week", label: "任务" },
  { to: "/habits", label: "习惯" },
  { to: "/notes", label: "随记" },
  { to: "/reviews", label: "复盘" },
] as const;

export function childLevel(level: GoalLevel): GoalLevel | null {
  const i = GOAL_LEVELS.indexOf(level);
  return i >= 0 && i < GOAL_LEVELS.length - 1 ? GOAL_LEVELS[i + 1] : null;
}

export function childLevelsOf(parent: GoalLevel): GoalLevel[] {
  switch (parent) {
    case "life":
      return ["year"];
    case "year":
      return ["quarter", "month", "week"];
    case "quarter":
      return ["month", "week"];
    case "month":
      return ["week"];
    default:
      return [];
  }
}

export function parentRequired(_level: GoalLevel): boolean {
  return false;
}

export function habitFreqLabel(type: "daily" | "weekly", target: number) {
  return type === "daily" ? "每天" : `每周 ${target} 次`;
}
