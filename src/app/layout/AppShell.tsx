import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { NAV, THEMES, type ThemeId } from "../../shared/constants";
import { Select } from "../../ui/Select";
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
