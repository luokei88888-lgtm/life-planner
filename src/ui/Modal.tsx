import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

export function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const downOnMask = useRef(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      className="modal-mask"
      onPointerDown={(event) => {
        downOnMask.current = event.target === event.currentTarget;
      }}
      onPointerUp={(event) => {
        if (event.target === event.currentTarget && downOnMask.current) onClose();
        downOnMask.current = false;
      }}
    >
      <div className="modal" role="dialog" aria-modal="true">
        {children}
      </div>
    </div>,
    document.body,
  );
}
