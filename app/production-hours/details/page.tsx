import { headers } from "next/headers";

type ShiftKey = "morning" | "night" | "lightsOut";

type JB2DetailRow = {
  ticketDate?: string | null;
  shift?: number | null;

  employeeCode?: number | string | null;
  employeeName?: string | null;

  jobNumber?: string | null;
  workCenter?: number | string | null;
  operationNumber?: number | string | null;

  manHours?: number | string | null;
  machineHours?: number | string | null;

  piecesFinished?: number | string | null;
  piecesScrapped?: number | string | null;

  workCode?: string | null;
  comments?: string | null;
};

type RoutingRow = {
  JobNo?: string | null;
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

  CycleTime?: number | null;
  cycleTime?: number | null;

  CycleUnit?: string | null;
  cycleUnit?: string | null;

  SetupTime?: number | null;
  setupTime?: number | null;

  SetupUnit?: string | null;
  setupUnit?: string | null;

  EstimQty?: number | null;
  estimatedQuantity?: number | null;

  TimeUnit?: string | null;
  timeUnit?: string | null;

  TotActHrs?: number | null;
  TotalActHrs?: number | null;
  totalActualHours?: number | null;

  TotEstHrs?: number | null;
  TotalEstHrs?: number | null;
  totalEstimatedHours?: number | null;

  TotHrsLeft?: number | null;
  TotalHrsLeft?: number | null;
  totalHoursLeft?: number | null;

  Total?: number | null;
  total?: number | null;

  percentEfficient?: number | null;
};

type EstimateBucket = {
  key: string;
  jobNumber: string;
  employeeCode: string;
  employeeName: string;
  workCenter: number;
  operationNumber: number;
  stepNumber: number;
  partsToday: number;
  actualToday: number;
  clockToday: number;
  ticketIndexes: number[];
  routingRow: RoutingRow | null;

  hasSetupRow: boolean;
  hasProductionRow: boolean;
  setupDedupKey: string;
};

const SWISS_WORK_CENTERS = [10, 100, 101, 102, 103, 1001, 1010, 8001, 9104, 9106, 9108, 9110];
const EXCLUDED_EMPLOYEE_CODES = new Set(["1041", "1441", "106"]);

function buildSetupDedupKey(ticket: JB2DetailRow, rr: RoutingRow | null) {
  const job = String(ticket.jobNumber ?? "").trim();
  const wc = toNum(ticket.workCenter) || routingWorkCenterNumber(rr);
  const op = toNum(ticket.operationNumber) || routingOpNumber(rr);
  const step = getStepNo(rr) || routingStepNumber(rr);

  return `${job}__${wc}__${op}__${step}`;
}

