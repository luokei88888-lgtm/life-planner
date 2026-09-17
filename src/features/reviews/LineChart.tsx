export function LineChart({
  points,
  width = 340,
  height = 160,
}: {
  points: { v: number; label: string }[];
  width?: number;
  height?: number;
}) {
  if (!points.length) return null;
  const padL = 28;
  const padB = 22;
  const padT = 10;
  const padR = 30;
  const iw = width - padL - padR;
  const ih = height - padT - padB;
  const x = (i: number) => padL + (points.length === 1 ? iw / 2 : (i * iw) / (points.length - 1));
  const y = (v: number) => padT + ih - ((v - 1) / 9) * ih;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.v)}`).join(" ");
  return (
    <svg className="line" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <line className="axis" x1={padL} y1={padT} x2={padL} y2={padT + ih} />
      <line className="axis" x1={padL} y1={padT + ih} x2={width - padR} y2={padT + ih} />
      <text x={padL - 6} y={y(10)} textAnchor="end" dominantBaseline="middle">
        10
      </text>
      <text x={padL - 6} y={y(1)} textAnchor="end" dominantBaseline="middle">
        1
      </text>
      <path className="path" d={path} />
      {points.map((p, i) => (
        <g key={`${p.label}-${i}`}>
          <circle className="pt" cx={x(i)} cy={y(p.v)} r={3} />
          <text x={x(i)} y={height - 6} textAnchor="middle">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
