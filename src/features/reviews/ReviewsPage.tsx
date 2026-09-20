import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { addDays, fmtMonth, weekdayLabel, weekLabel, weekNo, weekReviewDue, weekReviewWaitLabel } from "../../shared/time";
import type { ReviewList } from "../../shared/types";
import { useApp } from "../../app/AppContext";

type PeriodStatus = ReviewList["this_week_status"];

function periodCta(status: PeriodStatus | undefined, idle: { btn: string; sub: string }) {
  if (status === "submitted") return { btn: "查看", sub: "已提交" };
  if (status === "skipped") return { btn: "查看", sub: "已跳过" };
  if (status === "draft") return { btn: "继续", sub: "草稿已保存，继续完成" };
  return idle;
}

export function ReviewsPage() {
  const { notify } = useApp();
  const [tab, setTab] = useState<"pending" | "history">("pending");
  const [data, setData] = useState<ReviewList | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api.listReviews();
        if (!cancelled) setData(next);
      } catch (e) {
        if (!cancelled) notify(e instanceof ApiError ? e.message : "无法加载复盘");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  const pending = data?.pending ?? [];
  const history = data?.history ?? [];
  const weekDue = data ? weekReviewDue(data.this_week) : false;
  const weekLocked =
    data?.this_week_status === "submitted" || data?.this_week_status === "skipped";
  const weekReady = Boolean(data && (weekLocked || weekDue));
  const weekCta = data
    ? periodCta(data.this_week_status, {
        btn: "开始",
        sub: `今天是${weekdayLabel(addDays(data.this_week, 6))}，可以开始了`,
      })
    : null;

  function actionClass(btn: string) {
    return btn === "开始" || btn === "继续" ? "btn primary sm" : "btn sm";
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">复盘</h1>
          <p className="page-sub">
            周复盘在本周最后一天写；月复盘在月末后写上个月；年复盘在年末后写上一年。大部分内容自动汇总，你只需回答几个问题。
          </p>
        </div>
      </div>
      <div className="row mb-16">
        <button
          type="button"
          className={`chip ${tab === "pending" ? "on" : ""}`}
          onClick={() => setTab("pending")}
        >
          待处理{pending.length ? ` (${pending.length})` : ""}
        </button>
        <button type="button" className={`chip ${tab === "history" ? "on" : ""}`} onClick={() => setTab("history")}>
          历史记录
        </button>
      </div>

      {tab === "pending" ? (
        <section className="card">
          {pending.length ? (
            pending.map((p) => (
            <div className="review-item" key={`${p.kind}-${p.key}`}>
              <span className={`tag ${p.kind === "weekly" ? "" : "level"}`}>
                {p.kind === "weekly" ? "周复盘" : p.kind === "monthly" ? "月复盘" : "年复盘"}
              </span>
              <div className="r-title">
                <div className="strong">
                  {p.kind === "weekly"
                    ? `${weekLabel(p.key)} · 第 ${weekNo(p.key)} 周`
                    : p.kind === "monthly"
                      ? fmtMonth(p.key)
                      : `${p.key} 年`}
                </div>
                <div className="muted small">{p.draft ? "草稿已保存，继续完成" : "尚未开始"}</div>
              </div>
              <Link className="btn primary sm" to={`/reviews/${p.kind}/${p.key}`}>
                {p.draft ? "继续" : "开始"}
              </Link>
            </div>
          ))
          ) : (
            <p className="empty">没有需要补写的复盘。</p>
          )}
          {data && weekCta ? (
            <div className="review-item">
              <span className="tag">周复盘</span>
              <div className="r-title">
                <div className="strong">{weekLabel(data.this_week)} · 本周</div>
                <div className="muted small">{weekReady ? weekCta.sub : weekReviewWaitLabel(data.this_week)}</div>
              </div>
              {weekReady ? (
                <Link className={actionClass(weekCta.btn)} to={`/reviews/weekly/${data.this_week}`}>
                  {weekCta.btn}
                </Link>
              ) : (
                <span className="muted small">{weekReviewWaitLabel(data.this_week)}</span>
              )}
            </div>
          ) : (
            <p className="empty">正在加载…</p>
          )}
        </section>
      ) : (
        <section className="card">
          {history.length ? (
            history.map((x) => (
              <div className="review-item" key={`${x.kind}-${x.key}`}>
                <span className={`tag ${x.kind === "weekly" ? "" : "level"}`}>
                  {x.kind === "weekly" ? "周复盘" : x.kind === "monthly" ? "月复盘" : "年复盘"}
                </span>
                <div className="r-title">
                  <div className="strong">
                    {x.kind === "weekly" ? weekLabel(x.key) : x.kind === "monthly" ? fmtMonth(x.key) : `${x.key} 年`}
                  </div>
                  <div className="muted small">
                    {x.status === "skipped"
                      ? "已跳过"
                      : x.submitted_at
                        ? `提交于 ${x.submitted_at.slice(0, 10)}`
                        : "已提交"}
                  </div>
                </div>
                {x.status === "submitted" && x.satisfaction != null ? (
                  <span className="muted small">
                    满意度 <b>{x.satisfaction}</b>/10
                  </span>
                ) : null}
                <Link className="btn sm" to={`/reviews/${x.kind}/${x.key}`}>
                  查看
                </Link>
              </div>
            ))
          ) : (
            <p className="empty">还没有历史复盘。</p>
          )}
        </section>
      )}
    </>
  );
}