function getSetupHours(rr: RoutingRow | null) {
  const setupTime = rNum(rr, ["setupTime", "SetupTime"]);
  const setupUnit = rStr(rr, ["timeUnit", "TimeUnit", "setupUnit", "SetupUnit"]).trim().toUpperCase();

  if (setupTime <= 0) return 0;
  if (setupUnit === "M") return setupTime / 60;
  if (setupUnit === "S") return setupTime / 3600;
  return setupTime;
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

function sum(vals: number[]) {
  let total = 0;
  for (const v of vals) total += v || 0;
  return total;
}

function parseJobNumber(jobNumber: string) {
  const m = jobNumber.match(/^(\d+)-(\d+)$/);
  if (!m) return null;

  const orderNumber = m[1];
  const itemNumber = parseInt(m[2], 10);

  if (!Number.isFinite(itemNumber)) return null;
  return { orderNumber, itemNumber };
}

function toJB2DateTimeZ(d: Date) {
  return d.toISOString().replace(".000Z", "Z");
}

function dayRangeUTC(day: string) {
  const y = Number(day.slice(0, 4));
  const m = Number(day.slice(5, 7)) - 1;
  const d = Number(day.slice(8, 10));

  const start = new Date(Date.UTC(y, m, d, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d, 23, 59, 59));

  return { startIso: toJB2DateTimeZ(start), endIso: toJB2DateTimeZ(end) };
}

function normalizeShift(raw: string | undefined): ShiftKey | null {
  if (!raw) return null;
  const s = decodeURIComponent(raw).trim().toLowerCase();

  if (s === "morning" || s === "day" || s === "shift1" || s === "shift 1" || s === "1") {
    return "morning";
  }

  if (s === "night" || s === "evening" || s === "shift3" || s === "shift 3" || s === "3") {
    return "night";
  }

  if (s === "lightsout" || s === "lights out" || s === "tony") {
    return "lightsOut";
  }

  return null;
}

function shiftLabel(s: ShiftKey | null) {
  if (s === "morning") return "Morning";
  if (s === "night") return "Evening";
  if (s === "lightsOut") return "Lights Out";
  return "";
}

function empCodeStr(r: JB2DetailRow) {
  return String(r.employeeCode ?? "").trim();
}

function isSwissRow(r: JB2DetailRow) {
  const wc = toNum(r.workCenter);
  if (!SWISS_WORK_CENTERS.includes(wc)) return false;

  const emp = empCodeStr(r);
  if (EXCLUDED_EMPLOYEE_CODES.has(emp)) return false;

  const workCode = String(r.workCode ?? "").trim().toUpperCase();
  if (workCode === "REWORK") return false;

  return true;
}

function getProductionHours(r: JB2DetailRow) {
  const emp = empCodeStr(r);
  const machine = toNum(r.machineHours);

  const good = toNum(r.piecesFinished);
  const scrap = toNum(r.piecesScrapped);
  const totalPieces = good + scrap;

  if (emp === "9999" && totalPieces > 0 && machine > 0 && machine < 1) {
    return totalPieces * machine;
  }

  return machine;
}

function getCycleTime(rr: RoutingRow | null) {
  return rNum(rr, ["CycleTime", "cycleTime"]);
}

function getCycleUnit(rr: RoutingRow | null) {
  return rStr(rr, ["CycleUnit", "cycleUnit", "TimeUnit", "timeUnit"]);
}

function getSetupTime(rr: RoutingRow | null) {
  return rNum(rr, ["SetupTime", "setupTime"]);
}

function getSetupUnit(rr: RoutingRow | null) {
  return rStr(rr, ["SetupUnit", "setupUnit", "TimeUnit", "timeUnit"]);
}

function getEstimQty(rr: RoutingRow | null) {
  return rNum(rr, ["EstimQty", "estimatedQuantity"]);
}

function getTotActHrs(rr: RoutingRow | null) {
  return rNum(rr, ["TotActHrs", "TotalActHrs", "totalActualHours"]);
}

function getTotal(rr: RoutingRow | null) {
  return rNum(rr, ["Total", "total"]);
}

function getTotEstHrs(rr: RoutingRow | null) {
  return rNum(rr, ["TotEstHrs", "TotalEstHrs", "totalEstimatedHours"]);
}

function getTotHrsLeft(rr: RoutingRow | null) {
  return rNum(rr, ["TotHrsLeft", "TotalHrsLeft", "totalHoursLeft"]);
}

function getTimeUnit(rr: RoutingRow | null) {
  return rStr(rr, ["TimeUnit", "timeUnit"]);
}

function getStepNo(rr: RoutingRow | null) {
  return rNum(rr, ["StepNo", "stepNumber", "StepNumber"]);
}

function unitToHours(value: number, unit: string) {
  const u = String(unit || "").trim().toUpperCase();

  if (u === "M") return value / 60;
  if (u === "S") return value / 3600;
  return value;
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

function pickRoutingRowForTicket(ticket: JB2DetailRow, routingRows: RoutingRow[]) {
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

function buildBucketKey(ticket: JB2DetailRow, rr: RoutingRow | null) {
  const job = String(ticket.jobNumber ?? "").trim();
  const emp = empCodeStr(ticket);
  const wc = toNum(ticket.workCenter) || routingWorkCenterNumber(rr);
  const op = toNum(ticket.operationNumber) || routingOpNumber(rr);
  const step = getStepNo(rr) || routingStepNumber(rr);

  return `${job}__${emp}__${wc}__${op}__${step}`;
}

function getJobEfficiency(rr: RoutingRow | null) {
  return rNum(rr, ["percentEfficient"]);
}

function computeBucketEstimate(bucket: EstimateBucket) {
  const rr = bucket.routingRow;
  if (!rr) return 0;

  const totalParts = bucket.partsToday;
  if (totalParts <= 0) return 0;

  const cycleTime = rNum(rr, ["cycleTime", "CycleTime"]);
  const cycleUnit = rStr(rr, ["cycleUnit", "CycleUnit", "timeUnit", "TimeUnit"]).trim().toUpperCase();
  const percentEfficient = rNum(rr, ["percentEfficient"]);

  if (cycleTime <= 0 || percentEfficient <= 0) return 0;

  const eff = percentEfficient / 100;

  if (cycleUnit === "S") return (totalParts * cycleTime) / (3600 * eff);
  if (cycleUnit === "M") return (totalParts * cycleTime) / (60 * eff);
  if (cycleUnit === "H") return (totalParts * cycleTime) / eff;
  if (cycleUnit === "P") return totalParts / (cycleTime * eff);

  return 0;
}

async function fetchDayRows(params: {
  baseUrl: string;
  startIso: string;
  endIso: string;
  cookie?: string;
}) {
  const take = 1000;
  let skip = 0;
  const all: JB2DetailRow[] = [];

  while (true) {
    const qs = new URLSearchParams();

    qs.append("filters[workCenter][in]", SWISS_WORK_CENTERS.join("|"));
    qs.append("filters[ticketDate][gte]", params.startIso);
    qs.append("filters[ticketDate][lte]", params.endIso);
    qs.append("sort", "ticketDate");
    qs.append("take", String(take));
    qs.append("skip", String(skip));

    const url = `${params.baseUrl}/api/time-tickets?${qs.toString()}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: params.cookie ? { cookie: params.cookie } : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed: ${res.status} ${text}`);
    }

    const json = await res.json();

    const page: JB2DetailRow[] = Array.isArray(json)
      ? json
      : Array.isArray(json.Data)
      ? json.Data
      : Array.isArray(json.data)
      ? json.data
      : [];

    all.push(...page);

    if (page.length < take) break;
    skip += take;
  }

  return all;
}

async function fetchOrderRoutingsForJob(params: {
  baseUrl: string;
  jobNumber: string;
  cookie?: string;
}) {  
  const parsed = parseJobNumber(params.jobNumber);
  if (!parsed) return [] as RoutingRow[];

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
      "estimatedQuantity",
      "totalActualHours",
      "totalEstimatedHours",
      "totalHoursLeft",
      "percentEfficient",
      "actualPiecesGood",
      "actualPiecesScrap",
    ].join(",")
  );

  const res = await fetch(`${params.baseUrl}/api/order-routing?${qs.toString()}`, {
    cache: "no-store",
    headers: params.cookie ? { cookie: params.cookie } : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("order-routing fetch failed", res.status, text);
    return [] as RoutingRow[];
  }

  const payload = await res.json();
  return Array.isArray(payload?.Data) ? (payload.Data as RoutingRow[]) : [];
}

