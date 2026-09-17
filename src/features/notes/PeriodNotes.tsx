import type { Note } from "../../shared/types";
import { NoteCard } from "./NoteCard";

export function PeriodNotes({ notes }: { notes: Note[] }) {
  return (
    <section className="card mt-16">
      <div className="strong mb-8">这段时间的随记{notes.length ? `（${notes.length}）` : ""}</div>
      {notes.length ? (
        <div className="stack">
          {notes.map((note) => (
            <NoteCard key={note.id} note={note} compact />
          ))}
        </div>
      ) : (
        <div className="empty">这段时间没有随记。它们不会写进复盘快照，随时补上这里都会出现。</div>
      )}
    </section>
  );
}
