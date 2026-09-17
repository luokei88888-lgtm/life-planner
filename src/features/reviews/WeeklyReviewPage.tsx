import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { REVIEW_ANSWER_MAX } from "../../shared/constants";
import { addDays, weekLabel, weekNo } from "../../shared/time";
import type { WeeklyReviewView } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { WeekSummary } from "./WeekSummary";
import { PeriodNotes } from "../notes/PeriodNotes";

export function WeeklyReviewPage() {
  const { weekStart } = useParams<{ weekStart: string }>();
  const navigate = useNavigate();
  const { notify } = useApp();
  const [view, setView] = useState<WeeklyReviewView | null>(null);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [wentWell, setWentWell] = useState("");
  const [notWell, setNotWell] = useState("");
  const [reason, setReason] = useState("");
  const [nextWeek, setNextWeek] = useState("");
  const [satisfaction, setSatisfaction] = useState(7);
  const [skipOpen, setSkipOpen] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);

  useEffect(() => {
    if (!weekStart) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await api.getWeeklyReview(weekStart);
        if (cancelled) return;
        setView(next);
        setWentWell(next.q_went_well);
        setNotWell(next.q_not_well);
        setReason(next.q_reason);
        setNextWeek(next.q_next_week);
        setSatisfaction(next.satisfaction);
        setStep(1);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载周复盘");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [weekStart, notify]);

  if (!weekStart) return <p className="empty">缺少周次。</p>;
  if (!view) return <p className="empty">正在加载周复盘…</p>;

  const readonly = view.status === "submitted" || view.status === "skipped";
  const answers = {
    weekStart,
    wentWell,
    notWell,
    reason,
    nextWeek,
    satisfaction,
  };

  async function persist(kind: "draft" | "submit") {
    setBusy(true);
    try {
      const next =
        kind === "submit" ? await api.submitWeeklyReview(answers) : await api.saveWeeklyDraft(answers);
      setView(next);
      if (kind === "draft") notify("草稿已保存");
      if (kind === "submit") setDoneOpen(true);
      return true;
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (readonly) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="muted small" to="/reviews">
              ← 返回复盘
            </Link>
            <h1 className="page-title">周复盘 · {weekLabel(view.week_start)}</h1>
            <p className="page-sub">
              {view.status === "skipped"
                ? "本周复盘已跳过"
                : `提交于 ${view.submitted_at?.slice(0, 10) ?? ""} · 满意度 ${view.satisfaction}/10`}
            </p>
          </div>
        </div>
        {view.status === "skipped" ? (
          <>
            <section className="card">
              <div className="empty">这一周你选择了跳过复盘，没有留下记录。</div>
            </section>
            <PeriodNotes notes={view.notes} />
          </>
        ) : (
          <>
            <WeekSummary snap={view.snapshot} />
            <PeriodNotes notes={view.notes} />
            <section className="card mt-16 stack">
              <div>
                <div className="strong">本周做得好的</div>
                <div className="muted">{view.q_went_well}</div>
              </div>
              <div>
                <div className="strong">没做好的</div>
                <div className="muted">{view.q_not_well}</div>
              </div>
              <div>
                <div className="strong">主要原因</div>
                <div className="muted">{view.q_reason}</div>
              </div>
              <div>
                <div className="strong">下周调整什么</div>
                <div className="muted">{view.q_next_week}</div>
              </div>
            </section>
          </>
        )}
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
          <h1 className="page-title">周复盘 · {weekLabel(view.week_start)}</h1>
          <p className="page-sub">
            第 {weekNo(view.week_start)} 周 · 提交后本周任务将锁定为只读
          </p>
        </div>
        <div className="head-actions">
          <button className="btn ghost" disabled={busy} onClick={() => setSkipOpen(true)}>
            跳过本周复盘
          </button>
        </div>
      </div>
      <div className="steps">
        <div className={`step ${step === 1 ? "on" : ""}`}>
          <span className="n">1</span>本周回顾（自动汇总）
        </div>
        <div className="sep" />
        <div className={`step ${step === 2 ? "on" : ""}`}>
          <span className="n">2</span>四个问题
        </div>
      </div>
      {step === 1 ? (
        <>
          <WeekSummary snap={view.snapshot} />
          <PeriodNotes notes={view.notes} />
          <div className="row mt-16" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" onClick={() => setStep(2)}>
              下一步：回答问题
            </button>
          </div>
        </>
      ) : (
        <>
          <section className="card stack qa">
            <div>
              <label htmlFor="wr-wentWell">1. 本周做得好的是什么？</label>
              <textarea
                id="wr-wentWell"
                maxLength={REVIEW_ANSWER_MAX}
                placeholder="哪怕很小的事也算"
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wr-notWell">2. 没做好的是什么？</label>
              <textarea
                id="wr-notWell"
                maxLength={REVIEW_ANSWER_MAX}
                value={notWell}
                onChange={(e) => setNotWell(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wr-reason">3. 主要原因是什么？</label>
              <textarea
                id="wr-reason"
                maxLength={REVIEW_ANSWER_MAX}
                placeholder="尽量找到可控的原因，而不是归因于运气或别人"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wr-nextWeek">4. 下周要调整什么？</label>
              <textarea
                id="wr-nextWeek"
                maxLength={REVIEW_ANSWER_MAX}
                placeholder="一条就够，能落到下周计划里"
                value={nextWeek}
                onChange={(e) => setNextWeek(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="wr-sat">
                本周整体满意度：{satisfaction}/10
              </label>
              <input
                id="wr-sat"
                type="range"
                min={1}
                max={10}
                value={satisfaction}
                onChange={(e) => setSatisfaction(Number(e.target.value))}
              />
            </div>
          </section>
          <div className="row mt-16 between">
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                void persist("draft").then((ok) => {
                  if (ok) setStep(1);
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
      )}

      {skipOpen ? (
        <Modal onClose={() => setSkipOpen(false)}>
          <h3>跳过本周复盘</h3>
          <p className="muted small mb-16">
            跳过会被记录下来（不会无痕消失），月复盘时会显示你跳过了几次。
          </p>
          <div className="modal-foot">
            <button className="btn" onClick={() => setSkipOpen(false)}>
              取消
            </button>
            <button
              className="btn danger"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    await api.skipWeeklyReview(weekStart);
                    notify("已记录为跳过");
                    navigate("/reviews");
                  } catch (e) {
                    notify(e instanceof ApiError ? e.message : "操作失败");
                  } finally {
                    setBusy(false);
                    setSkipOpen(false);
                  }
                })();
              }}
            >
              确认跳过
            </button>
          </div>
        </Modal>
      ) : null}

      {doneOpen ? (
        <Modal onClose={() => setDoneOpen(false)}>
          <h3>复盘已提交</h3>
          <p className="muted small mb-16">
            {weekLabel(view.week_start)} 的任务已锁定为只读。
            <br />
            <br />
            现在进入 {weekLabel(addDays(view.week_start, 7))} 的计划，把未完成的任务带过去？
          </p>
          <div className="modal-foot">
            <button className="btn" onClick={() => navigate("/reviews")}>
              返回复盘
            </button>
            <button
              className="btn primary"
              onClick={() => navigate(`/week?ws=${addDays(view.week_start, 7)}`)}
            >
              进入下周计划
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
