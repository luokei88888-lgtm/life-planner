import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtMonth } from "../shared/time";

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

function parseYearMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function MonthPicker({
  value,
  onChange,
  emptyLabel = "全部月份",
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  emptyLabel?: string;
  style?: React.CSSProperties;
}) {
  const triggerId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const selected = parseYearMonth(value);
  const [viewYear, setViewYear] = useState(() => selected?.year ?? new Date().getFullYear());

  function place() {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const width = 248;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    const top = rect.bottom + 6;
    setBox({ top, left });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    if (open) setViewYear(selected?.year ?? new Date().getFullYear());
  }, [open, selected?.year]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || panel.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <div className="menu-select" ref={root} style={style}>
      <button
        id={triggerId}
        ref={trigger}
        type="button"
        className="menu-select-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="按年月筛选"
        onClick={() => setOpen((next) => !next)}
      >
        <span className="menu-select-value">
          <span>{selected ? fmtMonth(value) : emptyLabel}</span>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && box
        ? createPortal(
            <div
              ref={panel}
              className="menu-select-panel month-picker-panel"
              role="dialog"
              aria-labelledby={triggerId}
              style={{ top: box.top, left: box.left, width: 248 }}
            >
              <div className="month-picker-year">
                <button type="button" aria-label="上一年" onClick={() => setViewYear((y) => y - 1)}>
                  ‹
                </button>
                <span>{viewYear}年</span>
                <button type="button" aria-label="下一年" onClick={() => setViewYear((y) => y + 1)}>
                  ›
                </button>
              </div>
              <div className="month-picker-grid">
                {MONTHS.map((month) => {
                  const next = `${viewYear}-${String(month).padStart(2, "0")}`;
                  return (
                    <button
                      key={month}
                      type="button"
                      className={value === next ? "on" : undefined}
                      onClick={() => {
                        onChange(next);
                        setOpen(false);
                      }}
                    >
                      {month}月
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className={`month-picker-all ${value === "" ? "on" : ""}`}
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                全部月份
              </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
