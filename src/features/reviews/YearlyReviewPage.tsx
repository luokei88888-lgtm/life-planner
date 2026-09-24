import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { AREA_SCORE_MAX, AREA_SCORE_MIN, GOAL_STATUSES, REVIEW_ANSWER_MAX, STATUS_LABEL, type GoalStatus } from "../../shared/constants";
import { yearReviewDue } from "../../shared/time";
import type { YearlyReviewView } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";
import { YearSummary } from "./YearSummary";

export function YearlyReviewPage() {
  const { year } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const { notify, reload } = useApp();
  const [view, setView] = useState<YearlyReviewView | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [insight, setInsight] = useState("");
  const [nextYear, setNextYear] = useState("");
  const [draftProgress, setDraftProgress] = useState<Record<string, number>>({});
  const [areaDraft, setAreaDraft] = useState<Record<string, number>>({});
  const [statusModal, setStatusModal] = useState<{ id: string; to: "paused" | "dropped" } | null>(null);
  const [statusReason, setStatusReason] = useState("");

  useEffect(() => {
    if (!year) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await api.getYearlyReview(year);
        if (cancelled) return;
        apply(next, true);
        setStep(1);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载年复盘");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, notify]);

  function apply(next: YearlyReviewView, resetAreas = false) {
    setView(next);
    setProgress(next.q_progress);
    setInsight(next.q_insight);
    setNextYear(next.q_next_year);
    const drafts: Record<string, number> = {};
    for (const g of next.goals) drafts[g.id] = g.progress;
    setDraftProgress(drafts);
    if (resetAreas) {
      const scores: Record<string, number> = {};
      for (const a of next.snapshot.area_scores ?? []) scores[a.id] = a.score;
      setAreaDraft(scores);
    }
  }

  function answersReady() {
    return Boolean(progress.trim() && insight.trim() && nextYear.trim());
  }

  async function persist(kind: "draft" | "submit", applyScores = false) {
    if (!year) return false;
    setBusy(true);
    try {
      const scores = (view?.snapshot.area_scores ?? []).map((a) => ({
        id: a.id,
        score: areaDraft[a.id] ?? a.score,
      }));
      const next =
        kind === "submit"
          ? await api.submitYearlyReview({
              year,
              progress,
              insight,
              nextYear,
              scores: applyScores ? scores : undefined,
            })
          : await api.saveYearlyDraft({ year, progress, insight, nextYear });
      apply(next);
      notify(
        kind === "submit"
          ? applyScores
            ? "年复盘已提交，维度分数已更新"
            : "年复盘已提交"
          : "草稿已保存",
      );
      if (kind === "submit") {
        await reload();
        navigate("/reviews");
      }
      return true;
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, to: GoalStatus, reason?: string) {
    if (!year) return;
    setBusy(true);
    try {
      await api.setGoalStatus(id, to, reason, to === "dropped");
      apply(await api.getYearlyReview(year));
      notify(`已${STATUS_LABEL[to]}`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "更新目标失败");
    } finally {
      setBusy(false);
    }
  }

  if (!year) return <p className="empty">缺少年份。</p>;
  if (!view) return <p className="empty">正在加载年复盘…</p>;

  const readonly = view.status === "submitted";
  const due = yearReviewDue(view.year);
  const hasMonthRecord = view.snapshot.submitted_months > 0 || view.snapshot.skipped > 0;

  if (!readonly && !due) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="muted small" to="/reviews">
              ← 返回复盘
            </Link>
            <h1 className="page-title">年复盘 · {view.year}</h1>
            <p className="page-sub">这一年还没结束，结束后再写</p>
          </div>
        </div>
        <section className="card">
          <p className="empty">年复盘只写已经过完的年份。今年会出现在明年年初的待处理里。</p>
        </section>
      </>
    );
  }

  if (readonly) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="muted small" to="/reviews">
              ← 返回复盘
            </Link>
            <h1 className="page-title">年复盘 · {view.year}</h1>
            <p className="page-sub">提交于 {view.submitted_at?.slice(0, 10) ?? ""}</p>
          </div>
        </div>
        <YearSummary snap={view.snapshot} frozen />
        <section className="card mt-16 stack">
          <div>
            <div className="strong">本年目标推进情况</div>
            <div className="muted">{view.q_progress}</div>
          </div>
          <div>
            <div className="strong">最大的收获或发现</div>
            <div className="muted">{view.q_insight}</div>
          </div>
          <div>
            <div className="strong">明年要改变什么</div>
            <div className="muted">{view.q_next_year}</div>
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
          <h1 className="page-title">年复盘 · {view.year}</h1>
          <p className="page-sub">对照年度与人生目标、回答三个问题，最后可选择重打维度分</p>
        </div>
      </div>
      {!hasMonthRecord ? (
        <div className="banner warn mb-16">
          <div>本年还没有任何月复盘记录。建议先补月复盘，年复盘才有依据。</div>
          <Link className="btn sm" to="/reviews">
            去看月复盘
          </Link>
        </div>
      ) : null}
      <div className="steps">
        <div className={`step ${step === 1 ? "on" : ""}`}>
          <span className="n">1</span>本年回顾
        </div>
        <div className="sep" />
        <div className={`step ${step === 2 ? "on" : ""}`}>
          <span className="n">2</span>更新年度目标
        </div>
        <div className="sep" />
        <div className={`step ${step === 3 ? "on" : ""}`}>
          <span className="n">3</span>三个问题
        </div>
        <div className="sep" />
        <div className={`step ${step === 4 ? "on" : ""}`}>
          <span className="n">4</span>维度还准吗
        </div>
      </div>

      {step === 1 ? (
        <>
          <YearSummary snap={view.snapshot} />
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
                        <Select
                          style={{ width: 110 }}
                          value={g.status}
                          disabled={busy}
                          options={GOAL_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
                          onChange={(next) => {
                            const to = next as GoalStatus;
                            if (to === g.status) return;
                            if (to === "paused" || to === "dropped") {
                              setStatusModal({ id: g.id, to });
                              setStatusReason("");
                              return;
                            }
                            void changeStatus(g.id, to);
                          }}
                        />
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
                                apply(await api.getYearlyReview(year));
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
              <div className="empty">本年没有年度目标。</div>
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
              <label htmlFor="yr-progress">1. 本年目标推进情况如何？</label>
              <textarea
                id="yr-progress"
                maxLength={REVIEW_ANSWER_MAX}
                value={progress}
                onChange={(e) => setProgress(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="yr-insight">2. 最大的收获或发现是什么？</label>
              <textarea
                id="yr-insight"
                maxLength={REVIEW_ANSWER_MAX}
                placeholder="关于自己、关于方法、关于方向"
                value={insight}
                onChange={(e) => setInsight(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="yr-nextYear">3. 明年要改变什么？</label>
              <textarea
                id="yr-nextYear"
                maxLength={REVIEW_ANSWER_MAX}
                value={nextYear}
                onChange={(e) => setNextYear(e.target.value)}
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
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  if (!answersReady()) {
                    notify("三个问题都要回答");
                    return;
                  }
                  setStep(4);
                }}
              >
                下一步：核对维度
              </button>
            </div>
          </div>
        </>
      ) : null}

      {step === 4 ? (
        <>
          <section className="card stack">
            <div>
              <div className="strong">这些分数还代表现在的你吗？</div>
              <p className="muted small">
                可以拖动滑杆更新人生之轮。跳过则只提交复盘，不改雷达。草稿不会改分数。
              </p>
            </div>
            {(view.snapshot.area_scores ?? []).map((a) => (
              <div className="slider-row review-score-row" key={a.id}>
                <span>
                  <span className="dot" style={{ background: a.color, marginRight: 6 }} />
                  {a.name}
                </span>
                <input
                  type="range"
                  min={AREA_SCORE_MIN}
                  max={AREA_SCORE_MAX}
                  value={areaDraft[a.id] ?? a.score}
                  disabled={busy}
                  onChange={(e) =>
                    setAreaDraft((prev) => ({ ...prev, [a.id]: Number(e.target.value) }))
                  }
                />
                <span className="val">{areaDraft[a.id] ?? a.score}</span>
              </div>
            ))}
          </section>
          <div className="row mt-16 between">
            <button className="btn" disabled={busy} onClick={() => setStep(3)}>
              上一步
            </button>
            <div className="btn-group">
              <button className="btn" disabled={busy} onClick={() => void persist("submit", false)}>
                跳过，直接提交
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() => void persist("submit", true)}
              >
                提交并更新分数
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
            <label htmlFor="yr-status-reason">原因（必填）</label>
            <textarea
              id="yr-status-reason"
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
