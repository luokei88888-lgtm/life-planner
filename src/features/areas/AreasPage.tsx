import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { AREA_COUNT_MAX, AREA_NAME_MAX, AREA_PALETTE } from "../../shared/constants";
import type { Area } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";
import { RadarChart } from "./RadarChart";

type FormState = { id?: string; name: string; color: string };

export function AreasPage() {
  const { areas, replaceAreas, notify, reload } = useApp();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [archived, setArchived] = useState<Area[]>([]);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [draftScores, setDraftScores] = useState<Record<string, number>>({});
  const [hoverId, setHoverId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api.listArchivedAreas();
        if (!cancelled) setArchived(next);
      } catch {
        if (!cancelled) setArchived([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const lastScored = useMemo(() => {
    const times = areas.map((a) => a.scored_at).filter((v): v is string => Boolean(v));
    if (times.length === 0) return "尚未打分";
    return times.sort().slice(-1)[0]?.slice(0, 10) ?? "尚未打分";
  }, [areas]);

  async function run(fn: () => Promise<Area[]>, ok: string) {
    setBusy(true);
    try {
      replaceAreas(await fn());
      try {
        setArchived(await api.listArchivedAreas());
      } catch {
        /* ignore */
      }
      notify(ok);
      setScoreOpen(false);
      setForm(null);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  function openScore() {
    const next: Record<string, number> = {};
    for (const a of areas) next[a.id] = a.score ?? 5;
    setDraftScores(next);
    setScoreOpen(true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">维度与人生之轮</h1>
          <p className="page-sub">给每个维度的现状满意度打分（1-10），看清哪里失衡。最近打分：{lastScored}</p>
        </div>
        <div className="head-actions">
          <button
            className="btn"
            disabled={busy || areas.length >= AREA_COUNT_MAX}
            onClick={() => setForm({ name: "", color: AREA_PALETTE[0] })}
          >
            新建维度
          </button>
          <button className="btn primary" disabled={busy || areas.length === 0} onClick={openScore}>
            重新打分
          </button>
        </div>
      </div>

      <div className="row mb-16">
        <button type="button" className={`chip ${tab === "active" ? "on" : ""}`} onClick={() => setTab("active")}>
          进行中
        </button>
        <button type="button" className={`chip ${tab === "archived" ? "on" : ""}`} onClick={() => setTab("archived")}>
          已归档{archived.length ? ` (${archived.length})` : ""}
        </button>
      </div>

      {tab === "archived" ? (
        <section className="card">
          {archived.length ? (
            archived.map((a) => (
              <div className="area-card" key={a.id}>
                <span className="bar" style={{ background: a.color }} />
                <div style={{ flex: 1 }}>
                  <div className="row between">
                    <span className="strong">{a.name}</span>
                    <span className="score">
                      {a.score ?? "—"}
                      <span className="score-scale">/10</span>
                    </span>
                  </div>
                  <div className="row mt-8">
                    <button
                      className="btn sm primary"
                      disabled={busy}
                      onClick={() => {
                        void (async () => {
                          setBusy(true);
                          try {
                            setArchived(await api.restoreArea(a.id));
                            await reload();
                            notify("维度已恢复");
                          } catch (e) {
                            notify(e instanceof ApiError ? e.message : "恢复失败");
                          } finally {
                            setBusy(false);
                          }
                        })();
                      }}
                    >
                      恢复
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="empty">没有已归档的维度。</p>
          )}
        </section>
      ) : (
      <div className="grid-2">
        <section className="card radar-well">
          <RadarChart areas={areas} highlightId={hoverId} onHover={setHoverId} />
          <p className="muted small radar-hint">拖动鼠标环视仪盘，悬停维度会点亮对应辐条。</p>
        </section>
        <div className="area-list">
          {areas.map((a) => (
            <div
              className={`area-card ${hoverId === a.id ? "on" : ""}`}
              key={a.id}
              onPointerEnter={() => setHoverId(a.id)}
              onPointerLeave={() => setHoverId(null)}
            >
              <span className="bar" style={{ background: a.color }} />
              <div style={{ flex: 1 }}>
                <div className="row between">
                  <span className="strong">{a.name}</span>
                  <span className="score">
                    {a.score ?? "—"}
                    <span className="score-scale">/10</span>
                  </span>
                </div>
                <div className="progress thin" style={{ marginTop: 8 }}>
                  <div style={{ width: `${(a.score ?? 0) * 10}%`, background: a.color }} />
                </div>
                <div className="row mt-8">
                  <button className="btn sm" disabled={busy} onClick={() => setForm({ id: a.id, name: a.name, color: a.color })}>
                    编辑
                  </button>
                  <Link className="btn sm ghost" to={`/goals?area=${a.id}`}>
                    查看目标
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}

      {scoreOpen ? (
        <Modal onClose={() => setScoreOpen(false)}>
          <h3>重新打分</h3>
          <p className="muted small mb-16">给每个维度的现状满意度打分（1-10），一次性提交。</p>
          {areas.map((a) => (
            <div className="slider-row" key={a.id}>
              <span>{a.name}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={draftScores[a.id] ?? 5}
                onChange={(e) =>
                  setDraftScores((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))
                }
              />
              <span className="val">{draftScores[a.id] ?? 5}</span>
            </div>
          ))}
          <div className="modal-foot">
            <button className="btn" onClick={() => setScoreOpen(false)}>
              取消
            </button>
            <button
              className="btn primary"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    api.scoreAreas(areas.map((a) => ({ id: a.id, score: draftScores[a.id] ?? 5 }))),
                  "已更新人生之轮",
                )
              }
            >
              提交
            </button>
          </div>
        </Modal>
      ) : null}

      {form ? (
        <Modal onClose={() => setForm(null)}>
          <h3>{form.id ? "编辑维度" : "新建维度"}</h3>
          <div className="field">
            <label htmlFor="af-name">名称</label>
            <input
              id="af-name"
              type="text"
              maxLength={AREA_NAME_MAX}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="af-color">颜色</label>
            <Select
              id="af-color"
              value={form.color}
              options={AREA_PALETTE.map((c) => ({ value: c, label: c, swatch: c }))}
              onChange={(color) => setForm({ ...form, color })}
            />
          </div>
          <div className="modal-foot" style={{ justifyContent: "space-between" }}>
            {form.id ? (
              <button
                className="btn danger"
                disabled={busy}
                onClick={() => void run(() => api.archiveArea(form.id!), "维度已归档或删除")}
              >
                删除 / 归档
              </button>
            ) : (
              <span />
            )}
            <div className="btn-group">
              <button className="btn" onClick={() => setForm(null)}>
                取消
              </button>
              <button
                className="btn primary"
                disabled={busy || !form.name.trim()}
                onClick={() => {
                  const name = form.name.trim();
                  const color = form.color;
                  if (form.id) {
                    void run(() => api.updateArea(form.id!, name, color), "维度已保存");
                  } else {
                    void run(() => api.createArea(name, color), "维度已创建");
                  }
                }}
              >
                保存
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
