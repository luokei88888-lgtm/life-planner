import { useEffect, useRef } from "react";
import { AREA_SCORE_MAX } from "../../shared/constants";
import type { Area } from "../../shared/types";

type Props = {
  areas: Area[];
  size?: number;
  highlightId?: string | null;
  onHover?: (id: string | null) => void;
};

type Vec = { x: number; y: number; z: number };

function rgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "");
  const n = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  return [
    Number.parseInt(n.slice(0, 2), 16) || 210,
    Number.parseInt(n.slice(2, 4), 16) || 179,
    Number.parseInt(n.slice(4, 6), 16) || 110,
  ];
}

function rotate(p: Vec, rx: number, ry: number, rz: number): Vec {
  let { x, y, z } = p;
  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  let y1 = y * cx - z * sx;
  let z1 = y * sx + z * cx;
  y = y1;
  z = z1;
  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  let x2 = x * cy + z * sy;
  let z2 = -x * sy + z * cy;
  x = x2;
  z = z2;
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  return { x: x * cz - y * sz, y: x * sz + y * cz, z };
}

function project(p: Vec, dist: number, scale: number, cx: number, cy: number) {
  const depth = p.z + dist;
  const f = scale / Math.max(40, depth);
  return { x: cx + p.x * f, y: cy - p.y * f, f, depth };
}

