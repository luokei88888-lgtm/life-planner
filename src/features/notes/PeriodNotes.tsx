import { Link } from "react-router-dom";
import { REVIEW_NOTES_ASIDE_MAX } from "../../shared/constants";
import type { Note } from "../../shared/types";
import { NoteCard } from "./NoteCard";

export function PeriodNotes({
  notes,
  quoteable = false,
  onQuote,
}: {
  notes: Note[];
  quoteable?: boolean;
  onQuote?: (note: Note) => void;
}) {
  if (quoteable && notes.length === 0) return null;
  const visible = quoteable ? notes.slice(0, REVIEW_NOTES_ASIDE_MAX) : notes;
  const hidden = quoteable ? Math.max(0, notes.length - visible.length) : 0;

  return (
    <section className={`card${quoteable ? " review-notes-aside" : " mt-16"}`}>
      <div className="strong mb-8">
        {quoteable ? "引用随记" : "这段时间的随记"}
        {notes.length ? `（${notes.length}）` : ""}
      </div>
      {quoteable ? (
        <p className="hint mb-8">点输入框后再引用。引用是原文，不是替你答题。</p>
      ) : null}
      {notes.length ? (
        <div className="stack">
          {visible.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              compact
              excerpt={quoteable}
              onQuote={quoteable ? () => onQuote?.(note) : undefined}
            />
          ))}
        </div>
      ) : (
        <div className="empty">这段时间没有随记。它们不会写进复盘快照，随时补上这里都会出现。</div>
      )}
      {hidden ? (
        <Link className="add-line" to="/notes">
          其余 {hidden} 条在随记
        </Link>
      ) : null}
    </section>
  );
}
