import type { Area } from "../../shared/types";

export function RadarChart({ areas, size }: { areas: Area[]; size: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 40;
  const n = Math.max(areas.length, 1);
  const pt = (i: number, value: number) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const rr = (Math.max(0, Math.min(10, value)) / 10) * r;
    return [cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr] as const;
  };
  const poly = (value: number) =>
    areas.map((_, i) => pt(i, value).join(",")).join(" ");

  if (areas.length === 0) {
    return <p className="empty">还没有维度。</p>;
  }

  return (
    <svg className="radar" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {[2, 4, 6, 8, 10].map((v) => (
        <polygon key={v} className="ring" points={poly(v)} />
      ))}
      {areas.map((_, i) => {
        const [x, y] = pt(i, 10);
        return <line key={i} className="axis" x1={cx} y1={cy} x2={x} y2={y} />;
      })}
      <polygon className="data" points={areas.map((a, i) => pt(i, a.score ?? 0).join(",")).join(" ")} />
      {areas.map((a, i) => {
        const [x, y] = pt(i, a.score ?? 0);
        return <circle key={a.id} className="pt" cx={x} cy={y} r={3} />;
      })}
      {areas.map((a, i) => {
        const [x, y] = pt(i, 12.6);
        return (
          <text key={`${a.id}-label`} x={x} y={y} textAnchor="middle" dominantBaseline="middle">
            {a.name} {a.score ?? "-"}
          </text>
        );
      })}
    </svg>
  );
}
