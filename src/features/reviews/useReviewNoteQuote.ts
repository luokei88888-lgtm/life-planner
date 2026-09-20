import { useState } from "react";
import type { Note } from "../../shared/types";
import { quoteReviewNoteInto } from "../../shared/reviewNoteQuote";

export function useReviewNoteQuote(
  values: Record<string, string>,
  setField: (key: string, value: string) => void,
  notify: (message: string) => void,
) {
  const [activeField, setActiveField] = useState<string | null>(null);

  function onQuote(note: Note) {
    const result = quoteReviewNoteInto({ activeField, note, values });
    if ("error" in result) {
      notify(result.error);
      return;
    }
    setField(result.field, result.text);
  }

  function focusProps(id: string) {
    return { onFocus: () => setActiveField(id) };
  }

  return { onQuote, focusProps };
}
