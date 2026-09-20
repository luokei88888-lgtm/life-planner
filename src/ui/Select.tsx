import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  swatch?: string;
  group?: string;
};

type Placement = "auto" | "down" | "up";

export function Select({
  id,
  value,
  options,
  onChange,
  disabled = false,
  className,
  style,
  placement = "auto",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  placement?: Placement;
  "aria-label"?: string;
}) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const current = options.find((option) => option.value === value);

  function place() {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const maxHeight = 240;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp =
      placement === "up" || (placement === "auto" && spaceBelow < 160 && spaceAbove > spaceBelow);
    const height = Math.min(maxHeight, Math.max(120, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? Math.max(8, rect.top - 6 - height) : rect.bottom + 6;
    const width = Math.max(rect.width, 140);
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
    setBox({ top, left, width, maxHeight: height });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, options, placement, value]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (root.current?.contains(target) || menu.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    }
    function onReposition() {
      place();
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onReposition);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, placement]);

  return (
    <div className={`menu-select ${className ?? ""}`.trim()} ref={root} style={style}>
      <button
        id={triggerId}
        ref={trigger}
        type="button"
        className="menu-select-trigger"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => {
          if (!disabled) setOpen((next) => !next);
        }}
      >
        <span className="menu-select-value">
          {current?.swatch ? <i className="menu-select-swatch" style={{ background: current.swatch }} /> : null}
          <span>{current?.label ?? "请选择"}</span>
        </span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && box
        ? createPortal(
            <ul
              ref={menu}
              className="menu-select-panel"
              role="listbox"
              aria-labelledby={triggerId}
              style={{
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
              }}
            >
              {options.map((option, index) => {
                const prev = options[index - 1];
                const showGroup = Boolean(option.group) && option.group !== prev?.group;
                return (
                  <li key={option.value || "__empty"} role="none">
                    {showGroup ? (
                      <div className="menu-select-group" role="presentation">
                        {option.group}
                      </div>
                    ) : null}
                    <button
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      className={option.value === value ? "on" : undefined}
                      disabled={option.disabled}
                      onClick={() => {
                        if (option.disabled) return;
                        onChange(option.value);
                        setOpen(false);
                      }}
                    >
                      {option.swatch ? (
                        <i className="menu-select-swatch" style={{ background: option.swatch }} />
                      ) : null}
                      {option.label}
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
