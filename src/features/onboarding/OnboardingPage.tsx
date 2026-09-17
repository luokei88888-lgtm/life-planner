import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  GOAL_TITLE_MAX,
  GOAL_WHY_MAX,
  HABIT_TITLE_MAX,
  TASK_TITLE_MAX,
} from "../../shared/constants";
import { isoDate, monthOf, quarterOf } from "../../shared/time";
import { useApp } from "../../app/AppContext";

const STEPS = ["开始", "维度打分", "年度目标", "拆解到本周", "第一个任务", "第一个习惯", "完成"];
export const SKIP_ONBOARDING_KEY = "life-planner.skip-onboarding";

type Draft = {
  scores: Record<string, number>;
  areaId: string;
  title: string;
  why: string;
  q: string;
  m: string;
  w: string;
  task: string;
  habit: string;
  freq: "daily" | "weekly";
  habitArea: string;
};

export function OnboardingPage() {
  const { areas, notify, applySettings, reload } = useApp();
  const navigate = useNavigate();
  const today = isoDate();
  const lowest = useMemo(
    () => [...areas].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0],
    [areas],
  );
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    scores: Object.fromEntries(areas.map((a) => [a.id, a.score ?? 5])),
    areaId: lowest?.id ?? "",
    title: "",
    why: "",
    q: "",
    m: "",
    w: "",
    task: "",
    habit: "",
    freq: "daily",
    habitArea: lowest?.id ?? "",
  }));

  function skip() {
    sessionStorage.setItem(SKIP_ONBOARDING_KEY, "1");
    notify("可以随时在设置里重新运行引导");
    navigate("/", { replace: true });
  }

  function goNext() {
    if (step === 2 && draft.title.trim() && !draft.why.trim()) {
      notify("「为什么重要」是必填的。说不清就先别立这个目标。");
      return;
    }
    setStep((n) => Math.min(STEPS.length - 1, n + 1));
  }

  async function finish() {
    setBusy(true);
    try {
      const result = await api.completeOnboarding({
        scores: areas.map((a) => ({ id: a.id, score: draft.scores[a.id] ?? a.score ?? 5 })),
        title: draft.title.trim() || null,
        why: draft.why.trim() || null,
        areaId: draft.areaId || lowest?.id || null,
        quarterTitle: draft.q.trim() || null,
        monthTitle: draft.m.trim() || null,
        weekTitle: draft.w.trim() || null,
        taskTitle: draft.task.trim() || null,
        habitTitle: draft.habit.trim() || null,
        habitFrequency: draft.freq,
        habitAreaId: draft.habitArea || draft.areaId || lowest?.id || null,
      });
      applySettings(result.settings);
      await reload();
      sessionStorage.removeItem(SKIP_ONBOARDING_KEY);
      notify(result.warning ?? "闭环已建立，从今天开始");
      navigate("/", { replace: true });
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "引导未能保存");
    } finally {
      setBusy(false);
    }
  }

  const nav = (backable: boolean, nextLabel = "下一步") => (
    <div className="row between mt-24">
      {backable ? (
        <button type="button" className="btn" onClick={() => setStep((n) => Math.max(0, n - 1))}>
          上一步
        </button>
      ) : (
        <button type="button" className="btn ghost" onClick={skip}>
          跳过引导
        </button>
      )}
      <button type="button" className="btn primary" onClick={goNext} disabled={busy}>
        {nextLabel}
      </button>
    </div>
  );

  let body: ReactNode = null;
  switch (step) {
    case 0:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>花 5 分钟，建立你的第一个闭环</h2>
          <p className="muted">
            人生规划不是列一堆愿望，而是一条能转起来的链：
            <b>看清现状 → 定一个年度目标 → 拆到本周 → 每天做 → 周末复盘</b>
            。接下来 5 步带你把这条链搭起来，随时可以跳过。
          </p>
          {nav(false, "开始")}
        </>
      );
      break;
    case 1:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>给 {areas.length} 个维度打分</h2>
          <p className="muted">1 分很不满意，10 分非常满意。凭直觉，不用想太久。</p>
          {areas.map((a) => (
            <div className="slider-row" key={a.id}>
              <span>{a.name}</span>
              <input
                type="range"
                min={1}
                max={10}
                value={draft.scores[a.id] ?? 5}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    scores: { ...draft.scores, [a.id]: Number(e.target.value) },
                  })
                }
              />
              <span className="val">{draft.scores[a.id] ?? 5}</span>
            </div>
          ))}
          {nav(true)}
        </>
      );
      break;
    case 2:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>定一个年度目标</h2>
          <p className="muted">建议从分数最低、或者你最想改善的维度开始。只定一个。</p>
          <div className="field">
            <label htmlFor="ob-area">维度</label>
            <select
              id="ob-area"
              value={draft.areaId}
              onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="ob-title">目标</label>
            <input
              id="ob-title"
              type="text"
              maxLength={GOAL_TITLE_MAX}
              value={draft.title}
              placeholder="例如：把体重降到 72kg"
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <div className="example">
              示例：每个月至少陪父母吃一次饭 / 今年存下 3 万元 / 恢复每周运动 3 次
            </div>
          </div>
          <div className="field">
            <label htmlFor="ob-why">为什么这对你重要</label>
            <textarea
              id="ob-why"
              maxLength={GOAL_WHY_MAX}
              value={draft.why}
              placeholder="写给一年后的自己看"
              onChange={(e) => setDraft({ ...draft, why: e.target.value })}
            />
            <div className="hint">这一栏是必填的。说不清为什么重要的目标，通常坚持不了。</div>
          </div>
          {nav(true)}
        </>
      );
      break;
    case 3:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>把它拆到本周</h2>
          <p className="muted">
            年度目标「{draft.title || "…"}」在这个季度、这个月、这一周分别要推进什么？
          </p>
          <div className="field">
            <label htmlFor="ob-q">本季度（Q{quarterOf(today)}）</label>
            <input
              id="ob-q"
              type="text"
              maxLength={GOAL_TITLE_MAX}
              value={draft.q}
              placeholder="例如：建立每周运动 3 次的习惯"
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ob-m">本月（{Number(monthOf(today).slice(5))} 月）</label>
            <input
              id="ob-m"
              type="text"
              maxLength={GOAL_TITLE_MAX}
              value={draft.m}
              placeholder="例如：9 月累计运动 12 次"
              onChange={(e) => setDraft({ ...draft, m: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ob-w">本周</label>
            <input
              id="ob-w"
              type="text"
              maxLength={GOAL_TITLE_MAX}
              value={draft.w}
              placeholder="例如：本周运动 3 次"
              onChange={(e) => setDraft({ ...draft, w: e.target.value })}
            />
          </div>
          {nav(true)}
        </>
      );
      break;
    case 4:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>给本周目标加一个任务</h2>
          <p className="muted">周目标「{draft.w || "…"}」下，今天或明天能做的一件具体的事。</p>
          <div className="field">
            <label htmlFor="ob-task">任务</label>
            <input
              id="ob-task"
              type="text"
              maxLength={TASK_TITLE_MAX}
              value={draft.task}
              placeholder="例如：明早 7 点去小区跑 3 公里"
              onChange={(e) => setDraft({ ...draft, task: e.target.value })}
            />
          </div>
          {nav(true)}
        </>
      );
      break;
    case 5:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>建一个习惯</h2>
          <p className="muted">一个每天或每周固定做的小事，越小越好。</p>
          <div className="field">
            <label htmlFor="ob-habit">习惯</label>
            <input
              id="ob-habit"
              type="text"
              maxLength={HABIT_TITLE_MAX}
              value={draft.habit}
              placeholder="例如：睡前阅读 15 分钟"
              onChange={(e) => setDraft({ ...draft, habit: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="ob-freq">频率</label>
            <select
              id="ob-freq"
              value={draft.freq}
              onChange={(e) => setDraft({ ...draft, freq: e.target.value as Draft["freq"] })}
            >
              <option value="daily">每天</option>
              <option value="weekly">每周 3 次</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="ob-habit-area">维度</label>
            <select
              id="ob-habit-area"
              value={draft.habitArea}
              onChange={(e) => setDraft({ ...draft, habitArea: e.target.value })}
            >
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          {nav(true, "完成")}
        </>
      );
      break;
    default:
      body = (
        <>
          <h2 style={{ margin: "0 0 8px" }}>闭环搭好了</h2>
          <p className="muted">
            接下来每天打开首页看今日焦点和习惯，周日花 10 分钟做周复盘。剩下的交给时间。
          </p>
          <div className="card" style={{ background: "var(--surface-2)" }}>
            <div className="kv">
              <span className="k">年度目标</span>
              <span>{draft.title.trim() || "（未填写）"}</span>
              <span className="k">本周目标</span>
              <span>{draft.w.trim() || "（未填写）"}</span>
              <span className="k">第一个任务</span>
              <span>{draft.task.trim() || "（未填写）"}</span>
              <span className="k">第一个习惯</span>
              <span>{draft.habit.trim() || "（未填写）"}</span>
            </div>
          </div>
          <div className="row mt-24" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={() => setStep(5)} disabled={busy}>
              上一步
            </button>
            <button type="button" className="btn primary" onClick={() => void finish()} disabled={busy}>
              进入首页
            </button>
          </div>
        </>
      );
  }

  return (
    <div className="onboard">
      <div className="steps" style={{ flexWrap: "wrap" }}>
        {STEPS.map((label, i) => (
          <Fragment key={label}>
            <div className={`step ${i === step ? "on" : ""}`}>
              <span className="n">{i + 1}</span>
              {label}
            </div>
            {i < STEPS.length - 1 ? <div className="sep" /> : null}
          </Fragment>
        ))}
      </div>
      <div className="card">{body}</div>
    </div>
  );
}
