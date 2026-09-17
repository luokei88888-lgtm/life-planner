import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { GOAL_STATUSES, REVIEW_ANSWER_MAX, STATUS_LABEL, type GoalStatus } from "../../shared/constants";
import { fmtMonth } from "../../shared/time";
import type { MonthlyReviewView } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { MonthSummary } from "./MonthSummary";
import { PeriodNotes } from "../notes/PeriodNotes";

export function MonthlyReviewPage() {
  const { month } = useParams<{ month: string }>();
  const navigate = useNavigate();
  const { notify } = useApp();
  const [view, setView] = useState<MonthlyReviewView | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [insight, setInsight] = useState("");
  const [nextMonth, setNextMonth] = useState("");
  const [draftProgress, setDraftProgress] = useState<Record<string, number>>({});
  const [statusModal, setStatusModal] = useState<{ id: string; to: "paused" | "dropped" } | null>(null);
  const [statusReason, setStatusReason] = useState("");

  useEffect(() => {
    if (!month) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await api.getMonthlyReview(month);
        if (cancelled) return;
        apply(next);
        setStep(1);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载月复盘");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month, notify]);

  function apply(next: MonthlyReviewView) {
    setView(next);
    setProgress(next.q_progress);
    setInsight(next.q_insight);
    setNextMonth(next.q_next_month);
    const drafts: Record<string, number> = {};
    for (const g of next.goals) drafts[g.id] = g.progress;
    setDraftProgress(drafts);
  }

  async function persist(kind: "draft" | "submit") {
    if (!month) return false;
    setBusy(true);
    try {
      const next =
        kind === "submit"
          ? await api.submitMonthlyReview({ month, progress, insight, nextMonth })
          : await api.saveMonthlyDraft({ month, progress, insight, nextMonth });
      apply(next);
      notify(kind === "submit" ? "月复盘已提交" : "草稿已保存");
      if (kind === "submit") navigate("/reviews");
      return true;
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, to: GoalStatus, reason?: string) {
    if (!month) return;
    setBusy(true);
    try {
      await api.setGoalStatus(id, to, reason, to === "dropped");
      apply(await api.getMonthlyReview(month));
      notify(`已${STATUS_LABEL[to]}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "更新目标失败");
    } finally {
      setBusy(false);
    }
  }

  if (!month) return <p className="empty">缺少月份。</p>;
  if (!view) return <p className="empty">正在加载月复盘…</p>;

  const readonly = view.status === "submitted";
  const hasWeekRecord = view.snapshot.submitted_weeks > 0 || view.snapshot.skipped > 0;

  if (readonly) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="muted small" to="/reviews">
              ← 返回复盘
            </Link>
            <h1 className="page-title">月复盘 · {fmtMonth(view.month)}</h1>
            <p className="page-sub">提交于 {view.submitted_at?.slice(0, 10) ?? ""}</p>
          </div>
        </div>
        <MonthSummary snap={view.snapshot} />
        <PeriodNotes notes={view.notes} />
        <section className="card mt-16 stack">
          <div>
            <div className="strong">本月目标推进情况</div>
            <div className="muted">{view.q_progress}</div>
          </div>
          <div>
            <div className="strong">最大的收获或发现</div>
            <div className="muted">{view.q_insight}</div>
          </div>
          <div>
            <div className="strong">下月要改变什么</div>
            <div className="muted">{view.q_next_month}</div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link className="muted small" to="/reviews">
            ← 返回复盘
          </Link>
          <h1 className="page-title">月复盘 · {fmtMonth(view.month)}</h1>
          <p className="page-sub">对照月度目标逐条检查，再回答三个问题</p>
        </div>
      </div>
      {!hasWeekRecord ? (
        <div className="banner warn mb-16">
          <div>本月还没有任何周复盘记录。建议先补周复盘，月复盘才有依据。</div>
          <Link className="btn sm" to="/reviews">
            去看周复盘
          </Link>
        </div>
      ) : null}
      <div className="steps">
        <div className={`step ${step === 1 ? "on" : ""}`}>
          <span className="n">1</span>本月回顾
        </div>
        <div className="sep" />
        <div className={`step ${step === 2 ? "on" : ""}`}>
          <span className="n">2</span>更新月度目标
        </div>
        <div className="sep" />
        <div className={`step ${step === 3 ? "on" : ""}`}>
          <span className="n">3</span>三个问题
        </div>
      </div>

      {step === 1 ? (
        <>
          <MonthSummary snap={view.snapshot} />
          <PeriodNotes notes={view.notes} />
          <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={() => setStep(2)}>
              下一步：更新目标
            </button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <section className="card">
            {view.goals.length ? (
              view.goals.map((g) => {
                const terminal = g.status === "done" || g.status === "dropped";
                return (
                  <div className="goal-review-row" key={g.id}>
                    <span className="bar" style={{ background: g.color }} />
                    <div style={{ flex: 1 }}>
                      <div className="row between">
                        <span className="strong">{g.title}</span>
                        <select
                          style={{ width: 110 }}
                          value={g.status}
                          disabled={busy}
                          onChange={(e) => {
                            const to = e.target.value as GoalStatus;
                            if (to === g.status) return;
                            if (to === "paused" || to === "dropped") {
                              setStatusModal({ id: g.id, to });
                              setStatusReason("");
                              return;
                            }
                            void changeStatus(g.id, to);
                          }}
                        >
                          {GOAL_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="row mt-8">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={draftProgress[g.id] ?? g.progress}
                          disabled={terminal || busy}
                          onChange={(e) =>
                            setDraftProgress((prev) => ({ ...prev, [g.id]: Number(e.target.value) }))
                          }
                          onMouseUp={(e) => {
                            const value = Number((e.target as HTMLInputElement).value);
                            if (value === g.progress) return;
                            void (async () => {
                              setBusy(true);
                              try {
                                await api.setGoalProgress(g.id, value);
                                apply(await api.getMonthlyReview(month));
                              } catch (err) {
                                notify(err instanceof ApiError ? err.message : "保存进度失败");
                              } finally {
                                setBusy(false);
                              }
                            })();
                          }}
                        />
                        <span className="muted small" style={{ width: 40, textAlign: "right" }}>
                          {draftProgress[g.id] ?? g.progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">本月没有月度目标。</div>
            )}
          </section>
          <div className="row mt-16 between">
            <button className="btn" onClick={() => setStep(1)}>
              上一步
            </button>
            <button className="btn primary" onClick={() => setStep(3)}>
              下一步：回答问题
            </button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <section className="card stack qa">
            <div>
              <label htmlFor="mr-progress">1. 本月目标推进情况如何？</label>
              <textarea
                id="mr-progress"
                maxLength={REVIEW_ANSWER_MAX}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="mr-insight">2. 最大的收获或发现是什么？</label>
              <textarea
                id="mr-insight"
                maxLength={REVIEW_ANSWER_MAX}
                placeholder="关于自己、关于方法、关于方向"
                value={insight}
                onChange={(e) => setInsight(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="mr-nextMonth">3. 下个月要改变什么？</label>
              <textarea
                id="mr-nextMonth"
                maxLength={REVIEW_ANSWER_MAX}
                value={nextMonth}
                onChange={(e) => setNextMonth(e.target.value)}
              />
            </div>
          </section>
          <div className="row mt-16 between">
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                void persist("draft").then((ok) => {
                  if (ok) setStep(2);
                });
              }}
            >
              上一步
            </button>
            <div className="btn-group">
              <button className="btn" disabled={busy} onClick={() => void persist("draft")}>
                保存草稿
              </button>
              <button className="btn primary" disabled={busy} onClick={() => void persist("submit")}>
                提交复盘
              </button>
            </div>
          </div>
        </>
      ) : null}

      {statusModal ? (
        <Modal onClose={() => setStatusModal(null)}>
          <h3>{STATUS_LABEL[statusModal.to]}目标</h3>
          <p className="muted small mb-16">
            「{view.goals.find((g) => g.id === statusModal.id)?.title}」
          </p>
          <div className="field">
            <label htmlFor="mr-status-reason">原因（必填）</label>
            <textarea
              id="mr-status-reason"
              value={statusReason}
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>
          <div className="modal-foot">
            <button className="btn" onClick={() => setStatusModal(null)}>
              取消
            </button>
            <button
              className={`btn ${statusModal.to === "dropped" ? "danger" : "primary"}`}
              disabled={busy || !statusReason.trim()}
              onClick={() => {
                const { id, to } = statusModal;
                setStatusModal(null);
                void changeStatus(id, to, statusReason.trim());
              }}
            >
              确认{STATUS_LABEL[statusModal.to]}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
