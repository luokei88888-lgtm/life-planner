import { NOTE_KIND_LABEL, type NoteKind } from "../../shared/constants";
import type { Note } from "../../shared/types";

export function NoteCard({
  note,
  compact,
  excerpt,
  onEdit,
  onDelete,
  onQuote,
}: {
  note: Note;
  compact?: boolean;
  excerpt?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onQuote?: () => void;
}) {
  const body = excerpt && note.body.length > 80 ? `${note.body.slice(0, 80)}…` : note.body;
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
        {onQuote ? (
          <button className="btn sm ghost" type="button" onClick={onQuote}>
            引用
          </button>
        ) : null}
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
      <div className="note-body">{body}</div>
    </article>
  );
}