export default async function ProductionHoursDetailsPage({
  searchParams,
}: {
  searchParams:
    | Promise<{ day?: string; date?: string; shift?: string }>
    | { day?: string; date?: string; shift?: string };
}) {
  const sp = await Promise.resolve(searchParams);

  const rawDay = sp.day ?? sp.date ?? "";
  const rawDayStr = decodeURIComponent(String(rawDay)).trim();
  const day = rawDayStr.slice(0, 10);

  const isValidDay =
    day.length === 10 &&
    day[4] === "-" &&
    day[7] === "-" &&
    !Number.isNaN(Date.parse(`${day}T00:00:00Z`));

  if (!isValidDay) {
    return (
      <div style={{ padding: 16 }}>
        <h1>Production Hours, Details</h1>
        <div>Missing or invalid day.</div>
        <div style={{ marginTop: 8 }}>Got: {rawDayStr || "(empty)"}</div>
        <div style={{ marginTop: 8 }}>Expected: YYYY-MM-DD</div>
      </div>
    );
  }

  const shift = normalizeShift(sp.shift);
  const { startIso, endIso } = dayRangeUTC(day);

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const allRows = await fetchDayRows({
    baseUrl,
    startIso,
    endIso,
    cookie: h.get("cookie") ?? "",
  });  
  const swissRows = allRows.filter(isSwissRow);

  let rows = swissRows;

  if (shift === "lightsOut") {
    rows = swissRows.filter((r) => toNum(r.shift) === 3 && empCodeStr(r) === "9999");
  } else if (shift === "night") {
    rows = swissRows.filter((r) => toNum(r.shift) === 3 && empCodeStr(r) !== "9999");
  } else if (shift === "morning") {
    rows = swissRows.filter((r) => toNum(r.shift) === 1 && empCodeStr(r) !== "9999");
  }

  const totalClock = sum(rows.map((r) => toNum(r.manHours)));
  const totalActual = sum(rows.map((r) => getProductionHours(r)));

  const uniqueJobNumbers = Array.from(
    new Set(
      rows
        .map((r) => String(r.jobNumber ?? "").trim())
        .filter(Boolean)
    )
  );

  const routingRowsByJob: Record<string, RoutingRow[]> = {};

  if (uniqueJobNumbers.length) {
    const pairs = await Promise.all(
      uniqueJobNumbers.map(async (jobNumber) => {
        const routingRows = await fetchOrderRoutingsForJob({
          baseUrl,
          jobNumber,
          cookie: h.get("cookie") ?? "",
        });        
        return [jobNumber, routingRows] as const;
      })
    );

    for (const [jobNumber, routingRows] of pairs) {
      routingRowsByJob[jobNumber] = routingRows;
    }
  }

  const rowRoutingMatches: Array<RoutingRow | null> = rows.map((r) => {
    const jobNumber = String(r.jobNumber ?? "").trim();
    const jobRoutingRows = jobNumber ? routingRowsByJob[jobNumber] ?? [] : [];
    return pickRoutingRowForTicket(r, jobRoutingRows);
  });

  const bucketsByKey = new Map<string, EstimateBucket>();

  rows.forEach((r, idx) => {
    const jobNumber = String(r.jobNumber ?? "").trim();
    if (!jobNumber) return;
  
    const rr = rowRoutingMatches[idx];
    const key = buildBucketKey(r, rr);
  
    const rowParts = toNum(r.piecesFinished) + toNum(r.piecesScrapped);
    const rowClock = toNum(r.manHours);

    const setupEst = getSetupHours(rr);
    const isSetupRow = rowParts <= 0 && setupEst > 0;
    const isProductionRow = rowParts > 0;
  
    const existing = bucketsByKey.get(key);
  
    if (existing) {
      existing.partsToday += rowParts;
      existing.actualToday += getProductionHours(r);
      existing.clockToday += rowClock;
      existing.ticketIndexes.push(idx);
      existing.hasSetupRow = existing.hasSetupRow || isSetupRow;
      existing.hasProductionRow = existing.hasProductionRow || isProductionRow;
      if (!existing.routingRow && rr) existing.routingRow = rr;
      return;
    }
  
    bucketsByKey.set(key, {
      key,
      jobNumber,
      employeeCode: empCodeStr(r),
      employeeName: String(r.employeeName ?? "").trim(),
      workCenter: toNum(r.workCenter) || routingWorkCenterNumber(rr),
      operationNumber: toNum(r.operationNumber) || routingOpNumber(rr),
      stepNumber: getStepNo(rr) || routingStepNumber(rr),
      partsToday: rowParts,
      actualToday: getProductionHours(r),
      clockToday: rowClock,
      ticketIndexes: [idx],
      routingRow: rr,
      hasSetupRow: isSetupRow,
      hasProductionRow: isProductionRow,
      setupDedupKey: buildSetupDedupKey(r, rr),
    });
  });

let totalEstimatedHours = 0;
const estimateByRowIndex: Record<number, number> = {};
const showEstimateOnRowIndex = new Set<number>();

// Track how many employees touched each step, and whether that step had production
const employeeCodesByStep = new Map<string, Set<string>>();
const hasProductionByStep = new Map<string, boolean>();

for (const bucket of bucketsByKey.values()) {
  const stepKey = bucket.setupDedupKey;

  if (!employeeCodesByStep.has(stepKey)) {
    employeeCodesByStep.set(stepKey, new Set<string>());
  }
  employeeCodesByStep.get(stepKey)!.add(bucket.employeeCode);

  if (bucket.partsToday > 0) {
    hasProductionByStep.set(stepKey, true);
  }
}

// 1) Production run-hours from buckets only
for (const bucket of bucketsByKey.values()) {
  const runEst = computeBucketEstimate(bucket);
  totalEstimatedHours += runEst;

  const firstRowIndex = bucket.ticketIndexes[0];
  if (typeof firstRowIndex === "number") {
    estimateByRowIndex[firstRowIndex] = (estimateByRowIndex[firstRowIndex] ?? 0) + runEst;
    showEstimateOnRowIndex.add(firstRowIndex);
  }
}

// 2) Setup-hours from raw setup rows, but only when:
//    - the step had no production at all, OR
//    - the step was worked by more than one employee
const countedSetupKeys = new Set<string>();

rows.forEach((r, idx) => {
  const rr = rowRoutingMatches[idx];

  const rowParts = toNum(r.piecesFinished) + toNum(r.piecesScrapped);
  const setupEst = getSetupHours(rr);
  const isSetupRow = rowParts <= 0 && setupEst > 0;

  if (!isSetupRow) return;

  const setupKey = buildSetupDedupKey(r, rr);
  if (countedSetupKeys.has(setupKey)) return;

  const employeeCount = employeeCodesByStep.get(setupKey)?.size ?? 0;
  const stepHasProduction = hasProductionByStep.get(setupKey) ?? false;

  const shouldCountSetup = !stepHasProduction || employeeCount > 1;
  if (!shouldCountSetup) return;

  countedSetupKeys.add(setupKey);
  totalEstimatedHours += setupEst;

  estimateByRowIndex[idx] = (estimateByRowIndex[idx] ?? 0) + setupEst;
  showEstimateOnRowIndex.add(idx);
});

  return (
    <div style={{ padding: 16 }}>
      <h1>Production Hours, Details</h1>
      <div>Day: {day}</div>
      <div>Shift: {shiftLabel(shift)}</div>

      <div style={{ marginTop: 10 }}>
        Tickets: {rows.length}, Total Estimated Hrs: {totalEstimatedHours.toFixed(3)}, Total Actual Hrs:{" "}
        {totalActual.toFixed(3)}, Total Clock Hrs: {totalClock.toFixed(2)}
      </div>

      {rows.length === 0 ? (
        <div style={{ marginTop: 16 }}>No tickets found for this day and shift.</div>
      ) : null}

<table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
  <thead>
    <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
      <th style={{ padding: "8px 6px" }}>Time</th>
      <th style={{ padding: "8px 6px" }}>Employee</th>
      <th style={{ padding: "8px 6px" }}>Job</th>
      <th style={{ padding: "8px 6px" }}>CycleUnit</th>
      <th style={{ padding: "8px 6px" }}>PercentEff</th>
      <th style={{ padding: "8px 6px" }}>Est Hrs</th>
      <th style={{ padding: "8px 6px" }}>WC</th>
      <th style={{ padding: "8px 6px" }}>Op</th>
      <th style={{ padding: "8px 6px" }}>Clock Hrs</th>
      <th style={{ padding: "8px 6px" }}>Mach Hrs</th>
      <th style={{ padding: "8px 6px" }}>Good</th>
      <th style={{ padding: "8px 6px" }}>Scrap</th>
      <th style={{ padding: "8px 6px" }}>CycleTime</th>
      <th style={{ padding: "8px 6px", verticalAlign: "bottom" }}>
        <div>Total Quantity Required to Produce Including Scrap</div>
        <div style={{ fontSize: "12px", fontWeight: 400, color: "#666", marginTop: 2 }}>
          EstimQty
        </div>
      </th>
      <th style={{ padding: "8px 6px" }}>TotActHrs</th>
      <th style={{ padding: "8px 6px" }}>Total</th>
      <th style={{ padding: "8px 6px" }}>TotEstHrs</th>
      <th style={{ padding: "8px 6px" }}>TotHrsLeft</th>
      <th style={{ padding: "8px 6px" }}>TimeUnit</th>
      <th style={{ padding: "8px 6px" }}>StepNo</th>
      <th style={{ padding: "8px 6px" }}>SetupTime</th>
      <th style={{ padding: "8px 6px" }}>Comments</th>
    </tr>
  </thead>
  <tbody>
    {rows.map((r, idx) => {
      const rr = rowRoutingMatches[idx];
      const showEst = showEstimateOnRowIndex.has(idx);
      const est = showEst ? estimateByRowIndex[idx] ?? 0 : null;

      return (
        <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
          <td style={{ padding: "8px 6px" }}>{String(r.ticketDate ?? "").slice(11, 19)}</td>
          <td style={{ padding: "8px 6px" }}>
            {r.employeeName ?? ""} ({empCodeStr(r)})
          </td>
          <td style={{ padding: "8px 6px" }}>{r.jobNumber ?? ""}</td>
          <td style={{ padding: "8px 6px" }}>
            {rStr(rr, ["cycleUnit", "CycleUnit", "timeUnit", "TimeUnit"])}
          </td>
          <td style={{ padding: "8px 6px" }}>{rNum(rr, ["percentEfficient"]) || ""}</td>
          <td style={{ padding: "8px 6px" }}>{est == null ? "" : est.toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{toNum(r.workCenter) || ""}</td>
          <td style={{ padding: "8px 6px" }}>{r.operationNumber ?? ""}</td>
          <td style={{ padding: "8px 6px" }}>{toNum(r.manHours).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{toNum(r.machineHours).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{r.piecesFinished ?? ""}</td>
          <td style={{ padding: "8px 6px" }}>{r.piecesScrapped ?? ""}</td>
          <td style={{ padding: "8px 6px" }}>{getCycleTime(rr).toFixed(4)}</td>
          <td style={{ padding: "8px 6px" }}>{getEstimQty(rr) || ""}</td>
          <td style={{ padding: "8px 6px" }}>{getTotActHrs(rr).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{getTotal(rr).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{getTotEstHrs(rr).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{getTotHrsLeft(rr).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{getTimeUnit(rr)}</td>
          <td style={{ padding: "8px 6px" }}>{getStepNo(rr) || ""}</td>
          <td style={{ padding: "8px 6px" }}>{getSetupTime(rr).toFixed(2)}</td>
          <td style={{ padding: "8px 6px" }}>{r.comments ?? ""}</td>
        </tr>
      );
    })}
  </tbody>
</table>
    </div>
  );
}