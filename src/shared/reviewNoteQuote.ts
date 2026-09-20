import { REVIEW_ANSWER_MAX } from "./constants";
import { fmtMd } from "./time";
import type { Note } from "./types";

export function formatReviewNoteQuote(note: Pick<Note, "date" | "body">) {
  return `「${fmtMd(note.date)}」${note.body.trim()}`;
}

export function appendReviewQuote(current: string, quote: string, max = REVIEW_ANSWER_MAX) {
  const next = current.trim() ? `${current.trimEnd()}\n\n${quote}` : quote;
  if ([...next].length > max) return null;
  return next;
}

export function quoteReviewNoteInto(input: {
  activeField: string | null;
  note: Pick<Note, "date" | "body">;
  values: Record<string, string>;
}): { field: string; text: string } | { error: string } {
  if (!input.activeField || !(input.activeField in input.values)) {
    return { error: "先点一下要写的问题" };
  }
  const quote = formatReviewNoteQuote(input.note);
  const text = appendReviewQuote(input.values[input.activeField] ?? "", quote);
  if (text == null) {
    return { error: "这条随记太长，当前问题写不下" };
  }
  return { field: input.activeField, text };
}
