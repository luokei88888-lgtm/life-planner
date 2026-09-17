import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { fmtMonth, weekLabel, weekNo } from "../../shared/time";
import type { ReviewList } from "../../shared/types";
import { useApp } from "../../app/AppContext";

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">复盘</h1>
          <p className="page-sub">周复盘每周日开放，月复盘每月 1 日开放，年复盘每年初开放。大部分内容自动汇总，你只需回答几个问题。</p>
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
          {pending.map((p) => (
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
          ))}
          {data ? (
            <>
              <div className="review-item">
                <span className="tag">周复盘</span>
                <div className="r-title">
                  <div className="strong">{weekLabel(data.this_week)} · 本周</div>
                  <div className="muted small">
                    {data.weekday === 0 ? "今天是周日，可以开始了" : "周日开放，也可以提前写"}
                  </div>
                </div>
                <Link className="btn sm" to={`/reviews/weekly/${data.this_week}`}>
                  {data.weekday === 0 ? "开始" : "提前体验"}
                </Link>
              </div>
              <div className="review-item">
                <span className="tag level">月复盘</span>
                <div className="r-title">
                  <div className="strong">{fmtMonth(data.this_month)}</div>
                  <div className="muted small">每月 1 日开放，也可以提前写</div>
                </div>
                <Link className="btn sm" to={`/reviews/monthly/${data.this_month}`}>
                  提前体验
                </Link>
              </div>
              <div className="review-item">
                <span className="tag level">年复盘</span>
                <div className="r-title">
                  <div className="strong">{data.this_year} 年</div>
                  <div className="muted small">每年初开放，也可以提前写</div>
                </div>
                <Link className="btn sm" to={`/reviews/yearly/${data.this_year}`}>
                  提前体验
                </Link>
              </div>
            </>
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
