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
  comboRaw: number;
  lightsOutRaw: number;
  morningPlot: number;
  nightPlot: number;
  comboPlot: number;
  lightsOutPlot: number;
};

const BRAND = {
  morning: "#3E637D",
  night: "#294152",
  combo: "#0A1A26",
  lightsOut: "#FC380B",
};

const LEGEND_ITEMS = [
  { key: "morning", label: "Morning Shift", color: BRAND.morning },
  { key: "night", label: "Night Shift", color: BRAND.night },
  { key: "combo", label: "Morning + Night", color: BRAND.combo },
  { key: "lightsOut", label: "Lights Out", color: BRAND.lightsOut },
];

const EPS = 0.0001;

function fmtMd(value: string) {
  const ymd = String(value).slice(0, 10);
  const parts = ymd.split("-");
  if (parts.length !== 3) return ymd;

  const m = Number(parts[1]);
  const d = Number(parts[2]);
  if (!Number.isFinite(m) || !Number.isFinite(d)) return ymd;

  return `${m}/${d}`;
}

function renderValueLabel(props: any) {
  const { x, y, width, value } = props;

  const v = Number(value);
  const n = Number.isFinite(v) ? v : 0;

  const ZERO_THRESHOLD = 0.05;
  const isZeroish = Math.abs(n) < ZERO_THRESHOLD;

  return (
    <text
      x={x + width / 2}
      y={isZeroish ? y - 14 : y - 6}
      textAnchor="middle"
      fill="#132A3A"
      fontSize={16}
      fontWeight={600}
    >
      {isZeroish ? "0" : n.toFixed(1)}
    </text>
  );
}

function renderLegend() {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 16, paddingTop: 10, flexWrap: "wrap" }}>
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
          <span style={{ color: "#132A3A" }}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ClickableBar(props: any) {
  const { x, y, width, height, fill, payload, onGo, shiftKey } = props;

  const MIN_CLICK_HEIGHT = 8;
  const safeH = Math.max(MIN_CLICK_HEIGHT, Number(height || 0));
  const baseY = Number(y || 0) - (safeH - Number(height || 0));
  const day = payload?.day;

  const r = Math.min(8, width / 2, safeH);

  const path = `
    M ${x} ${baseY + safeH}
    L ${x} ${baseY + r}
    Q ${x} ${baseY} ${x + r} ${baseY}
    L ${x + width - r} ${baseY}
    Q ${x + width} ${baseY} ${x + width} ${baseY + r}
    L ${x + width} ${baseY + safeH}
    Z
  `;

  return (
    <g>
      <path
        d={path}
        fill={fill}
        style={{ cursor: shiftKey ? "pointer" : "default", outline: "none" }}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (day && shiftKey) onGo(day, shiftKey);
        }}
      />
    </g>
  );
}

const TOOLTIP_COLORS = {
  morning: BRAND.morning,
  night: BRAND.night,
  combo: BRAND.combo,
  lightsOut: BRAND.lightsOut,
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

  const row = payload?.[0]?.payload ?? {};
  const day = String(row.day ?? row.date ?? label ?? "");

  const morning = getNum(row, "morningRaw");
  const night = getNum(row, "nightRaw");
  const combo = getNum(row, "comboRaw");
  const lightsOut = getNum(row, "lightsOutRaw");

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

      <TipLine label="Morning shift" value={morning} color={TOOLTIP_COLORS.morning} />
      <TipLine label="Night shift" value={night} color={TOOLTIP_COLORS.night} />
      <TipLine label="Morning + Night" value={combo} color={TOOLTIP_COLORS.combo} />
      <TipLine label="Lights Out" value={lightsOut} color={TOOLTIP_COLORS.lightsOut} />
    </div>
  );
}

export default function ProductionHoursChart({
  rows,
  title = "Production Hours (Estimated Hours)",
  subtitle = "Swiss only. Estimated hours by day for Morning, Night, Morning + Night combined, and Lights Out.",
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
    const comboRaw = morningRaw + nightRaw;
    const lightsOutRaw = Number(r.lightsOut ?? 0);

    return {
      day,
      morningRaw,
      nightRaw,
      comboRaw,
      lightsOutRaw,
      morningPlot: morningRaw === 0 ? EPS : morningRaw,
      nightPlot: nightRaw === 0 ? EPS : nightRaw,
      comboPlot: comboRaw === 0 ? EPS : comboRaw,
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

      <div className="p-6" style={{ height: 440 }}>
        {normalized.length === 0 ? (
          <p className="text-sm text-slate-500">No production data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={normalized}
              margin={{ top: 24, right: 24, left: 10, bottom: 10 }}
              barCategoryGap={14}
              barGap={4}
              style={{ outline: "none" }}
            >
              <XAxis
                dataKey="day"
                tickFormatter={(d) => fmtMd(String(d))}
                tickLine={false}
                axisLine={false}
                tickMargin={10}
              />
              <YAxis />
              <Tooltip content={<CustomTooltip />} />
              <Legend content={renderLegend} />

              <Bar
                name="Morning Shift"
                dataKey="morningPlot"
                fill={BRAND.morning}
                isAnimationActive={false}
                maxBarSize={44}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="morning" />
                )}
              >
                <LabelList dataKey="morningRaw" content={renderValueLabel} />
              </Bar>

              <Bar
                name="Night Shift"
                dataKey="nightPlot"
                fill={BRAND.night}
                isAnimationActive={false}
                maxBarSize={44}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="night" />
                )}
              >
                <LabelList dataKey="nightRaw" content={renderValueLabel} />
              </Bar>

              <Bar
                name="Morning + Night"
                dataKey="comboPlot"
                fill={BRAND.combo}
                isAnimationActive={false}
                maxBarSize={44}
                shape={(p: any) => <ClickableBar {...p} onGo={() => {}} shiftKey={undefined} />}
              >
                <LabelList dataKey="comboRaw" content={renderValueLabel} />
              </Bar>

              <Bar
                name="Lights Out"
                dataKey="lightsOutPlot"
                fill={BRAND.lightsOut}
                isAnimationActive={false}
                maxBarSize={44}
                shape={(p: any) => (
                  <ClickableBar {...p} onGo={goDetails} shiftKey="lightsOut" />
                )}
              >
                <LabelList dataKey="lightsOutRaw" content={renderValueLabel} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pb-4">
        <TrendingUp className="w-3 h-3" />
        Click on any shift bar to drill down into daily details
      </div>
    </div>
  );
}