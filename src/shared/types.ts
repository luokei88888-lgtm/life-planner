import type { GoalLevel as GoalLevelId, HabitKind, NoteKind, ThemeId } from "./constants";

export type Area = {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  score: number | null;
  scored_at: string | null;
  is_archived: boolean;
};

export type Settings = {
  theme: ThemeId;
  week_starts_on: number;
  auto_backup: boolean;
  keep_backups: number;
  last_backup_at: string | null;
  onboarded: boolean;
  reminder_enabled: boolean;
  reminder_time: string;
  sync_dir: string;
  last_sync_at: string | null;
  started_on: string | null;
};

export type Health = {
  ok: boolean;
  version: string;
};

export type GoalLevel = GoalLevelId;
export type GoalStatus = "active" | "done" | "paused" | "dropped";

export type Goal = {
  id: string;
  title: string;
  level: GoalLevel;
  parent_id: string | null;
  area_id: string;
  why: string;
  period_start: string;
  period_end: string;
  status: GoalStatus;
  progress: number;
  status_reason: string | null;
  done_at: string | null;
  created_at: string;
  updated_at: string;
  child_count: number;
  task_count: number;
  week_task_total: number;
  week_task_done: number;
};

export type GoalHistory = {
  id: string;
  goal_id: string;
  from_status: string;
  to_status: string;
  reason: string | null;
  changed_at: string;
};

export type GoalMutation = {
  goals: Goal[];
  warning: string | null;
  selected_id: string | null;
};

export type Note = {
  id: string;
  date: string;
  kind: NoteKind;
  body: string;
  area_id: string | null;
  goal_id: string | null;
  created_at: string;
  updated_at: string;
  area_name: string | null;
  area_color: string | null;
  goal_title: string | null;
};

export type NotePage = {
  notes: Note[];
  has_more: boolean;
  months: string[];
};

export type GoalTimelineItem = {
  sort_at: string;
  date: string;
  item_kind: "note" | "status";
  note: Note | null;
  from_status: string | null;
  to_status: string | null;
  reason: string | null;
};

export type Task = {
  id: string;
  title: string;
  goal_id: string | null;
  week_start: string;
  planned_date: string | null;
  is_focus: boolean;
  status: "todo" | "done";
  done_at: string | null;
  sort_order: number;
  carried_over_count: number;
};

export type WeekPlan = {
  week_start: string;
  locked: boolean;
  tasks: Task[];
  prev_unfinished: Task[];
};

export type HabitFrequency = "daily" | "weekly";
export type { HabitKind };

export type HabitRow = {
  id: string;
  title: string;
  kind: HabitKind;
  area_id: string;
  goal_id: string | null;
  frequency_type: HabitFrequency;
  frequency_target: number;
  is_active: boolean;
  created_at: string;
  done_today: boolean;
  week_dates: string[];
  week_count: number;
  streak_n: number;
  streak_unit: string;
};

export type HabitDay = {
  date: string;
  done: boolean;
};

export type HabitDetail = {
  id: string;
  title: string;
  kind: HabitKind;
  area_id: string;
  goal_id: string | null;
  frequency_type: HabitFrequency;
  frequency_target: number;
  is_active: boolean;
  created_at: string;
  streak_n: number;
  streak_unit: string;
  week_count: number;
  month: string;
  month_rate: number;
  prev_month: string;
  prev_month_rate: number;
  month_logs: string[];
  recent: HabitDay[];
  backfill_from: string;
};

export type CarriedTask = {
  title: string;
  carried: number;
};

export type SnapHabit = {
  title: string;
  rate: number;
  kind?: HabitKind;
  goal_title?: string | null;
};

export type SnapGoal = {
  title: string;
  status: string;
  progress: number;
  color: string;
};

export type WeekSnapshot = {
  task_total: number;
  task_done: number;
  unlinked: number;
  most_carried: CarriedTask | null;
  habits: SnapHabit[];
  goals: SnapGoal[];
};

export type WeekSat = {
  week_start: string;
  satisfaction: number;
};

export type SnapGoalTasks = {
  id: string;
  title: string;
  level: string;
  color: string;
  done: number;
  total: number;
};

export type SnapArea = {
  id: string;
  name: string;
  color: string;
  score: number;
};

export type MonthSnapshot = {
  satisfaction_avg: number;
  habit_rate: number;
  skipped: number;
  submitted_weeks: number;
  weeks: WeekSat[];
  habit_rates: SnapHabit[];
  goals_done: number;
  goals_total: number;
  area_scores?: SnapArea[];
  goal_tasks?: SnapGoalTasks[];
};

export type PendingReview = {
  kind: "weekly" | "monthly" | "yearly";
  key: string;
  draft: boolean;
};

export type HistoryReview = {
  kind: "weekly" | "monthly" | "yearly";
  key: string;
  status: string;
  submitted_at: string | null;
  satisfaction: number | null;
};

export type ReviewList = {
  pending: PendingReview[];
  history: HistoryReview[];
  this_week: string;
  this_month: string;
  this_year: string;
  weekday: number;
  this_week_status: "none" | "draft" | "submitted" | "skipped";
  this_month_status: "none" | "draft" | "submitted" | "skipped";
  this_year_status: "none" | "draft" | "submitted" | "skipped";
};

export type WeeklyReviewView = {
  week_start: string;
  status: "none" | "draft" | "submitted" | "skipped";
  q_went_well: string;
  q_not_well: string;
  q_reason: string;
  q_next_week: string;
  satisfaction: number;
  submitted_at: string | null;
  snapshot: WeekSnapshot;
  notes: Note[];
  next_tasks_created: boolean;
  unfinished: { id: string; title: string }[];
};

export type MonthGoal = {
  id: string;
  title: string;
  status: GoalStatus;
  progress: number;
  area_id: string;
  color: string;
};

export type MonthlyReviewView = {
  month: string;
  status: "none" | "draft" | "submitted";
  q_progress: string;
  q_insight: string;
  q_next_month: string;
  submitted_at: string | null;
  snapshot: MonthSnapshot;
  goals: MonthGoal[];
  notes: Note[];
};

export type OnboardingResult = {
  settings: Settings;
  warning: string | null;
};

export type MonthSat = {
  month: string;
  satisfaction: number;
};

export type YearSnapshot = {
  satisfaction_avg: number;
  habit_rate: number;
  skipped: number;
  submitted_months: number;
  months: MonthSat[];
  habit_rates: SnapHabit[];
  goals_done: number;
  goals_total: number;
  life_goals: SnapGoal[];
  area_scores?: SnapArea[];
  goal_tasks?: SnapGoalTasks[];
};

export type YearlyReviewView = {
  year: string;
  status: "none" | "draft" | "submitted";
  q_progress: string;
  q_insight: string;
  q_next_year: string;
  submitted_at: string | null;
  snapshot: YearSnapshot;
  goals: MonthGoal[];
  notes: Note[];
};

export type BackupResult = {
  file_name: string;
  last_backup_at: string;
  settings: Settings;
};

export type ReminderEvent = {
  due: boolean;
  title: string;
  body: string;
};

export type PathResult = {
  path: string | null;
  settings: Settings;
};
