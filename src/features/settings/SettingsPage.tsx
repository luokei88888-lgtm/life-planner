import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../lib/api";
import { IMPORT_JSON_MAX, KEEP_BACKUP_COUNTS, THEMES } from "../../shared/constants";
import { isoDate } from "../../shared/time";
import type { ThemeId } from "../../shared/constants";
import type { Health } from "../../shared/types";
import { useApp } from "../../app/AppContext";
import { Modal } from "../../ui/Modal";
import { Select } from "../../ui/Select";
import { SKIP_ONBOARDING_KEY } from "../onboarding/OnboardingPage";

export function SettingsPage() {
  const { settings, setTheme, applySettings, notify, reload } = useApp();
  const navigate = useNavigate();
  const current = THEMES.find((t) => t.id === settings.theme);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetPhrase, setResetPhrase] = useState("");
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await api.health();
        if (!cancelled) setHealth(next);
      } catch {
        if (!cancelled) setHealth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function backupNow() {
    await run(async () => {
      const result = await api.backupNow();
      applySettings(result.settings);
      notify(`已生成备份快照 ${result.file_name}`);
    });
  }

  async function exportJson() {
    await run(async () => {
      const json = await api.exportJson();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `life-planner-export-${isoDate()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      notify("已导出 JSON");
    });
  }

  function pickImportFile() {
    setConfirmImport(false);
    fileRef.current?.click();
  }

  async function onImportFile(file: File) {
    if (file.size > IMPORT_JSON_MAX) {
      notify("备份文件过大");
      return;
    }
    await run(async () => {
      const text = await file.text();
      const result = await api.importJson(text);
      applySettings(result.settings);
      await reload();
      notify(`已备份当前数据并完成导入（${result.file_name}）`);
    });
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">数据只存在你的电脑上，密钥不会进仓库或前端配置。</p>
        </div>
      </div>
      <div className="grid-2">
        <section className="card">
          <div className="card-title">外观与偏好</div>
          <div className="setting-row">
            <div>
              <div>主题</div>
              <div className="desc">{current?.desc}</div>
            </div>
            <Select
              style={{ width: 180 }}
              value={settings.theme}
              disabled={busy}
              options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
              onChange={(next) => {
                void setTheme(next as ThemeId);
              }}
            />
          </div>
          <div className="setting-row">
            <div>
              <div>每周起始日</div>
              <div className="desc">影响周计划和周复盘的划分</div>
            </div>
            <Select
              style={{ width: 120 }}
              value={String(settings.week_starts_on)}
              disabled={busy}
              options={[
                { value: "1", label: "周一" },
                { value: "0", label: "周日" },
              ]}
              onChange={(next) => {
                void run(async () => {
                  applySettings(await api.setWeekStartsOn(Number(next)));
                  notify("周起始日已保存");
                });
              }}
            />
          </div>
          <div className="setting-row">
            <div>
              <div>新手引导</div>
              <div className="desc">重新体验 5 分钟建立闭环的流程</div>
            </div>
            <Link
              className="btn sm"
              to="/onboarding"
              onClick={() => sessionStorage.removeItem(SKIP_ONBOARDING_KEY)}
            >
              重新运行
            </Link>
          </div>
          <div className="setting-row">
            <div>
              <div>每日提醒</div>
              <div className="desc">应用运行时，到点提醒今天还没标记的习惯和今日待办</div>
            </div>
            <button
              type="button"
              className={`chip ${settings.reminder_enabled ? "on" : ""}`}
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  applySettings(await api.setReminderEnabled(!settings.reminder_enabled));
                });
              }}
            >
              {settings.reminder_enabled ? "已开启" : "已关闭"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div>提醒时间</div>
              <div className="desc">24 小时制</div>
            </div>
            <input
              type="time"
              style={{ width: 140 }}
              value={settings.reminder_time}
              disabled={busy || !settings.reminder_enabled}
              onChange={(e) => {
              const value = e.target.value.slice(0, 5);
              if (!value) return;
              void run(async () => {
                applySettings(await api.setReminderTime(value));
                  notify("提醒时间已保存");
                });
              }}
            />
          </div>
        </section>
        <section className="card">
          <div className="card-title">数据与备份</div>
          <div className="setting-row">
            <div>
              <div>自动备份</div>
              <div className="desc">每天首次启动时备份一次，上次：{settings.last_backup_at ?? "尚未备份"}</div>
            </div>
            <button
              type="button"
              className={`chip ${settings.auto_backup ? "on" : ""}`}
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  applySettings(await api.setAutoBackup(!settings.auto_backup));
                });
              }}
            >
              {settings.auto_backup ? "已开启" : "已关闭"}
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div>保留备份份数</div>
              <div className="desc">超过后自动删除最旧的</div>
            </div>
            <Select
              style={{ width: 100 }}
              value={String(settings.keep_backups)}
              disabled={busy}
              options={KEEP_BACKUP_COUNTS.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(next) => {
                void run(async () => {
                  applySettings(await api.setKeepBackups(Number(next)));
                });
              }}
            />
          </div>
          <div className="setting-row">
            <div>
              <div>立即备份</div>
              <div className="desc">在备份目录生成一份快照</div>
            </div>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void backupNow()}>
              备份
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div>导出全部数据</div>
              <div className="desc">JSON 格式，可读、可迁移</div>
            </div>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void exportJson()}>
              导出 JSON
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div>从备份导入</div>
              <div className="desc">导入前会强制先备份当前数据</div>
            </div>
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => setConfirmImport(true)}
            >
              导入
            </button>
          </div>
          <div className="setting-row">
            <div>
              <div>恢复出厂</div>
              <div className="desc">清空人生数据并回到新手引导。会先自动备份，备份文件仍可导入找回。</div>
            </div>
            <button
              type="button"
              className="btn sm danger"
              disabled={busy}
              onClick={() => {
                setResetPhrase("");
                setConfirmReset(true);
              }}
            >
              恢复出厂
            </button>
          </div>
        </section>
      </div>
      <section className="card mt-16">
        <div className="card-title">同步与日历</div>
        <div className="setting-row">
          <div>
            <div>文件夹同步</div>
            <div className="desc">
              把备份快照和 JSON 复制到 OneDrive / NAS / 本机目录。当前：
              {settings.sync_dir || "未选择"}
              {settings.last_sync_at ? ` · 上次 ${settings.last_sync_at}` : ""}
            </div>
          </div>
          <div className="btn-group">
            <button
              type="button"
              className="btn sm"
              disabled={busy}
              onClick={() => {
                void run(async () => {
                  const result = await api.pickSyncDir();
                  applySettings(result.settings);
                  notify(result.path ? "同步目录已保存" : "未选择目录");
                });
              }}
            >
              选择目录
            </button>
            {settings.sync_dir ? (
              <button
                type="button"
                className="btn sm"
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    applySettings(await api.setSyncDir(""));
                    notify("已取消同步目录");
                  });
                }}
              >
                清除
              </button>
            ) : null}
            <button
              type="button"
              className="btn sm"
              disabled={busy || !settings.sync_dir}
              onClick={() => {
                void run(async () => {
                  applySettings(await api.syncNow());
                  notify("已同步到所选目录");
                });
              }}
            >
              立即同步
            </button>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div>导出日历</div>
              <div className="desc">一次性快照：本周任务 + 今天还没勾的习惯。导入后不会随软件自动更新。</div>
          </div>
          <button
            type="button"
            className="btn sm"
            disabled={busy}
            onClick={() => {
              void run(async () => {
                const result = await api.exportIcs();
                notify(result.path ? "日历已导出" : "已取消导出");
              });
            }}
          >
            导出 ICS
          </button>
        </div>
      </section>
      <section className="card mt-16">
        <div className="card-title">关于</div>
        <p className="muted small">
          人生规划 · 完整版 {health?.version ?? "1.0.0"} · 数据保存在本机。文件夹同步由你指定目录完成，不含账号云服务。安装包未做代码签名，需自行购买证书后签名。
        </p>
      </section>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onImportFile(file);
        }}
      />
      {confirmImport ? (
        <Modal onClose={() => setConfirmImport(false)}>
          <h3>从备份导入</h3>
          <p className="muted">导入会覆盖当前全部数据。系统会先自动备份当前数据，再执行导入。</p>
          <div className="modal-foot">
            <button type="button" className="btn" onClick={() => setConfirmImport(false)}>
              取消
            </button>
            <button type="button" className="btn primary" onClick={pickImportFile}>
              选择文件并导入
            </button>
          </div>
        </Modal>
      ) : null}
      {confirmReset ? (
        <Modal
          onClose={() => {
            if (busy) return;
            setConfirmReset(false);
            setResetPhrase("");
          }}
        >
          <h3>恢复出厂设置</h3>
          <p className="muted small mb-16">
            目标、任务、习惯、随记、复盘和自定义维度都会删除，主题等设置回到初始值。系统会先自动备份；输入「清空」确认。
          </p>
          <div className="field">
            <label htmlFor="factory-reset-phrase">请输入「清空」</label>
            <input
              id="factory-reset-phrase"
              value={resetPhrase}
              autoComplete="off"
              onChange={(e) => setResetPhrase(e.target.value)}
            />
          </div>
          <div className="modal-foot">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => {
                setConfirmReset(false);
                setResetPhrase("");
              }}
            >
              取消
            </button>
            <button
              type="button"
              className="btn danger"
              disabled={busy || resetPhrase.trim() !== "清空"}
              onClick={() => {
                void run(async () => {
                  const result = await api.factoryReset();
                  sessionStorage.removeItem(SKIP_ONBOARDING_KEY);
                  applySettings(result.settings);
                  await reload();
                  setConfirmReset(false);
                  setResetPhrase("");
                  notify(`已恢复出厂，当前数据备份为 ${result.file_name}`);
                  navigate("/onboarding");
                });
              }}
            >
              确认清空
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