export function RadarChart({ areas, size, highlightId = null, onHover }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;
  const highlightRef = useRef(highlightId);
  highlightRef.current = highlightId;
  const areasRef = useRef(areas);
  areasRef.current = areas;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const node = canvas;
    const brush = ctx;
    const stage = wrap;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: 0, y: 0, inside: false };
    let idle = 0;
    let raf = 0;
    let running = true;

    function polar(i: number, n: number, radius: number, y = 0): Vec {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      return { x: Math.cos(ang) * radius, y, z: Math.sin(ang) * radius };
    }

    let dim = size ?? 320;

    function ringScale(w: number) {
      return w >= 360 ? 0.38 : 0.32;
    }

    function applySize(next: number) {
      dim = Math.max(160, Math.round(next));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      node.width = Math.round(dim * dpr);
      node.height = Math.round(dim * dpr);
      node.style.width = `${dim}px`;
      node.style.height = `${dim}px`;
      brush.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function resize() {
      if (size) {
        applySize(size);
        return;
      }
      const rect = stage.getBoundingClientRect();
      applySize(Math.min(rect.width, rect.height));
    }

    function draw(now: number) {
      if (!running) return;
      const list = areasRef.current;
      const n = Math.max(list.length, 1);
      const w = dim;
      const h = dim;
      const cx = w / 2;
      const cy = h / 2 + 8;
      const R = w * ringScale(w);
      const styles = getComputedStyle(stage);
      const text = styles.getPropertyValue("--text").trim() || "#ece8dc";
      const muted = styles.getPropertyValue("--muted").trim() || "#8d97a8";
      const border = styles.getPropertyValue("--border").trim() || "rgba(201,168,106,0.2)";
      const accent = styles.getPropertyValue("--accent").trim() || "#d2b36e";

      if (!reduced) idle = now / 9000;
      const rx = 1.05 + pointer.y * 0.28;
      const ry = pointer.x * 0.55;
      const rz = reduced ? 0.15 : idle * Math.PI * 2 * 0.15 + pointer.x * 0.12;
      const dist = 420;
      const scale = 340;

      const xf = (p: Vec) => project(rotate(p, rx, ry, rz), dist, scale, cx, cy);

      brush.clearRect(0, 0, w, h);

      const floor = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
        const a = (i / 8) * Math.PI * 2;
        return xf({ x: Math.cos(a) * R * 1.05, y: -18, z: Math.sin(a) * R * 0.55 });
      });
      brush.beginPath();
      floor.forEach((p, i) => (i === 0 ? brush.moveTo(p.x, p.y) : brush.lineTo(p.x, p.y)));
      brush.closePath();
      brush.fillStyle = "rgba(0,0,0,0.22)";
      brush.fill();

      const rings = [0.35, 0.55, 0.75, 1];
      for (const t of rings) {
        brush.beginPath();
        for (let i = 0; i <= n; i++) {
          const p = xf(polar(i % n, n, R * t, 0));
          if (i === 0) brush.moveTo(p.x, p.y);
          else brush.lineTo(p.x, p.y);
        }
        brush.closePath();
        brush.strokeStyle = border;
        brush.globalAlpha = 0.55 + t * 0.2;
        brush.lineWidth = t === 1 ? 1.4 : 1;
        brush.stroke();
      }
      brush.globalAlpha = 1;

      const sweep = reduced ? 0 : (now / 2800) % (Math.PI * 2);
      const s0 = xf({ x: 0, y: 0, z: 0 });
      const s1 = xf({ x: Math.cos(sweep) * R, y: 2, z: Math.sin(sweep) * R });
      brush.beginPath();
      brush.moveTo(s0.x, s0.y);
      brush.lineTo(s1.x, s1.y);
      brush.strokeStyle = accent;
      brush.globalAlpha = 0.28;
      brush.lineWidth = 1;
      brush.stroke();
      brush.globalAlpha = 1;

      for (let i = 0; i < n; i++) {
        const outer = xf(polar(i, n, R, 0));
        brush.beginPath();
        brush.moveTo(s0.x, s0.y);
        brush.lineTo(outer.x, outer.y);
        brush.strokeStyle = border;
        brush.globalAlpha = 0.45;
        brush.stroke();
      }
      brush.globalAlpha = 1;

      if (list.length) {
        const base = list.map((a, i) => polar(i, n, ((a.score ?? 0) / AREA_SCORE_MAX) * R, 0));
        const top = list.map((a, i) => polar(i, n, ((a.score ?? 0) / AREA_SCORE_MAX) * R, 16));
        const pb = base.map(xf);
        const pt = top.map(xf);

        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          const [cr, cg, cb] = rgb(list[i].color);
          brush.beginPath();
          brush.moveTo(pb[i].x, pb[i].y);
          brush.lineTo(pt[i].x, pt[i].y);
          brush.lineTo(pt[j].x, pt[j].y);
          brush.lineTo(pb[j].x, pb[j].y);
          brush.closePath();
          brush.fillStyle = `rgba(${cr},${cg},${cb},0.16)`;
          brush.fill();
        }

        brush.beginPath();
        pt.forEach((p, i) => (i === 0 ? brush.moveTo(p.x, p.y) : brush.lineTo(p.x, p.y)));
        brush.closePath();
        const g = brush.createRadialGradient(s0.x, s0.y, 8, s0.x, s0.y, R);
        const [ar, ag, ab] = rgb(accent.startsWith("#") ? accent : "#d2b36e");
        g.addColorStop(0, `rgba(${ar},${ag},${ab},0.32)`);
        g.addColorStop(1, `rgba(${ar},${ag},${ab},0.08)`);
        brush.fillStyle = g;
        brush.fill();
        brush.strokeStyle = accent;
        brush.lineWidth = 1.8;
        brush.stroke();

        const hid = highlightRef.current;
        list.forEach((a, i) => {
          const on = hid === a.id;
          const p = pt[i];
          const [cr, cg, cb] = rgb(a.color);
          brush.beginPath();
          brush.arc(p.x, p.y, on ? 5.5 : 3.4, 0, Math.PI * 2);
          brush.fillStyle = `rgb(${cr},${cg},${cb})`;
          brush.shadowColor = `rgba(${cr},${cg},${cb},0.85)`;
          brush.shadowBlur = on ? 16 : 8;
          brush.fill();
          brush.shadowBlur = 0;
          if (on) {
            brush.beginPath();
            brush.arc(p.x, p.y, 10, 0, Math.PI * 2);
            brush.strokeStyle = `rgba(${cr},${cg},${cb},0.55)`;
            brush.lineWidth = 1;
            brush.stroke();
          }
        });

        brush.font = "11px 'Noto Sans SC', 'Microsoft YaHei', sans-serif";
        brush.textAlign = "center";
        brush.textBaseline = "middle";
        list.forEach((a, i) => {
          const label = xf(polar(i, n, R * 1.28, 10));
          const on = hid === a.id;
          brush.fillStyle = on ? text : muted;
          brush.fillText(`${a.name} ${a.score ?? "—"}`, label.x, label.y);
        });
      }

      raf = requestAnimationFrame(draw);
    }

    function local(event: PointerEvent) {
      const rect = node.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
        y: ((event.clientY - rect.top) / rect.height) * 2 - 1,
        px: event.clientX - rect.left,
        py: event.clientY - rect.top,
      };
    }

    function nearest(px: number, py: number) {
      const list = areasRef.current;
      if (!list.length) return null;
      const n = list.length;
      const w = dim;
      const cx = w / 2;
      const cy = w / 2 + 8;
      const R = w * ringScale(w);
      const rx = 1.05 + pointer.y * 0.28;
      const ry = pointer.x * 0.55;
      const rz = reduced ? 0.15 : idle * Math.PI * 2 * 0.15 + pointer.x * 0.12;
      let bestId: string | null = null;
      let bestD = 28;
      list.forEach((a, i) => {
        const p = project(rotate(polar(i, n, R * 1.05, 8), rx, ry, rz), 420, 340, cx, cy);
        const d = Math.hypot(p.x - px, p.y - py);
        if (d < bestD) {
          bestD = d;
          bestId = a.id;
        }
      });
      return bestId;
    }

    function onMove(event: PointerEvent) {
      const p = local(event);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.inside = true;
      hoverRef.current?.(nearest(p.px, p.py));
    }
    function onLeave() {
      pointer.inside = false;
      pointer.x *= 0.4;
      pointer.y *= 0.4;
      hoverRef.current?.(null);
    }

    resize();
    const observer = size ? null : new ResizeObserver(resize);
    observer?.observe(stage);
    raf = requestAnimationFrame(draw);
    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [size]);

  if (areas.length === 0) {
    return <p className="empty">还没有维度。</p>;
  }

  return (
    <div
      className="radar-stage"
      ref={wrapRef}
      style={size ? { width: size, height: size } : { width: "100%", height: "100%" }}
    >
      <canvas ref={canvasRef} className="radar-3d" aria-label="人生之轮" />
    </div>
  );
}
