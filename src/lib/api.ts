import { invoke } from "@tauri-apps/api/core";
import { ErrorCode } from "../shared/constants";
import type {
  Area,
  Goal,
  GoalHistory,
  GoalMutation,
  HabitDetail,
  HabitRow,
  Health,
  MonthlyReviewView,
  YearlyReviewView,
  OnboardingResult,
  BackupResult,
  PathResult,
  ReminderEvent,
  ReviewList,
  Settings,
  Task,
  WeekPlan,
  WeeklyReviewView,
  Note,
  NotePage,
  GoalTimelineItem,
} from "../shared/types";

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

type RustError = { code?: string; message?: string };

async function cmd<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(name, args);
  } catch (raw) {
    const err = raw as RustError | string;
    if (typeof err === "string") {
      throw new ApiError(ErrorCode.UNKNOWN, err);
    }
    throw new ApiError(err.code ?? ErrorCode.UNKNOWN, err.message ?? "未知错误");
  }
}

export const api = {
  health: () => cmd<Health>("health"),
  getSettings: () => cmd<Settings>("get_settings"),
  setTheme: (theme: Settings["theme"]) => cmd<Settings>("set_theme", { theme }),
  setWeekStartsOn: (weekStartsOn: number) =>
    cmd<Settings>("set_week_starts_on", { weekStartsOn }),
  setAutoBackup: (enabled: boolean) => cmd<Settings>("set_auto_backup", { enabled }),
  setKeepBackups: (keepBackups: number) =>
    cmd<Settings>("set_keep_backups", { keepBackups }),
  setReminderEnabled: (enabled: boolean) =>
    cmd<Settings>("set_reminder_enabled", { enabled }),
  setReminderTime: (reminderTime: string) =>
    cmd<Settings>("set_reminder_time", { reminderTime }),
  setSyncDir: (syncDir: string) => cmd<Settings>("set_sync_dir", { syncDir }),
  markStarted: () => cmd<Settings>("mark_started"),
  pickSyncDir: () => cmd<PathResult>("pick_sync_dir"),
  syncNow: () => cmd<Settings>("sync_now"),
  exportIcs: () => cmd<PathResult>("export_ics"),
  fireDueReminders: () => cmd<ReminderEvent>("fire_due_reminders"),
  backupNow: () => cmd<BackupResult>("backup_now"),
  exportJson: () => cmd<string>("export_json"),
  importJson: (payload: string) => cmd<BackupResult>("import_json", { payload }),
  factoryReset: () => cmd<BackupResult>("factory_reset"),
  listAreas: () => cmd<Area[]>("list_areas"),
  listArchivedAreas: () => cmd<Area[]>("list_archived_areas"),
  createArea: (name: string, color: string) => cmd<Area[]>("create_area", { name, color }),
  updateArea: (id: string, name: string, color: string) =>
    cmd<Area[]>("update_area", { id, name, color }),
  archiveArea: (id: string) => cmd<Area[]>("archive_area", { id }),
  restoreArea: (id: string) => cmd<Area[]>("restore_area", { id }),
  scoreAreas: (scores: { id: string; score: number }[]) => cmd<Area[]>("score_areas", { scores }),
  listGoals: () => cmd<Goal[]>("list_goals"),
  listGoalHistory: (id: string) => cmd<GoalHistory[]>("list_goal_history", { id }),
  createGoal: (input: {
    title: string;
    why: string;
    areaId: string;
    level: Goal["level"];
    parentId?: string | null;
    year: number;
  }) =>
    cmd<GoalMutation>("create_goal", {
      title: input.title,
      why: input.why,
      areaId: input.areaId,
      level: input.level,
      parentId: input.parentId ?? null,
      year: input.year,
    }),
  updateGoal: (id: string, title: string, why: string, areaId: string) =>
    cmd<GoalMutation>("update_goal", { id, title, why, areaId }),
  setGoalProgress: (id: string, progress: number) =>
    cmd<GoalMutation>("set_goal_progress", { id, progress }),
  setGoalStatus: (id: string, to: Goal["status"], reason?: string, cascade = false) =>
    cmd<GoalMutation>("set_goal_status", { id, to, reason: reason ?? null, cascade }),
  deleteGoal: (id: string) => cmd<GoalMutation>("delete_goal", { id }),
  listWeekPlan: (weekStart: string) => cmd<WeekPlan>("list_week_plan", { weekStart }),
  listGoalTasks: (goalId: string) => cmd<Task[]>("list_goal_tasks", { goalId }),
  createTask: (input: {
    title: string;
    weekStart: string;
    goalId?: string | null;
    plannedDate?: string | null;
  }) =>
    cmd<WeekPlan>("create_task", {
      title: input.title,
      weekStart: input.weekStart,
      goalId: input.goalId ?? null,
      plannedDate: input.plannedDate ?? null,
    }),
  updateTask: (id: string, title: string, goalId: string | null, plannedDate: string | null) =>
    cmd<WeekPlan>("update_task", {
      id,
      title,
      goalId,
      plannedDate,
    }),
  toggleTask: (id: string) => cmd<WeekPlan>("toggle_task", { id }),
  toggleFocus: (id: string) => cmd<WeekPlan>("toggle_focus", { id }),
  deleteTask: (id: string) => cmd<WeekPlan>("delete_task", { id }),
  carryTask: (id: string) => cmd<WeekPlan>("carry_task", { id }),
  carryUnfinished: (fromWeek: string) => cmd<WeekPlan>("carry_unfinished", { fromWeek }),
  listHabits: () => cmd<HabitRow[]>("list_habits"),
  getHabit: (id: string) => cmd<HabitDetail>("get_habit", { id }),
  createHabit: (input: {
    title: string;
    areaId: string;
    frequencyType: HabitRow["frequency_type"];
    frequencyTarget: number;
    goalId?: string | null;
    kind: HabitRow["kind"];
  }) =>
    cmd<HabitRow[]>("create_habit", {
      title: input.title,
      areaId: input.areaId,
      frequencyType: input.frequencyType,
      frequencyTarget: input.frequencyTarget,
      goalId: input.goalId ?? null,
      kind: input.kind,
    }),
  updateHabit: (input: {
    id: string;
    title: string;
    areaId: string;
    frequencyType: HabitRow["frequency_type"];
    frequencyTarget: number;
    goalId?: string | null;
    kind: HabitRow["kind"];
  }) =>
    cmd<HabitDetail>("update_habit", {
      id: input.id,
      title: input.title,
      areaId: input.areaId,
      frequencyType: input.frequencyType,
      frequencyTarget: input.frequencyTarget,
      goalId: input.goalId ?? null,
      kind: input.kind,
    }),
  setHabitActive: (id: string, active: boolean) =>
    cmd<HabitDetail>("set_habit_active", { id, active }),
  deleteHabit: (id: string) => cmd<void>("delete_habit", { id }),
  toggleHabitLog: (id: string, date: string) => cmd<HabitDetail>("toggle_habit_log", { id, date }),
  listReviews: () => cmd<ReviewList>("list_reviews"),
  getWeeklyReview: (weekStart: string) =>
    cmd<WeeklyReviewView>("get_weekly_review", { weekStart }),
  saveWeeklyDraft: (input: {
    weekStart: string;
    wentWell: string;
    notWell: string;
    reason: string;
    nextWeek: string;
    satisfaction: number;
  }) =>
    cmd<WeeklyReviewView>("save_weekly_draft", {
      weekStart: input.weekStart,
      qWentWell: input.wentWell,
      qNotWell: input.notWell,
      qReason: input.reason,
      qNextWeek: input.nextWeek,
      satisfaction: input.satisfaction,
    }),
  submitWeeklyReview: (input: {
    weekStart: string;
    wentWell: string;
    notWell: string;
    reason: string;
    nextWeek: string;
    satisfaction: number;
  }) =>
    cmd<WeeklyReviewView>("submit_weekly_review", {
      weekStart: input.weekStart,
      qWentWell: input.wentWell,
      qNotWell: input.notWell,
      qReason: input.reason,
      qNextWeek: input.nextWeek,
      satisfaction: input.satisfaction,
    }),
  skipWeeklyReview: (weekStart: string) =>
    cmd<WeeklyReviewView>("skip_weekly_review", { weekStart }),
  applyWeeklyNextWeekTasks: (weekStart: string, titles: string[], carryUnfinished = false) =>
    cmd<WeeklyReviewView>("apply_weekly_next_week_tasks", {
      weekStart,
      titles,
      carryUnfinished,
    }),
  getMonthlyReview: (month: string) => cmd<MonthlyReviewView>("get_monthly_review", { month }),
  saveMonthlyDraft: (input: {
    month: string;
    progress: string;
    insight: string;
    nextMonth: string;
  }) =>
    cmd<MonthlyReviewView>("save_monthly_draft", {
      month: input.month,
      qProgress: input.progress,
      qInsight: input.insight,
      qNextMonth: input.nextMonth,
    }),
    submitMonthlyReview: (input: {
    month: string;
    progress: string;
    insight: string;
    nextMonth: string;
    scores?: { id: string; score: number }[];
  }) =>
    cmd<MonthlyReviewView>("submit_monthly_review", {
      month: input.month,
      qProgress: input.progress,
      qInsight: input.insight,
      qNextMonth: input.nextMonth,
      scores: input.scores ?? null,
    }),
  getYearlyReview: (year: string) => cmd<YearlyReviewView>("get_yearly_review", { year }),
  saveYearlyDraft: (input: {
    year: string;
    progress: string;
    insight: string;
    nextYear: string;
  }) =>
    cmd<YearlyReviewView>("save_yearly_draft", {
      year: input.year,
      qProgress: input.progress,
      qInsight: input.insight,
      qNextYear: input.nextYear,
    }),
  submitYearlyReview: (input: {
    year: string;
    progress: string;
    insight: string;
    nextYear: string;
    scores?: { id: string; score: number }[];
  }) =>
    cmd<YearlyReviewView>("submit_yearly_review", {
      year: input.year,
      qProgress: input.progress,
      qInsight: input.insight,
      qNextYear: input.nextYear,
      scores: input.scores ?? null,
    }),
  completeOnboarding: (payload: {
    scores: { id: string; score: number }[];
    title?: string | null;
    why?: string | null;
    areaId?: string | null;
    quarterTitle?: string | null;
    monthTitle?: string | null;
    weekTitle?: string | null;
    taskTitle?: string | null;
    habitTitle?: string | null;
    habitFrequency?: "daily" | "weekly" | null;
    habitAreaId?: string | null;
    habitKind?: HabitRow["kind"] | null;
  }) =>
    cmd<OnboardingResult>("complete_onboarding", {
      payload: {
        scores: payload.scores,
        title: payload.title ?? null,
        why: payload.why ?? null,
        area_id: payload.areaId ?? null,
        quarter_title: payload.quarterTitle ?? null,
        month_title: payload.monthTitle ?? null,
        week_title: payload.weekTitle ?? null,
        task_title: payload.taskTitle ?? null,
        habit_title: payload.habitTitle ?? null,
        habit_frequency: payload.habitFrequency ?? null,
        habit_area_id: payload.habitAreaId ?? null,
        habit_kind: payload.habitKind ?? null,
      },
    }),
  listNotes: (input?: {
    month?: string | null;
    kind?: string | null;
    areaId?: string | null;
    goalId?: string | null;
    q?: string | null;
    beforeDate?: string | null;
    beforeCreatedAt?: string | null;
    beforeId?: string | null;
  }) =>
    cmd<NotePage>("list_notes", {
      month: input?.month ?? null,
      kind: input?.kind ?? null,
      areaId: input?.areaId ?? null,
      goalId: input?.goalId ?? null,
      q: input?.q ?? null,
      beforeDate: input?.beforeDate ?? null,
      beforeCreatedAt: input?.beforeCreatedAt ?? null,
      beforeId: input?.beforeId ?? null,
    }),
  listGoalTimeline: (goalId: string) => cmd<GoalTimelineItem[]>("list_goal_timeline", { goalId }),
  createNote: (input: {
    date: string;
    kind: string;
    body: string;
    areaId?: string | null;
    goalId?: string | null;
  }) =>
    cmd<Note>("create_note", {
      date: input.date,
      kind: input.kind,
      body: input.body,
      areaId: input.areaId ?? null,
      goalId: input.goalId ?? null,
    }),
  updateNote: (input: {
    id: string;
    date: string;
    kind: string;
    body: string;
    areaId?: string | null;
    goalId?: string | null;
  }) =>
    cmd<Note>("update_note", {
      id: input.id,
      date: input.date,
      kind: input.kind,
      body: input.body,
      areaId: input.areaId ?? null,
      goalId: input.goalId ?? null,
    }),
  deleteNote: (id: string) => cmd<void>("delete_note", { id }),
};
