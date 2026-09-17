import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import {
  ACTIVE_LIMITS,
  GOAL_STATUSES,
  GOAL_WHY_MAX,
  LEVEL_LABEL,
  STATUS_LABEL,
  childLevel,
  type GoalLevel,
  type GoalStatus,
} from "../../shared/constants";
import { isoDate, monthOf, weekStartOf } from "../../shared/time";
import type { Goal, GoalMutation } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { GoalDrawer } from "./GoalDrawer";
import { GoalFormModal, type GoalFormState } from "./GoalFormModal";

export function GoalsPage() {
  const { areas, settings, notify } = useApp();
  const [params, setParams] = useSearchParams();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [busy, setBusy] = useState(false);
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [areaId, setAreaId] = useState(params.get("area") ?? "");
  const [statuses, setStatuses] = useState<Set<GoalStatus>>(new Set(["active", "paused"]));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftProgress, setDraftProgress] = useState<number | null>(null);
  const [form, setForm] = useState<GoalFormState | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    ok: string;
    danger?: boolean;
    run: () => void;
  } | null>(null);
  const [statusModal, setStatusModal] = useState<{ to: "paused" | "dropped"; id: string } | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [cascade, setCascade] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listGoals();
        if (cancelled) return;
        setGoals(list);
        setExpanded(new Set(list.map((g) => g.id)));
      } catch (e) {
        notify(e instanceof ApiError ? e.message : "无法加载目标");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    const fromQuery = params.get("area") ?? "";
    if (fromQuery) setAreaId(fromQuery);
  }, [params]);

  const years = useMemo(() => {
    const found = new Set<number>([currentYear, currentYear - 1]);
    for (const g of goals) {
      if (g.level === "year") found.add(Number(g.period_start.slice(0, 4)));
    }
    return [...found].sort((a, b) => b - a);
  }, [goals, currentYear]);

  const byId = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const selected = selectedId ? byId.get(selectedId) ?? null : null;
  const childrenOf = (id: string) => goals.filter((g) => g.parent_id === id);

  function matches(g: Goal) {
    if (areaId && g.area_id !== areaId) return false;
    return statuses.has(g.status);
  }

  const roots = [
    ...goals.filter((g) => g.level === "life" && matches(g)),
    ...goals.filter(
      (g) =>
        g.level === "year" &&
        !g.parent_id &&
        g.period_start.startsWith(String(year)) &&
        matches(g),
    ),
  ];

  const warnings = useMemo(() => {
    const today = isoDate();
    const ws = weekStartOf(today, settings.week_starts_on);
    const month = monthOf(today);
    return (["life", "year", "quarter", "month", "week"] as GoalLevel[])
      .map((level) => {
        const n = goals.filter((g) => {
          if (g.level !== level || g.status !== "active") return false;
          if (level === "week") return g.period_start === ws;
          if (level === "month") return monthOf(g.period_start) === month;
          if (level === "year") return g.period_start.startsWith(String(year));
          return true;
        }).length;
        const limit = ACTIVE_LIMITS[level];
        return n > limit ? `${LEVEL_LABEL[level]}目标进行中 ${n} 个，建议不超过 ${limit} 个` : null;
      })
      .filter((v): v is string => Boolean(v));
  }, [goals, settings.week_starts_on, year]);

  async function applyMutation(next: GoalMutation, fallback: string) {
    setGoals(next.goals);
    if (next.selected_id) {
      setSelectedId(next.selected_id);
      setExpanded((prev) => {
        const extra = new Set(prev);
        extra.add(next.selected_id as string);
        const created = next.goals.find((g) => g.id === next.selected_id);
        if (created?.parent_id) extra.add(created.parent_id);
        return extra;
      });
    }
    if (next.selected_id === null) setSelectedId(null);
    if (next.warning) notify(next.warning);
    else notify(fallback);
  }

  async function run(fn: () => Promise<GoalMutation>, ok: string) {
    setBusy(true);
    try {
      await applyMutation(await fn(), ok);
      setForm(null);
      setConfirm(null);
      setStatusModal(null);
      setStatusReason("");
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function openGoal(id: string) {
    setSelectedId(id);
    setDraftProgress(null);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleStatus(s: GoalStatus) {
    setStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function openCreate(parent: Goal | null) {
    if (parent && parent.status !== "active") {
      notify("上级目标不是进行中状态，先恢复它");
      return;
    }
    const level: GoalLevel = parent ? childLevel(parent.level) ?? "week" : "life";
    setForm({
      parent,
      level,
      title: "",
      why: "",
      areaId: parent?.area_id || areas[0]?.id || "",
      periodLabel: "保存后按自然周期写入",
    });
  }

  function openCreateYear() {
    setForm({
      parent: null,
      level: "year",
      title: "",
      why: "",
      areaId: areas[0]?.id || "",
      periodLabel: "保存后按自然年度写入",
    });
  }

  function openEdit(goal: Goal) {
    const parent = goal.parent_id ? byId.get(goal.parent_id) ?? null : null;
    setForm({
      id: goal.id,
      parent,
      level: goal.level,
      title: goal.title,
      why: goal.why,
      areaId: goal.area_id,
      periodLabel: `${goal.period_start} 至 ${goal.period_end}`,
    });
  }

  function requestStatus(goal: Goal, to: GoalStatus) {
    if (to === "done") {
      const hasActiveKids = childrenOf(goal.id).some((c) => c.status === "active");
      setConfirm({
        title: "标记完成",
        body: `「${goal.title}」将标记为已完成，进度置为 100%。${
          hasActiveKids ? "它还有进行中的子目标，不会被自动完成。" : ""
        }`,
        ok: "完成",
        run: () => void run(() => api.setGoalStatus(goal.id, "done"), "已完成"),
      });
      return;
    }
    if (to === "active") {
      if (goal.status === "paused") {
        void run(() => api.setGoalStatus(goal.id, "active"), "已恢复进行");
        return;
      }
      setConfirm({
        title: "重新打开",
        body: `「${goal.title}」将回到进行中状态。`,
        ok: "重新打开",
        run: () => void run(() => api.setGoalStatus(goal.id, "active"), "已重新打开"),
      });
      return;
    }
    setStatusReason("");
    setCascade(true);
    setStatusModal({ to, id: goal.id });
  }

  function GoalNode({ goal, root }: { goal: Goal; root: boolean }) {
    const kids = childrenOf(goal.id).filter((g) => {
      if (!matches(g)) return false;
      if (g.level === "year") return g.period_start.startsWith(String(year));
      return true;
    });
    const allKids = childrenOf(goal.id);
    const area = areas.find((a) => a.id === goal.area_id);
    const open = expanded.has(goal.id);
    const next = childLevel(goal.level);
    return (
      <div className={`tree-node ${root ? "root" : ""}`}>
        <div
          className={`goal-row ${selectedId === goal.id ? "selected" : ""}`}
          onClick={() => void openGoal(goal.id)}
        >
          <span
            className={`caret ${allKids.length ? "" : "empty"}`}
            onClick={(e) => {
              e.stopPropagation();
              if (allKids.length) toggleExpand(goal.id);
            }}
          >
            {open ? "▾" : "▸"}
          </span>
          <span className="bar" style={{ background: area?.color ?? "var(--accent)" }} />
          <span className="tag level">{LEVEL_LABEL[goal.level]}</span>
          <span className={`g-title ${goal.status !== "active" ? "muted-status" : ""}`}>{goal.title}</span>
          <span className={`tag ${goal.status}`}>{STATUS_LABEL[goal.status]}</span>
          <span className="g-progress">
            <div className="progress thin">
              <div style={{ width: `${goal.progress}%` }} />
            </div>
          </span>
          <span className="g-pct">{goal.progress}%</span>
          <span className="g-count">{allKids.length ? `${allKids.length} 子目标` : ""}</span>
          {next ? (
            <button
              className="btn sm ghost"
              title={`新建${LEVEL_LABEL[next]}目标`}
              onClick={(e) => {
                e.stopPropagation();
                openCreate(goal);
              }}
            >
              +
            </button>
          ) : (
            <span style={{ width: 30 }} />
          )}
        </div>
        {open ? kids.map((k) => <GoalNode key={k.id} goal={k} root={false} />) : null}
      </div>
    );
  }

  const activeKidsForDrop = statusModal
    ? collectDescendants(statusModal.id, goals).filter((c) => c.status === "active")
    : [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">目标</h1>
          <p className="page-sub">人生 → 年度 → 季度 → 月度 → 周，每个目标都要回答「为什么重要」。</p>
        </div>
        <div className="head-actions">
          <button className="btn" disabled={busy || areas.length === 0} onClick={() => openCreate(null)}>
            新建人生目标
          </button>
          <button className="btn primary" disabled={busy || areas.length === 0} onClick={() => openCreateYear()}>
            新建年度目标
          </button>
        </div>
      </div>
      {warnings.length ? (
        <div className="banner warn mb-16">
          <div>{warnings.join("；")}</div>
        </div>
      ) : null}
      <div className="row wrap mb-16">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ width: 110 }}>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <select
          value={areaId}
          style={{ width: 140 }}
          onChange={(e) => {
            const value = e.target.value;
            setAreaId(value);
            const next = new URLSearchParams(params);
            if (value) next.set("area", value);
            else next.delete("area");
            setParams(next, { replace: true });
          }}
        >
          <option value="">全部维度</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="muted small" style={{ marginLeft: 8 }}>
          状态
        </span>
        {GOAL_STATUSES.map((s) => (
          <button
            key={s}
            className={`chip ${statuses.has(s) ? "on" : ""}`}
            onClick={() => toggleStatus(s)}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => setExpanded(new Set(goals.map((g) => g.id)))}>
          全部展开
        </button>
        <button className="btn sm ghost" onClick={() => setExpanded(new Set())}>
          全部收起
        </button>
      </div>
      <section className="card">
        {roots.length ? roots.map((g) => <GoalNode key={g.id} goal={g} root />) : <div className="empty">当前筛选下没有目标。</div>}
      </section>

      {selected ? (
        <GoalDrawer
          goal={selected}
          parent={selected.parent_id ? byId.get(selected.parent_id) ?? null : null}
          children={childrenOf(selected.id)}
          areas={areas}
          progress={draftProgress ?? selected.progress}
          busy={busy}
          onClose={() => {
            setSelectedId(null);
            setDraftProgress(null);
          }}
          onSelect={(id) => void openGoal(id)}
          onEdit={() => openEdit(selected)}
          onAddChild={() => openCreate(selected)}
          onDelete={() =>
            setConfirm({
              title: "删除目标",
              body: `确定删除「${selected.title}」？没有子目标和任务的目标可以直接删除。`,
              ok: "删除",
              danger: true,
              run: () => void run(() => api.deleteGoal(selected.id), "已删除"),
            })
          }
          onStatus={(to) => requestStatus(selected, to)}
          onProgressInput={setDraftProgress}
          onProgressCommit={(value) => {
            setDraftProgress(value);
            if (value === selected.progress) return;
            void (async () => {
              try {
                const next = await api.setGoalProgress(selected.id, value);
                setGoals(next.goals);
              } catch (e) {
                notify(e instanceof ApiError ? e.message : "进度保存失败");
              }
            })();
          }}
        />
      ) : null}

      {form ? (
        <GoalFormModal
          form={form}
          areas={areas}
          busy={busy}
          onClose={() => setForm(null)}
          onSave={(draft) => {
            if (draft.id) {
              void run(
                () => api.updateGoal(draft.id!, draft.title.trim(), draft.why.trim(), draft.areaId),
                "目标已保存",
              );
            } else {
              void run(
                () =>
                  api.createGoal({
                    title: draft.title.trim(),
                    why: draft.why.trim(),
                    areaId: draft.areaId,
                    level: draft.level,
                    parentId: draft.parent?.id ?? null,
                    year,
                  }),
                "目标已创建",
              );
            }
          }}
        />
      ) : null}

      {confirm ? (
        <Modal onClose={() => setConfirm(null)}>
          <h3>{confirm.title}</h3>
          <p className="muted">{confirm.body}</p>
          <div className="modal-foot">
            <button className="btn" onClick={() => setConfirm(null)}>
              取消
            </button>
            <button
              className={`btn ${confirm.danger ? "danger" : "primary"}`}
              disabled={busy}
              onClick={confirm.run}
            >
              {confirm.ok}
            </button>
          </div>
        </Modal>
      ) : null}

      {statusModal ? (
        <Modal onClose={() => setStatusModal(null)}>
          <h3>{STATUS_LABEL[statusModal.to]}目标</h3>
          <p className="muted small mb-16">「{byId.get(statusModal.id)?.title}」</p>
          <div className="field">
            <label htmlFor="gs-reason">原因（必填）</label>
            <textarea
              id="gs-reason"
              maxLength={GOAL_WHY_MAX}
              value={statusReason}
              placeholder={
                statusModal.to === "dropped"
                  ? "放弃不是失败。写下原因，年度复盘时它会很有价值。"
                  : "暂停多久？什么条件下恢复？"
              }
              onChange={(e) => setStatusReason(e.target.value)}
            />
          </div>
          {statusModal.to === "dropped" && activeKidsForDrop.length ? (
            <div className="banner warn mb-16">
              <label className="row">
                <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} />
                同时放弃 {activeKidsForDrop.length} 个进行中的下级目标
              </label>
            </div>
          ) : null}
          <div className="modal-foot">
            <button className="btn" onClick={() => setStatusModal(null)}>
              取消
            </button>
            <button
              className={`btn ${statusModal.to === "dropped" ? "danger" : "primary"}`}
              disabled={busy || !statusReason.trim()}
              onClick={() =>
                void run(
                  () =>
                    api.setGoalStatus(
                      statusModal.id,
                      statusModal.to,
                      statusReason.trim(),
                      statusModal.to === "dropped" && cascade,
                    ),
                  `已${STATUS_LABEL[statusModal.to]}`,
                )
              }
            >
              确认{STATUS_LABEL[statusModal.to]}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function collectDescendants(id: string, goals: Goal[]): Goal[] {
  const kids = goals.filter((g) => g.parent_id === id);
  return kids.flatMap((k) => [k, ...collectDescendants(k.id, goals)]);
}
