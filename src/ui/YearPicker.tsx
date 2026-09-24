import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

function decadeStart(year: number) {
  return Math.floor(year / 10) * 10;
}

function decadeYears(start: number) {
  return Array.from({ length: 10 }, (_, i) => start + i);
}

export function YearPicker({
  value,
  onChange,
  style,
}: {
  value: number;
  onChange: (year: number) => void;
  style?: React.CSSProperties;
}) {
  const triggerId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number } | null>(null);
  const [viewStart, setViewStart] = useState(() => decadeStart(value));

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
    if (open) setViewStart(decadeStart(value));
  }, [open, value]);

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
        aria-label="按年筛选"
        onClick={() => setOpen((next) => !next)}
      >
        <span className="menu-select-value">
          <span>{value}</span>
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
                <button
                  type="button"
                  aria-label="上一个十年"
                  onClick={() => setViewStart((start) => start - 10)}
                >
                  ‹
                </button>
                <span>
                  {viewStart}–{viewStart + 9}
                </span>
                <button
                  type="button"
                  aria-label="下一个十年"
                  onClick={() => setViewStart((start) => start + 10)}
                >
                  ›
                </button>
              </div>
              <div className="year-picker-grid">
                {decadeYears(viewStart).map((year) => (
                  <button
                    key={year}
                    type="button"
                    className={value === year ? "on" : undefined}
                    onClick={() => {
                      onChange(year);
                      setOpen(false);
                    }}
                  >
                    {year}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
