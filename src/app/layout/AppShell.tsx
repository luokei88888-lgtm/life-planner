import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { listen } from "@tauri-apps/api/event";
import { api, ApiError } from "../../lib/api";
import { NAV, THEMES, type ThemeId } from "../../shared/constants";
import { Select } from "../../ui/Select";
import { Modal } from "../../ui/Modal";
import { useApp } from "../AppContext";

export function AppShell() {
  const { settings, error, toast, reminder, dismissReminder, applySettings, notify } = useApp();
  const location = useLocation();
  const [closeAsk, setCloseAsk] = useState(false);
  const [rememberClose, setRememberClose] = useState(false);
  const [closeBusy, setCloseBusy] = useState(false);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen("close-asked", () => {
      setRememberClose(false);
      setCloseAsk(true);
    })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {
        /* 浏览器预览没有窗口关闭事件 */
      });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    let timer = 0;
    function onScroll(event: Event) {
      const node = event.target;
      if (!(node instanceof HTMLElement)) return;
      if (
        !node.matches(
          ".main, .nav, .modal, .drawer, .home-today-list, .emoji-grid, .menu-select-panel",
        )
      ) {
        return;
      }
      node.classList.add("is-scrolling");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => node.classList.remove("is-scrolling"), 800);
    }
    document.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("scroll", onScroll, true);
      window.clearTimeout(timer);
    };
  }, []);

  async function chooseClose(action: "tray" | "quit") {
    setCloseBusy(true);
    try {
      if (rememberClose) {
        applySettings(await api.setCloseBehavior(action));
      }
      if (action === "tray") {
        await api.hideToTray();
        setCloseAsk(false);
      } else {
        await api.quitApp();
      }
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "无法完成关闭");
    } finally {
      setCloseBusy(false);
    }
  }

  return (
    <>
      <div className="grain" aria-hidden="true" />
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div>
              <div className="brand-name">人生规划</div>
              <div className="brand-sub">Atelier · 观测台</div>
            </div>
          </div>
          <nav className="nav">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => (isActive ? "active" : undefined)}
              >
                <i />
                {item.label}
              </NavLink>
            ))}
            <div className="nav-spacer" />
            <NavLink
              to="/settings"
              className={({ isActive }) => (isActive ? "active" : undefined)}
            >
              <i />
              设置
            </NavLink>
          </nav>
          <div className="sidebar-foot">
            <ThemePicker />
          </div>
        </aside>
        <main
          className="main"
          key={location.pathname}
          onPointerMove={(event) => {
            const node = event.currentTarget;
            const box = node.getBoundingClientRect();
            node.style.setProperty("--px", String((event.clientX - box.left) / Math.max(1, box.width)));
            node.style.setProperty("--py", String((event.clientY - box.top) / Math.max(1, box.height)));
          }}
        >
          <div className="main-haze" aria-hidden="true" />
          {error ? <div className="banner warn">{error}</div> : null}
          {reminder ? (
            <div className="banner warn">
              <div>
                <b>{reminder.title}</b>
                {reminder.body ? ` · ${reminder.body}` : ""}
              </div>
              <button type="button" className="btn sm" onClick={dismissReminder}>
                知道了
              </button>
            </div>
          ) : null}
          <Outlet />
        </main>
      </div>
      {toast ? (
        <div id="toast-root">
          <div className="toast">{toast}</div>
        </div>
      ) : null}
      {closeAsk ? (
        <Modal onClose={() => { if (!closeBusy) setCloseAsk(false); }}>
          <h3>关闭窗口</h3>
          <p className="muted">隐藏后程序还在托盘里，点图标可以再打开。退出才是真正关掉。</p>
          <label className="check-line">
            <input
              type="checkbox"
              checked={rememberClose}
              disabled={closeBusy}
              onChange={(e) => setRememberClose(e.target.checked)}
            />
            下次不再询问
          </label>
          <div className="modal-foot">
            <button className="btn" type="button" disabled={closeBusy} onClick={() => setCloseAsk(false)}>
              取消
            </button>
            <button
              className="btn danger"
              type="button"
              disabled={closeBusy}
              onClick={() => void chooseClose("quit")}
            >
              退出程序
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={closeBusy}
              onClick={() => void chooseClose("tray")}
            >
              隐藏到托盘
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}

function ThemePicker() {
  const { settings, setTheme } = useApp();
  return (
    <div className="theme-picker">
      <div className="muted small">主题</div>
      <Select
        aria-label="主题"
        value={settings.theme}
        placement="up"
        options={THEMES.map((theme) => ({ value: theme.id, label: theme.name }))}
        onChange={(next) => {
          void setTheme(next as ThemeId);
        }}
      />
    </div>
  );
}
