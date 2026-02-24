"use client";

import React, { useEffect, useMemo, useState } from "react";
import ProductionHoursChart from "@/components/dashboard/ProductionHoursChart";


type DateRange = {
  startDate: string;
  endDate: string;
};

type TimeTicket = {
  employeeCode?: number | string;
  employeeName?: string;
  shift?: number | string;
  ticketDate?: string;
  manHours?: number;
  machineHours?: number;
  piecesFinished?: number;
  piecesScrapped?: number;
  workCenter?: number;
};

type ProductionRow = {
  date: string; // YYYY-MM-DD
  morning: number;
  night: number;
  lightsOut: number;
};

const SWISS_WORK_CENTERS = [
  10, 100, 101, 102, 103, 1001, 1010, 8001, 9104, 9106, 9108, 9110,
];

// Put these in app/page.tsx, under SWISS_WORK_CENTERS, above Home()

const EXCLUDED_EMPLOYEE_CODES = new Set(["1041", "1441", "106"]); // Yolanda, Emelio, Eliseo

function isSwissDepartmentTicket(t: any) {
  const empCode = String(t.employeeCode ?? "").trim();
  if (EXCLUDED_EMPLOYEE_CODES.has(empCode)) return false;

  return SWISS_WORK_CENTERS.includes(Number(t.workCenter));
}

// Production Hours = machineHours (matches DeKing's definition of Actual Hours)
function getProductionActualHours(t: any) {
  return Number(t.machineHours || 0);
}

// Estimated (expected) production hours from cycle time
// If you want "good only" for estimated hours, use good instead of totalPieces.
function getProductionEstimatedHours(t: any) {
  const good = Number(t.piecesFinished || 0);
  const cycle = Number(t.cycleTime || 0); // hours per part, per your brother
  return good * cycle;
}

function toLocalYmd(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function dateRangeDays(startYmd: string, endYmd: string) {
  const out: string[] = [];
  const start = new Date(`${startYmd}T00:00:00`);
  const end = new Date(`${endYmd}T00:00:00`);
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    out.push(toLocalYmd(d));
  }
  return out;
}

function getCustomShift(t: TimeTicket) {
  const shift = Number(t.shift);
  const emp = String(t.employeeCode ?? "").trim();

  if (shift === 1) return "morning";
  if (shift === 3) return emp === "9999" ? "lightsOut" : "night";

  // David: do not use 2
  return null;
}

function getClockHours(t: TimeTicket) {
  const emp = String(t.employeeCode ?? "").trim();
  const man = Number(t.manHours || 0);
  const machine = Number(t.machineHours || 0);

  // Lights Out, use machine hours if present, otherwise fall back
  if (emp === "9999") return machine || man || 0;

  return man;
}

function transformToProductionHours(
  tickets: TimeTicket[],
  startDate: string,
  endDate: string
): ProductionRow[] {
  // Create a row for every day in the range, even if zero
  const days = dateRangeDays(startDate, endDate);
  const grouped: Record<string, ProductionRow> = {};

  for (const day of days) {
    grouped[day] = { date: day, morning: 0, night: 0, lightsOut: 0 };
  }

  for (const t of tickets) {
    const date = t.ticketDate?.split("T")[0];
    if (!date) continue;
    if (!grouped[date]) continue;
  
    const hours = getProductionActualHours(t);
    const cs = getCustomShift(t);
  
    if (!cs) continue; // skips shift 2
  
    if (cs === "morning") grouped[date].morning += hours;
    else if (cs === "night") grouped[date].night += hours;
    else if (cs === "lightsOut") grouped[date].lightsOut += hours;
  }

  return days
  .map((d) => grouped[d])
  .filter((r) => (r.morning + r.night + r.lightsOut) > 0);
}

