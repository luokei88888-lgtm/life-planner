import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "../../lib/api";
import { NOTE_KIND_LABEL, NOTE_KINDS, type NoteKind } from "../../shared/constants";
import { fmtMonth, fmtNoteDay } from "../../shared/time";
import type { Goal, Note } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { NoteCard } from "./NoteCard";
import { emptyNoteForm, NoteFormModal, noteToForm, type NoteFormState } from "./NoteFormModal";

export function NotesPage() {
  const { areas, notify } = useApp();
  const [notes, setNotes] = useState<Note[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [month, setMonth] = useState("");
  const [kind, setKind] = useState("");
  const [areaId, setAreaId] = useState("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<NoteFormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const loadingMore = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(qInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  const load = useCallback(
    async (append: boolean, cursor?: Note) => {
      const page = await api.listNotes({
        month: month || null,
        kind: kind || null,
        areaId: areaId || null,
        q: q || null,
        beforeDate: append && cursor ? cursor.date : null,
        beforeCreatedAt: append && cursor ? cursor.created_at : null,
        beforeId: append && cursor ? cursor.id : null,
      });
      setMonths(page.months);
      setHasMore(page.has_more);
      setNotes((prev) => (append ? [...prev, ...page.notes] : page.notes));
    },
    [month, kind, areaId, q],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listGoals();
        if (!cancelled) setGoals(list);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载目标");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const page = await api.listNotes({
          month: month || null,
          kind: kind || null,
          areaId: areaId || null,
          q: q || null,
        });
        if (cancelled) return;
        setNotes(page.notes);
        setMonths(page.months);
        setHasMore(page.has_more);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载随记");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, kind, areaId, q, notify]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || month) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || loadingMore.current) return;
      const last = notes[notes.length - 1];
      if (!last) return;
      loadingMore.current = true;
      void load(true, last)
        .catch((e) => notify(e instanceof ApiError ? e.message : "无法加载更多"))
        .finally(() => {
          loadingMore.current = false;
        });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, month, notes, load, notify]);

  async function save(next: NoteFormState) {
    setBusy(true);
    try {
      const payload = {
        date: next.date,
        kind: next.kind,
        body: next.body,
        areaId: next.areaId || null,
        goalId: next.goalId || null,
      };
      if (next.id) {
        await api.updateNote({ id: next.id, ...payload });
        notify("已保存");
      } else {
        await api.createNote(payload);
        notify("已记下");
      }
      setForm(null);
      await load(false);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove(note: Note) {
    setBusy(true);
    try {
      await api.deleteNote(note.id);
      setPendingDelete(null);
      await load(false);
      notify("已删除");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  const grouped = groupByDate(notes);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">随记</h1>
          <p className="page-sub">树洞、感悟和日记都写在这里。按时间往回翻即可。</p>
        </div>
        <div className="head-actions">
          <button className="btn primary" type="button" onClick={() => setForm(emptyNoteForm())}>
            写一条
          </button>
        </div>
      </div>

      <section className="card mb-16">
        <div className="row wrap" style={{ gap: 10 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ width: 120 }}>
            <option value="">全部类型</option>
            {NOTE_KINDS.map((k) => (
              <option key={k} value={k}>
                {NOTE_KIND_LABEL[k as NoteKind]}
              </option>
            ))}
          </select>
          <select value={areaId} onChange={(e) => setAreaId(e.target.value)} style={{ width: 140 }}>
            <option value="">全部维度</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="搜索正文"
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
        </div>
        <div className="month-jumper mt-16">
          <button
            type="button"
            className={`chip ${month === "" ? "on" : ""}`}
            onClick={() => setMonth("")}
          >
            全部
          </button>
          {months.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip ${month === m ? "on" : ""}`}
              onClick={() => setMonth(m)}
            >
              {fmtMonth(m)}
            </button>
          ))}
        </div>
      </section>

      {notes.length ? (
        <div className="timeline">
          {grouped.map(([date, items]) => (
            <section className="tl-day" key={date}>
              <div className="tl-date">{fmtNoteDay(date)}</div>
              <div className="stack">
                {items.map((note) => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    onEdit={() => setForm(noteToForm(note))}
                    onDelete={() => setPendingDelete(note)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <section className="card">
          <div className="empty">
            这里是你的树洞。写给自己看的话，不会出现在首页，也不会被当成打卡。
          </div>
        </section>
      )}
      {hasMore && !month ? <div ref={sentinel} className="tl-sentinel" /> : null}

      {form ? (
        <NoteFormModal
          form={form}
          areas={areas}
          goals={goals}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={(next) => void save(next)}
        />
      ) : null}
      {pendingDelete ? (
        <Modal onClose={() => setPendingDelete(null)}>
          <h3>删除这条随记？</h3>
          <p className="muted">{pendingDelete.body.slice(0, 80)}</p>
          <div className="modal-foot">
            <button className="btn" type="button" onClick={() => setPendingDelete(null)}>
              取消
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={busy}
              onClick={() => void remove(pendingDelete)}
            >
              删除
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function groupByDate(notes: Note[]): [string, Note[]][] {
  const map = new Map<string, Note[]>();
  for (const note of notes) {
    const list = map.get(note.date) ?? [];
    list.push(note);
    map.set(note.date, list);
  }
  return Array.from(map.entries());
}
