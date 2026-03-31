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

type RoutingRow = {
  jobNumber?: string | null;
  stepNumber?: number | null;
  StepNo?: number | null;
  StepNumber?: number | null;

  workCenter?: string | number | null;
  WorkCenter?: string | number | null;
  workCenterNumber?: number | null;
  WorkCenterNumber?: number | null;

  operationNumber?: number | null;
  OperationNumber?: number | null;
  operationNo?: number | null;
  OperationNo?: number | null;

  cycleTime?: number | null;
  CycleTime?: number | null;

  cycleUnit?: string | null;
  CycleUnit?: string | null;

  setupTime?: number | null;
  SetupTime?: number | null;

  timeUnit?: string | null;
  TimeUnit?: string | null;

  percentEfficient?: number | null;
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

function rNum(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function rStr(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
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

  if (shift === 1) return "morning" as const;
  if (shift === 3) return emp === "9999" ? "lightsOut" as const : "night" as const;

  return null;
}

function parseJobNumber(jobNumber: string) {
  const m = jobNumber.match(/^(\d+)-(\d+)$/);
  if (!m) return null;

  const orderNumber = m[1];
  const itemNumber = parseInt(m[2], 10);

  if (!Number.isFinite(itemNumber)) return null;
  return { orderNumber, itemNumber };
}

function routingWorkCenterNumber(rr: any): number {
  const wcRaw = rStr(rr, ["workCenter", "WorkCenter"]);
  if (wcRaw) {
    const m = wcRaw.match(/^(\d+)\s*-/);
    if (m) return Number(m[1]) || 0;
  }

  return rNum(rr, ["workCenterNumber", "WorkCenterNumber", "workCenter", "WorkCenter"]);
}

function routingOpNumber(rr: any): number {
  return rNum(rr, ["operationNumber", "OperationNumber", "operationNo", "OperationNo"]);
}

function routingStepNumber(rr: any): number {
  return rNum(rr, ["stepNumber", "StepNo", "StepNumber"]);
}

function getStepNo(rr: RoutingRow | null) {
  return rNum(rr, ["StepNo", "stepNumber", "StepNumber"]);
}

function pickRoutingRowForTicket(ticket: TimeTicket, routingRows: RoutingRow[]) {
  if (!routingRows.length) return null;

  const ticketWC = toNum(ticket.workCenter);
  const ticketOp = toNum(ticket.operationNumber);

  if (ticketWC > 0 && ticketOp > 0) {
    const exact = routingRows.find(
      (rr: any) => routingWorkCenterNumber(rr) === ticketWC && routingOpNumber(rr) === ticketOp
    );
    if (exact) return exact;
  }

  if (ticketWC > 0) {
    const wcMatches = routingRows.filter((rr: any) => routingWorkCenterNumber(rr) === ticketWC);
    if (wcMatches.length) {
      wcMatches.sort((a: any, b: any) => routingStepNumber(a) - routingStepNumber(b));
      return wcMatches[0];
    }
  }

  const copy = [...routingRows];
  copy.sort((a: any, b: any) => routingStepNumber(a) - routingStepNumber(b));
  return copy[0] ?? null;
}

function getSetupHours(rr: RoutingRow | null) {
  const setupTime = rNum(rr, ["setupTime", "SetupTime"]);
  const setupUnit = rStr(rr, ["timeUnit", "TimeUnit"]).trim().toUpperCase();

  if (setupTime <= 0) return 0;
  if (setupUnit === "M") return setupTime / 60;
  if (setupUnit === "S") return setupTime / 3600;
  return setupTime;
}

function computeRunHours(parts: number, rr: RoutingRow | null) {
  if (!rr || parts <= 0) return 0;

  const cycleTime = rNum(rr, ["cycleTime", "CycleTime"]);
  const cycleUnit = rStr(rr, ["cycleUnit", "CycleUnit", "timeUnit", "TimeUnit"]).trim().toUpperCase();
  const percentEfficient = rNum(rr, ["percentEfficient"]);

  if (cycleTime <= 0 || percentEfficient <= 0) return 0;

  const eff = percentEfficient / 100;

  if (cycleUnit === "S") return (parts * cycleTime) / (3600 * eff);
  if (cycleUnit === "M") return (parts * cycleTime) / (60 * eff);
  if (cycleUnit === "H") return (parts * cycleTime) / eff;
  if (cycleUnit === "P") return parts / (cycleTime * eff);

  return 0;
}

function buildRunBucketKey(date: string, shift: string, ticket: TimeTicket, rr: RoutingRow | null) {
  const job = String(ticket.jobNumber ?? "").trim();
  const emp = String(ticket.employeeCode ?? "").trim();
  const wc = toNum(ticket.workCenter) || routingWorkCenterNumber(rr);
  const op = toNum(ticket.operationNumber) || routingOpNumber(rr);
  const step = getStepNo(rr) || routingStepNumber(rr);

  return `${date}__${shift}__${job}__${emp}__${wc}__${op}__${step}`;
}

function buildSetupDedupKey(date: string, shift: string, ticket: TimeTicket, rr: RoutingRow | null) {
  const job = String(ticket.jobNumber ?? "").trim();
  const wc = toNum(ticket.workCenter) || routingWorkCenterNumber(rr);
  const op = toNum(ticket.operationNumber) || routingOpNumber(rr);
  const step = getStepNo(rr) || routingStepNumber(rr);

  return `${date}__${shift}__${job}__${wc}__${op}__${step}`;
}

async function fetchOrderRoutingsForJob(jobNumber: string): Promise<RoutingRow[]> {
  const parsed = parseJobNumber(jobNumber);
  if (!parsed) return [];

  const { orderNumber, itemNumber } = parsed;

  const qs = new URLSearchParams();
  qs.set("take", "500");
  qs.set("filters[orderNumber][eq]", orderNumber);
  qs.set("filters[itemNumber][eq]", String(itemNumber));
  qs.set(
    "fields",
    [
      "jobNumber",
      "itemNumber",
      "stepNumber",
      "workCenter",
      "cycleTime",
      "cycleUnit",
      "setupTime",
      "timeUnit",
      "percentEfficient",
    ].join(",")
  );

  const res = await fetch(`/api/order-routing?${qs.toString()}`, {
    cache: "no-store",
  });

  if (!res.ok) return [];

  const payload = await res.json();
  return Array.isArray(payload?.Data) ? payload.Data : [];
}

async function transformToProductionHours(
  tickets: TimeTicket[],
  startDate: string,
  endDate: string
): Promise<ProductionRow[]> {
  const days = dateRangeDays(startDate, endDate);
  const grouped: Record<string, ProductionRow> = {};

  for (const day of days) {
    grouped[day] = { date: day, morning: 0, night: 0, lightsOut: 0 };
  }

  const swissTickets = tickets.filter((t: any) => isSwissDepartmentTicket(t));

  const uniqueJobNumbers = Array.from(
    new Set(
      swissTickets
        .map((t: any) => String(t.jobNumber ?? "").trim())
        .filter(Boolean)
    )
  );

  const routingRowsByJob: Record<string, RoutingRow[]> = {};

  if (uniqueJobNumbers.length) {
    const pairs = await Promise.all(
      uniqueJobNumbers.map(async (jobNumber) => {
        const routingRows = await fetchOrderRoutingsForJob(jobNumber);
        return [jobNumber, routingRows] as const;
      })
    );

    for (const [jobNumber, routingRows] of pairs) {
      routingRowsByJob[jobNumber] = routingRows;
    }
  }

  const runBuckets = new Map<
    string,
    {
      date: string;
      shift: "morning" | "night" | "lightsOut";
      partsToday: number;
      routingRow: RoutingRow | null;
    }
  >();

  swissTickets.forEach((t) => {
    const date = t.ticketDate?.split("T")[0];
    if (!date || !grouped[date]) return;

    const shift = getCustomShift(t);
    if (!shift) return;

    const jobNumber = String(t.jobNumber ?? "").trim();
    const rr = jobNumber ? pickRoutingRowForTicket(t, routingRowsByJob[jobNumber] ?? []) : null;

    const parts = toNum(t.piecesFinished) + toNum(t.piecesScrapped);
    const key = buildRunBucketKey(date, shift, t, rr);

    const existing = runBuckets.get(key);
    if (existing) {
      existing.partsToday += parts;
      if (!existing.routingRow && rr) existing.routingRow = rr;
      return;
    }

    runBuckets.set(key, {
      date,
      shift,
      partsToday: parts,
      routingRow: rr,
    });
  });

  for (const bucket of runBuckets.values()) {
    const est = computeRunHours(bucket.partsToday, bucket.routingRow);
    grouped[bucket.date][bucket.shift] += est;
  }
  
  // Match the drilldown logic for setup counting
  const employeeCodesByStep = new Map<string, Set<string>>();
  const hasProductionByStep = new Map<string, boolean>();
  
  swissTickets.forEach((t) => {
    const date = t.ticketDate?.split("T")[0];
    if (!date || !grouped[date]) return;
  
    const shift = getCustomShift(t);
    if (!shift) return;
  
    const jobNumber = String(t.jobNumber ?? "").trim();
    const rr = jobNumber ? pickRoutingRowForTicket(t, routingRowsByJob[jobNumber] ?? []) : null;
  
    const stepKey = buildSetupDedupKey(date, shift, t, rr);
    const empCode = String(t.employeeCode ?? "").trim();
    const parts = toNum(t.piecesFinished) + toNum(t.piecesScrapped);
  
    if (!employeeCodesByStep.has(stepKey)) {
      employeeCodesByStep.set(stepKey, new Set<string>());
    }
    employeeCodesByStep.get(stepKey)!.add(empCode);
  
    if (parts > 0) {
      hasProductionByStep.set(stepKey, true);
    }
  });
  
  const countedSetupKeys = new Set<string>();
  
  swissTickets.forEach((t) => {
    const date = t.ticketDate?.split("T")[0];
    if (!date || !grouped[date]) return;
  
    const shift = getCustomShift(t);
    if (!shift) return;
  
    const jobNumber = String(t.jobNumber ?? "").trim();
    const rr = jobNumber ? pickRoutingRowForTicket(t, routingRowsByJob[jobNumber] ?? []) : null;
  
    const parts = toNum(t.piecesFinished) + toNum(t.piecesScrapped);
    const setupEst = getSetupHours(rr);
    const isSetupRow = parts <= 0 && setupEst > 0;
  
    if (!isSetupRow) return;
  
    const setupKey = buildSetupDedupKey(date, shift, t, rr);
    if (countedSetupKeys.has(setupKey)) return;
  
    const employeeCount = employeeCodesByStep.get(setupKey)?.size ?? 0;
    const stepHasProduction = hasProductionByStep.get(setupKey) ?? false;
  
    const shouldCountSetup = !stepHasProduction || employeeCount > 1;
    if (!shouldCountSetup) return;
  
    countedSetupKeys.add(setupKey);
    grouped[date][shift] += setupEst;
  });

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

      const rows = await transformToProductionHours(
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
