import type { CSSProperties } from "react";
import { NOTE_KIND_COLOR, NOTE_KIND_LABEL, type NoteKind } from "../../shared/constants";

function KindIcon({ kind }: { kind: NoteKind }) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };
  if (kind === "diary") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="13" height="18" rx="1" />
        <path d="M9 3v18M12 8h5M12 12h5" />
      </svg>
    );
  }
  if (kind === "vent") {
    return (
      <svg {...common}>
        <path d="M4 6h16v10H8l-4 4V6z" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M12 2v6M12 16v6M2 12h6M16 12h6M6 6l3.5 3.5M14.5 14.5L18 18M18 6l-3.5 3.5M6 18l3.5-3.5" />
    </svg>
  );
}

export function NoteKindTag({ kind }: { kind: string }) {
  const known = kind === "insight" || kind === "diary" || kind === "vent" ? kind : null;
  const label = known ? NOTE_KIND_LABEL[known] : kind;
  return (
    <span
      className={`tag kind-mark ${known ? "toned" : ""} kind-${kind}`}
      title={label}
      style={
        known
          ? ({ ["--kind-color"]: NOTE_KIND_COLOR[known] } as CSSProperties)
          : undefined
      }
    >
      {known ? <KindIcon kind={known} /> : null}
      {label}
    </span>
  );
}
