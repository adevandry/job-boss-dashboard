"use client";

import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LabelList,
  Legend,
} from "recharts";

type ShiftKey = "morning" | "night" | "lightsOut";

type InputRow =
  | { day: string; morning?: number; night?: number; lightsOut?: number }
  | { date: string; morning?: number; night?: number; lightsOut?: number };

type NormalRow = {
  day: string;
  morningRaw: number;
  nightRaw: number;
  lightsOutRaw: number;

  // Plot values, we use a tiny epsilon so a “zero” still shows a minimum bar
  morningPlot: number;
  nightPlot: number;
  lightsOutPlot: number;
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

const EPS = 0.0001;

function fmtMd(value: string) {
  // Handles "2026-01-17" or "2026-01-17T08:00:00Z"
  const ymd = String(value).slice(0, 10);
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;

  const m = Number(parts[1]); // removes leading zero
  const d = Number(parts[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return ymd;

  return `${m}/${d}`;
}


function fmtLabel(v: unknown) {
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

  // Always draw something, even when height is tiny
  const safeH = Math.max(2, Number(height || 0));

  const day = payload?.day;

  return (
    <g>
      <rect
        x={x}
        y={Number(y || 0) + (safeH - Number(height || 0))}
        width={width}
        height={safeH}
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

const TOOLTIP_COLORS = {
  morning: "#3E637D",   // Day shift (navyLight)
  night: "#132A3A",     // Night shift (navy)
  lightsOut: "#FC380B", // Lights Out (orange)
};

function getNum(obj: any, key: string) {
  const v = obj?.[key];
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function TipLine({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
      <span
        style={{
          width: 10,
          height: 10,
          background: color,
          borderRadius: 2,
          display: "inline-block",
          flex: "0 0 auto",
        }}
      />
      <span style={{ color, fontSize: 13 }}>
        {label}: {value.toFixed(2)} hrs
      </span>
    </div>
  );
}

function CustomTooltip({ active, label, payload }: any) {
  if (!active || !payload?.length) return null;

  // Recharts puts the full row data on payload[0].payload
  const row = payload?.[0]?.payload ?? {};
  const day = String(row.day ?? row.date ?? label ?? "");

  // If you don’t have morningRaw/nightRaw/lightsOutRaw, this still works
  const morning = getNum(row, "morningRaw") || getNum(row, "morning");
  const night = getNum(row, "nightRaw") || getNum(row, "night");
  const lightsOut = getNum(row, "lightsOutRaw") || getNum(row, "lightsOut");

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid rgba(0,0,0,0.15)",
        borderRadius: 10,
        padding: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontWeight: 700, marginBottom: 6, color: "#132A3A" }}>
        {day}
      </div>

      <TipLine label="Day shift" value={morning} color={TOOLTIP_COLORS.morning} />
      <TipLine label="Night shift" value={night} color={TOOLTIP_COLORS.night} />
      <TipLine label="Lights out" value={lightsOut} color={TOOLTIP_COLORS.lightsOut} />
    </div>
  );
}


export default function ProductionHoursChart({
  rows,
  title = "Production Hours",
  subtitle = "Morning, Night, and Lights Out totals by day",
}: {
  rows: InputRow[];
  title?: string;
  subtitle?: string;
}) {
  const router = useRouter();

  const normalized: NormalRow[] = (Array.isArray(rows) ? rows : []).map((r: any) => {
    const day = String(r.day ?? r.date ?? "");
    const morningRaw = Number(r.morning ?? 0);
    const nightRaw = Number(r.night ?? 0);
    const lightsOutRaw = Number(r.lightsOut ?? 0);

    return {
      day,
      morningRaw,
      nightRaw,
      lightsOutRaw,
      morningPlot: morningRaw === 0 ? EPS : morningRaw,
      nightPlot: nightRaw === 0 ? EPS : nightRaw,
      lightsOutPlot: lightsOutRaw === 0 ? EPS : lightsOutRaw,
    };
  });

  function goDetails(day: string, shift: ShiftKey) {
    (document.activeElement as HTMLElement | null)?.blur();
    router.push(`/production-hours/details?day=${encodeURIComponent(day)}&shift=${shift}`);
  }

  return (
    <div className="bg-white rounded-lg shadow border">
      <div className="p-6 border-b bg-slate-50">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-slate-600 mt-1">{subtitle}</p>
      </div>

      <div className="p-6" style={{ height: 420 }}>
        {normalized.length === 0 ? (
          <p className="text-sm text-slate-500">No production data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={normalized}
              margin={{ top: 24, right: 24, left: 10, bottom: 10 }}
              barCategoryGap={14}
              barGap={6}
              style={{ outline: "none" }}
            >
              <XAxis 
              dataKey="day" 
              tickFormatter={(d) => fmtMd(String(d))}
              tickLine={false}     // removes the little tick marks
              axisLine={false}     // optional, removes the horizontal axis line too//  
              tickMargin={10}   // pushes labels away from the axis
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={renderLegend} />

              <Bar
                name="Morning Shift"
                dataKey="morningPlot"
                fill={BRAND.navyLight}
                isAnimationActive={false}
                maxBarSize={60}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="morning" radius={8} />
                )}
              >
                <LabelList dataKey="morningRaw" position="top" formatter={fmtLabel} fill={BRAND.navy} />
              </Bar>

              <Bar
                name="Evening Shift"
                dataKey="nightPlot"
                fill={BRAND.navy}
                isAnimationActive={false}
                maxBarSize={60}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="night" radius={8} />
                )}
              >
                <LabelList dataKey="nightRaw" position="top" formatter={fmtLabel} fill={BRAND.navy} />
              </Bar>

              <Bar
                name="Lights Out"
                dataKey="lightsOutPlot"
                fill={BRAND.orange}
                isAnimationActive={false}
                maxBarSize={60}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="lightsOut" radius={8} />
                )}
              >
                <LabelList dataKey="lightsOutRaw" position="top" formatter={fmtLabel} fill={BRAND.navy} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pb-4">
        <TrendingUp className="w-3 h-3" />
        Click on any bar to drill down into daily details
      </div>
    </div>
  );
}
