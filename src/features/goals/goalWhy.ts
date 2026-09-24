import type { Goal } from "../../shared/types";

export function ancestorWhy(
  start: Goal | null | undefined,
  byId: Map<string, Goal>,
): { text: string; from: Goal } | null {
  let current = start ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const text = current.why.trim();
    if (text) return { text, from: current };
    current = current.parent_id ? byId.get(current.parent_id) ?? null : null;
  }
  return null;
}
