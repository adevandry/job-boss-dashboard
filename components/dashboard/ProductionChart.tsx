"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type ProductionRow = {
  date: string;
  morning?: number;
  night?: number;
  lightsOut?: number;
};

export default function ProductionChart({
  data,
  onChartClick,
}: {
  data: ProductionRow[];
  onChartClick?: (date: string) => void;
}) {
  const safe = Array.isArray(data) ? data : [];

  const normalized = safe.map((r) => ({
    date: r.date,
    morning: Number(r.morning ?? 0),
    night: Number(r.night ?? 0),
    lightsOut: Number(r.lightsOut ?? 0),
  }));

  return (
    <div className="bg-white rounded-lg shadow border">
      <div className="p-6 border-b bg-slate-50">
        <h2 className="text-lg font-bold">Production Hours</h2>
        <p className="text-sm text-slate-600 mt-1">
          Morning, Night, and Lights Out totals by day
        </p>
      </div>

      <div className="p-6" style={{ height: 360 }}>
        {normalized.length === 0 ? (
          <p className="text-sm text-slate-500">No production data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={normalized} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(v: any) => `${Number(v || 0).toFixed(2)} hrs`} />
              <Legend />
              <Bar dataKey="morning" name="Morning" stackId="a" />
              <Bar dataKey="night" name="Night" stackId="a" />
              <Bar dataKey="lightsOut" name="Lights Out" stackId="a" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
