import { useEffect, useRef, useState } from "react";
import { NOTE_BODY_MAX, NOTE_KIND_LABEL, NOTE_KINDS, type NoteKind } from "../../shared/constants";
import type { Note } from "../../shared/types";
import { isoDate } from "../../shared/time";
import { Modal } from "../../ui/Modal";
import { insertAtCaret } from "./insertAtCaret";
import { NoteEmojiPicker } from "./NoteEmojiPicker";

export type NoteFormState = {
  id?: string;
  date: string;
  kind: NoteKind;
  body: string;
  areaId: string;
  goalId: string;
};

export function emptyNoteForm(partial?: Partial<NoteFormState>): NoteFormState {
  return {
    date: isoDate(),
    kind: "insight",
    body: "",
    areaId: "",
    goalId: "",
    ...partial,
  };
}

export function noteToForm(note: Note): NoteFormState {
  return {
    id: note.id,
    date: note.date,
    kind: note.kind,
    body: note.body,
    areaId: note.area_id ?? "",
    goalId: note.goal_id ?? "",
  };
}

export function NoteFormModal({
  form,
  busy,
  onClose,
  onSave,
}: {
  form: NoteFormState;
  busy: boolean;
  onClose: () => void;
  onSave: (next: NoteFormState) => void;
}) {
  const [draft, setDraft] = useState(form);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: 0, end: 0 });
  useEffect(() => setDraft(form), [form]);
  const today = isoDate();
  const canSave = draft.body.trim().length > 0 && draft.date.length === 10;

  function rememberCaret() {
    const node = bodyRef.current;
    if (!node) return;
    caret.current = { start: node.selectionStart, end: node.selectionEnd };
  }

  function insertEmoji(emoji: string) {
    const next = insertAtCaret(draft.body, emoji, caret.current.start, caret.current.end, NOTE_BODY_MAX);
    caret.current = { start: next.caret, end: next.caret };
    setDraft({ ...draft, body: next.body });
    requestAnimationFrame(() => {
      const node = bodyRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(next.caret, next.caret);
    });
  }

  return (
    <Modal onClose={onClose}>
      <h3>{draft.id ? "编辑随记" : "写一条随记"}</h3>
      <div className="field">
        <label htmlFor="nf-date">日期</label>
        <input
          id="nf-date"
          type="date"
          max={today}
          value={draft.date}
          onChange={(e) => setDraft({ ...draft, date: e.target.value })}
        />
      </div>
      <div className="field">
        <span className="label-text">类型</span>
        <div className="row wrap">
          {NOTE_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`chip ${draft.kind === kind ? "on" : ""}`}
              onClick={() => setDraft({ ...draft, kind })}
            >
              {NOTE_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label htmlFor="nf-body">正文</label>
        <textarea
          id="nf-body"
          ref={bodyRef}
          className="note-input"
          maxLength={NOTE_BODY_MAX}
          value={draft.body}
          placeholder="写给自己看的话，不必工整。"
          onSelect={rememberCaret}
          onKeyUp={rememberCaret}
          onClick={rememberCaret}
          onBlur={rememberCaret}
          onChange={(e) => {
            caret.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
            setDraft({ ...draft, body: e.target.value });
          }}
        />
        <NoteEmojiPicker open={emojiOpen} onOpenChange={setEmojiOpen} onPick={insertEmoji} />
        <div className="hint">
          {draft.body.trim().length}/{NOTE_BODY_MAX}
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn" type="button" onClick={onClose}>
          取消
        </button>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !canSave}
          onClick={() => onSave(draft)}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
