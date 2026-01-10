"use client";

import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";

type Row = {
  day: string;
  morning: number;
  night: number;
  lightsOut: number;
};

const BRAND = {
  orange: "#FC380B",
  navy: "#132A3A",
  navyLight: "#3E637D",
};

const LEGEND_ITEMS = [
  { key: "morning", label: "Morning Shift", color: BRAND.navyLight },
  { key: "night", label: "Evening Shift", color: BRAND.navy },
  { key: "lightsOut", label: "Lights Out", color: BRAND.orange },
];

const RADIUS: [number, number, number, number] = [8, 8, 0, 0];

function fmt(v: unknown) {
  const n = Number(v) || 0;
  if (n < 0.1) return "";
  return n.toFixed(1);
}

function renderLegend() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 16, paddingTop: 10 }}>
      {LEGEND_ITEMS.map((item) => (
        <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              background: item.color,
              borderRadius: 2,
              display: "inline-block",
            }}
          />
          <span style={{ color: BRAND.navy }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ClickableBar(props: any) {
    const { x, y, width, height, fill, payload, onGo, shiftKey, radius = 8 } = props;
  
    // skip empty bars
    if (!height || height <= 0) return null;
  
    const day = payload?.day;
  
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={fill}
          rx={radius}
          ry={radius}
          tabIndex={-1}
          style={{ cursor: "pointer", outline: "none" }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            if (day) onGo(day, shiftKey);
          }}
        />
      </g>
    );
  }

export default function ProductionHoursChart({ rows }: { rows: Row[] }) {
  const router = useRouter();
  // TEMP TEST BUTTON, remove after it works
// If this button works, routing is fine and the issue was the bar click data shape

function goDetails(day: string, shift: "morning" | "night" | "lightsOut") {
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(`/production-hours/details?day=${encodeURIComponent(day)}&shift=${shift}`);
  }

  return (
    <div
  style={{
    width: "100%",
    height: 380,
    outline: "none",
  }}
>
      <ResponsiveContainer>
        <BarChart
          data={rows}
          margin={{ top: 20, right: 20, left: 0, bottom: 0 }}
          barCategoryGap={40}
          barGap={2}
          style={{ outline: "none" }}
        >
          <XAxis dataKey="day" tickFormatter={(d) => String(d).slice(5)} />
          <YAxis />
          <Tooltip formatter={(v: any) => Number(v).toFixed(2)} />
          <Legend content={renderLegend} />

          <Bar
  name="Morning Shift"
  dataKey="morning"
  fill={BRAND.navyLight}
  isAnimationActive={false}
  shape={(p: any) => (
    <ClickableBar {...p} onGo={goDetails} shiftKey="morning" radius={8} />
  )}
>
  <LabelList dataKey="morning" position="top" formatter={fmt} fill={BRAND.navy} />
</Bar>

<Bar
  name="Evening Shift"
  dataKey="night"
  fill={BRAND.navy}
  isAnimationActive={false}
  shape={(p: any) => (
    <ClickableBar {...p} onGo={goDetails} shiftKey="night" radius={8} />
  )}
>
  <LabelList dataKey="night" position="top" formatter={fmt} fill={BRAND.navy} />
</Bar>

<Bar
  name="Lights Out"
  dataKey="lightsOut"
  fill={BRAND.orange}
  isAnimationActive={false}
  shape={(p: any) => (
    <ClickableBar {...p} onGo={goDetails} shiftKey="lightsOut" radius={8} />
  )}
>
  <LabelList dataKey="lightsOut" position="top" formatter={fmt} fill={BRAND.navy} />
</Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{ textAlign: "center", color: BRAND.navy, marginTop: 6, fontSize: 12 }}>
        Click a bar to drill down
        <button
  onClick={() => router.push("/production-hours/details?day=2026-01-07&shift=morning")}
  style={{ marginTop: 8, padding: "6px 10px", cursor: "pointer" }}
>
  Test drilldown
</button>
      </div>
    </div>
  );
}
