import { NOTE_KIND_LABEL, type NoteKind } from "../../shared/constants";
import type { Note } from "../../shared/types";

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
        <span className={`tag kind-${note.kind}`}>{NOTE_KIND_LABEL[note.kind as NoteKind] ?? note.kind}</span>
        {note.area_name ? (
          <span
            className="tag"
            style={{
              borderColor: note.area_color ?? "var(--border)",
              color: note.area_color ?? "var(--muted)",
            }}
          >
            {note.area_name}
          </span>
        ) : null}
        {note.goal_title ? <span className="tag">{note.goal_title}</span> : null}
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
