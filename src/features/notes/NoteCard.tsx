import type { Note } from "../../shared/types";
import { NoteKindTag } from "./NoteKindTag";

export function NoteCard({
  note,
  compact,
  onEdit,
  onDelete,
}: {
  note: Note;
  compact?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className={`note-card ${compact ? "compact" : ""}`}>
      <div className="row wrap mb-8">
        <NoteKindTag kind={note.kind} />
        <span style={{ flex: 1 }} />
        {onEdit ? (
          <button className="btn sm ghost" type="button" onClick={onEdit}>
            编辑
          </button>
        ) : null}
        {onDelete ? (
          <button className="btn sm danger" type="button" onClick={onDelete}>
            删除
          </button>
        ) : null}
      </div>
      <div className="note-body">{note.body}</div>
    </article>
  );
}
