export function insertAtCaret(
  body: string,
  insert: string,
  start: number,
  end: number,
  max: number,
): { body: string; caret: number } {
  const from = Math.max(0, Math.min(start, body.length));
  const to = Math.max(from, Math.min(end, body.length));
  const next = body.slice(0, from) + insert + body.slice(to);
  if (next.length > max) return { body, caret: to };
  return { body: next, caret: from + insert.length };
}