export default function Page() {
  const [dateRange, setDateRange] = useState<DateRange>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const end = addDays(today, -1);
    const start = addDays(end, -6);

    return { startDate: toLocalYmd(start), endDate: toLocalYmd(end) };
  });

  const rangeLabel = useMemo(
    () => `${dateRange.startDate} to ${dateRange.endDate}`,
    [dateRange]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [productionRows, setProductionRows] = useState<ProductionRow[]>([]);

  async function fetchTimeTickets() {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      params.append("filters[workCenter][in]", SWISS_WORK_CENTERS.join("|"));
      params.append("filters[ticketDate][gte]", dateRange.startDate);
      params.append("filters[ticketDate][lte]", dateRange.endDate);
      params.append("sort", "ticketDate");

      const res = await fetch(`/api/time-tickets?${params.toString()}`, {
        cache: "no-store",
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`API error (${res.status}): ${msg}`);
      }

      const data = await res.json();

      const tickets: TimeTicket[] = Array.isArray(data)
        ? data
        : Array.isArray(data.Data)
        ? data.Data
        : Array.isArray(data.data)
        ? data.data
        : [];

        console.log("First 5 tickets:", tickets.slice(0, 5));
console.log(
  "Shift values found:",
  Array.from(new Set(tickets.map((t: any) => t.shift))).sort()
);

      // Safeguard filter in case upstream ignores filters
      const swissTickets = tickets.filter((t: any) => isSwissDepartmentTicket(t));

      console.log(
        "Shift values in range:",
        Array.from(new Set(tickets.map((t: any) => Number(t.shift)).filter(Boolean))).sort()
      );

      const rows = transformToProductionHours(
        swissTickets,
        dateRange.startDate,
        dateRange.endDate
      );

      setProductionRows(rows);
    } catch (e: any) {
      setError(e?.message || "Unknown error");
      setProductionRows(
        transformToProductionHours([], dateRange.startDate, dateRange.endDate)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchTimeTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange.startDate, dateRange.endDate]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b shadow-sm">
        <div className="max-w-[1600px] mx-auto p-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
            <h1 className="text-2xl font-bold">Production Dashboard</h1>
              <p>Real-time manufacturing analytics and insights, custom-made for DeKing Precision</p>
              <p className="text-sm text-slate-600 mt-1">{rangeLabel}</p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="date"
                className="border rounded px-3 py-2"
                value={dateRange.startDate}
                onChange={(e) =>
                  setDateRange((p) => ({ ...p, startDate: e.target.value }))
                }
              />
              <input
                type="date"
                className="border rounded px-3 py-2"
                value={dateRange.endDate}
                onChange={(e) =>
                  setDateRange((p) => ({ ...p, endDate: e.target.value }))
                }
              />
              <button
                onClick={fetchTimeTickets}
                disabled={loading}
                className="px-4 py-2 rounded text-white bg-[#3E637D] hover:bg-[#0F2230] disabled:opacity-60 disabled:cursor-not-allowed">
                {loading ? "Loading..." : "Refresh"}
            </button>
            </div>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <KpiCard title="Department Efficiency">
            <KpiRow label="Morning Shift" value="-" />
            <KpiRow label="Night Shift" value="-" />
            <KpiRow label="Lights Out" value="-" />
          </KpiCard>

          <KpiCard title="Quality Rating">
            <div className="text-4xl font-bold">-</div>
            <p className="text-sm text-slate-600 mt-2">- good / - scrap</p>
          </KpiCard>

          <KpiCard title="On Time Delivery">
            <KpiRow label="Target" value="95%" />
            <KpiRow label="FYTD" value="-" />
            <KpiRow label="Last Month" value="-" />
          </KpiCard>
        </div>

        <ProductionHoursChart
  rows={productionRows.map((r) => ({
    day: r.date, // chart expects "day"
    morning: r.morning ?? 0,
    night: r.night ?? 0,
    lightsOut: r.lightsOut ?? 0,
  }))}
/>

        <Section title="Job Data">
          <div className="text-slate-500">Table placeholder</div>
        </Section>

        <Section title="Employee Data">
          <div className="text-slate-500">Table placeholder</div>
        </Section>
      </main>
    </div>
  );
}

function KpiCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border">
      <h3 className="text-sm text-slate-600 mb-4">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function KpiRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm text-slate-700">
      <span>{label}</span>
      <span className="text-lg font-bold text-indigo-600">{value}</span>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-lg shadow border">
      <div className="p-6 border-b bg-slate-50">
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}
