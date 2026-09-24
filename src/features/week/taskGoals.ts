import { LEVEL_LABEL, WEEK_ADVANCING_MAX } from "../../shared/constants";
import type { Area, Goal } from "../../shared/types";
import type { SelectOption } from "../../ui/Select";

export function isTaskWeekGoal(goal: Goal, weekStart: string) {
  return goal.level === "week" && goal.period_start === weekStart && goal.status !== "dropped";
}

export function isTaskAncestorGoal(goal: Goal, weekStart: string) {
  if (goal.status !== "active") return false;
  if (goal.level !== "month" && goal.level !== "quarter" && goal.level !== "year") return false;
  return goal.period_start <= weekStart && weekStart <= goal.period_end;
}

function goalById(goals: Goal[]) {
  return new Map(goals.map((g) => [g.id, g]));
}

function parentIds(goal: Goal, byId: Map<string, Goal>) {
  const ids: string[] = [];
  const seen = new Set<string>([goal.id]);
  let parentId = goal.parent_id;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    ids.push(parentId);
    parentId = byId.get(parentId)?.parent_id ?? null;
  }
  return ids;
}

function closestInTree(candidates: Goal[], byId: Map<string, Goal>) {
  return candidates.filter(
    (goal) =>
      !candidates.some(
        (other) => other.id !== goal.id && parentIds(other, byId).includes(goal.id),
      ),
  );
}

export function advancingGoals(goals: Goal[], weekStart: string, cap = WEEK_ADVANCING_MAX) {
  const byId = goalById(goals);
  const week = goals.filter((g) => isTaskWeekGoal(g, weekStart));
  const covered = new Set(week.flatMap((g) => parentIds(g, byId)));
  const ancestors = goals.filter((g) => isTaskAncestorGoal(g, weekStart) && !covered.has(g.id));
  const withTasks = ancestors.filter((g) => g.week_task_total > 0);
  const extra = closestInTree(withTasks.length > 0 ? withTasks : week.length > 0 ? [] : ancestors, byId);
  const out: Goal[] = [];
  const seen = new Set<string>();

  function add(goal: Goal) {
    if (seen.has(goal.id) || out.length >= cap) return;
    seen.add(goal.id);
    out.push(goal);
  }

  week.forEach(add);
  extra.forEach(add);
  return out;
}

export function taskGoalSelectOptions(
  goals: Goal[],
  weekStart: string,
  areas: Pick<Area, "id" | "color">[],
  currentId = "",
): SelectOption[] {
  const week = goals.filter((g) => isTaskWeekGoal(g, weekStart) && g.status === "active");
  const up = goals.filter((g) => isTaskAncestorGoal(g, weekStart));
  const chosen = new Set([...week, ...up].map((g) => g.id));
  const extra =
    currentId && !chosen.has(currentId) ? goals.find((g) => g.id === currentId) : undefined;

  const toOption = (goal: Goal, group: string): SelectOption => ({
    value: goal.id,
    label:
      goal.level === "week"
        ? goal.title
        : `${LEVEL_LABEL[goal.level]} · ${goal.title}`,
    swatch: areas.find((a) => a.id === goal.area_id)?.color,
    group,
  });

  const options: SelectOption[] = [{ value: "", label: "不关联目标" }];
  options.push(...week.map((g) => toOption(g, "本周目标")));
  options.push(...up.map((g) => toOption(g, "覆盖本周的上级目标")));
  if (extra) options.push(toOption(extra, "当前关联"));
  return options;
}
