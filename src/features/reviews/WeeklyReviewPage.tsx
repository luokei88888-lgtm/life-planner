import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { REVIEW_ANSWER_MAX, REVIEW_NEXT_TASK_MAX, TASK_TITLE_MAX } from "../../shared/constants";
import { addDays, weekLabel, weekNo, weekReviewDue, weekdayLabel } from "../../shared/time";
import type { WeeklyReviewView } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { WeekSummary } from "./WeekSummary";

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
  const [nextTitles, setNextTitles] = useState<string[]>([""]);
  const [carryUnfinished, setCarryUnfinished] = useState(false);

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
  const due = weekReviewDue(view.week_start);
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
      if (kind === "submit") {
        setNextTitles(next.q_next_week.trim() ? [next.q_next_week.trim()] : [""]);
        setCarryUnfinished(false);
        setDoneOpen(true);
      }
      return true;
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "保存失败");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function confirmNextTasks(titles: string[], carry: boolean, goNextWeek: boolean) {
    if (!weekStart) return;
    setBusy(true);
    try {
      await api.applyWeeklyNextWeekTasks(weekStart, titles, carry);
      const wroteNew = titles.some((t) => t.trim());
      if (carry && wroteNew) notify("未完成已移到下周，并写入新任务");
      else if (carry) notify("未完成已移到下周");
      else if (wroteNew) notify("已写入下周任务");
      else notify("复盘已提交");
      setDoneOpen(false);
      navigate(goNextWeek ? `/week?ws=${addDays(weekStart, 7)}` : "/reviews");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "写入下周安排失败");
    } finally {
      setBusy(false);
    }
  }

  const unfinished = view.unfinished ?? [];
  const canConfirmWeek = carryUnfinished || nextTitles.some((t) => t.trim());

  const nextTasksModal = doneOpen ? (
        <Modal
          onClose={() => {
            if (busy) return;
            void confirmNextTasks([], false, false);
          }}
        >
          <h3>下周怎么安排</h3>
          <p className="muted small mb-16">
            {weekLabel(view.week_start)} 已锁定。上面是原来的任务换周，下面是新承诺（最多{" "}
            {REVIEW_NEXT_TASK_MAX} 条，默认不挂目标）。
          </p>
          {unfinished.length ? (
            <div className="stack mb-16">
              <div className="strong">未完成 · 还是原来那几条</div>
              <p className="muted small">
                {unfinished.map((item) => item.title).join("、")}
              </p>
              <label className="row" style={{ gap: 8 }}>
                <input
                  type="checkbox"
                  checked={carryUnfinished}
                  onChange={(e) => setCarryUnfinished(e.target.checked)}
                />
                移到下周
              </label>
              <p className="hint">
                不勾选则留在本周只读。之后仍可在任务页把它们移入下周。
              </p>
            </div>
          ) : null}
          <div className="strong mb-8">新承诺</div>
          {unfinished.length ? (
            <p className="hint mb-8">这里是新写的任务，不要把上面那些再打一遍。</p>
          ) : (
            <p className="hint mb-8">最多 {REVIEW_NEXT_TASK_MAX} 条，默认不挂目标。</p>
          )}
          <div className="stack">
            {nextTitles.map((title, index) => (
              <div className="field" key={index}>
                <label htmlFor={`wr-next-task-${index}`}>任务 {index + 1}</label>
                <div className="row">
                  <input
                    id={`wr-next-task-${index}`}
                    value={title}
                    maxLength={TASK_TITLE_MAX}
                    onChange={(e) =>
                      setNextTitles((prev) => prev.map((item, i) => (i === index ? e.target.value : item)))
                    }
                  />
                  {nextTitles.length > 1 ? (
                    <button
                      type="button"
                      className="btn ghost"
                      onClick={() => setNextTitles((prev) => prev.filter((_, i) => i !== index))}
                    >
                      删
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {nextTitles.length < REVIEW_NEXT_TASK_MAX ? (
            <button
              type="button"
              className="btn ghost mt-8"
              onClick={() => setNextTitles((prev) => [...prev, ""])}
            >
              再加一条
            </button>
          ) : null}
          <div className="modal-foot">
            <button className="btn" disabled={busy} onClick={() => void confirmNextTasks([], false, false)}>
              不用
            </button>
            <button
              className="btn primary"
              disabled={busy || !canConfirmWeek}
              onClick={() => void confirmNextTasks(nextTitles, carryUnfinished, true)}
            >
              确认下周安排
            </button>
          </div>
        </Modal>
      ) : null;

  if (!readonly && !due) {
    const lastDay = weekdayLabel(addDays(view.week_start, 6));
    return (
      <>
        <div className="page-head">
          <div>
            <Link className="muted small" to="/reviews">
              ← 返回复盘
            </Link>
            <h1 className="page-title">周复盘 · {weekLabel(view.week_start)}</h1>
            <p className="page-sub">本周还没结束，{lastDay}再写</p>
          </div>
        </div>
        <section className="card">
          <p className="empty">周期没走完，先别写复盘。等{lastDay}再来。</p>
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
          </>
        ) : (
          <>
            <WeekSummary snap={view.snapshot} />
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
        {nextTasksModal}
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
            第 {weekNo(view.week_start)} 周 · 提交或跳过后本周任务将锁定为只读
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
                placeholder="一条就够，能落到下周任务里"
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
            跳过问卷，本周仍结束：任务会变成只读。跳过会被记录下来，月复盘时会显示你跳过了几次。
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
                    notify("已跳过，本周任务只读");
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
      {nextTasksModal}
    </>
  );
}
