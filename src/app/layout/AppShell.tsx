import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV, THEMES, type ThemeId } from "../../shared/constants";
import { useApp } from "../AppContext";

export function AppShell() {
  const { settings, error, toast, reminder, dismissReminder } = useApp();
  const location = useLocation();

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

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
        <main className="main" key={location.pathname}>
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
          {toast ? <div id="toast-root"><div className="toast">{toast}</div></div> : null}
    </>
  );
}

function ThemePicker() {
  const { settings, setTheme } = useApp();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === settings.theme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="theme-picker" ref={root}>
      <div className="muted small">主题</div>
      <button
        type="button"
        className="theme-current"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{current.name}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <ul className="theme-menu" role="listbox" aria-label="主题">
          {THEMES.map((theme) => (
            <li key={theme.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={theme.id === settings.theme}
                className={theme.id === settings.theme ? "on" : undefined}
                onClick={() => {
                  void setTheme(theme.id as ThemeId);
                  setOpen(false);
                }}
              >
                {theme.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
