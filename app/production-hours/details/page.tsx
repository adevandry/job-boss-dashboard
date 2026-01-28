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

  workCode?: string | null; // may exist, we safely ignore if missing
  comments?: string | null;
};

const SWISS_WORK_CENTERS = [
  10, 100, 101, 102, 103, 1001, 1010, 8001, 9104, 9106, 9108, 9110,
];

const EXCLUDED_EMPLOYEE_CODES = new Set(["1041", "1441", "106"]); // Yolanda, Emelio, Eliseo

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

  if (s === "morning" || s === "day" || s === "shift1" || s === "shift 1" || s === "1") return "morning";
  if (s === "night" || s === "evening" || s === "shift3" || s === "shift 3" || s === "3") return "night";
  if (s === "lightsout" || s === "lights out" || s === "tony") return "lightsOut";

  return null;
}

function shiftLabel(s: ShiftKey | null) {
  if (s === "morning") return "Morning";
  if (s === "night") return "Evening";
  if (s === "lightsOut") return "Lights Out";
  return "";
}

function toNum(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function empCodeStr(r: JB2DetailRow) {
  return String(r.employeeCode ?? "").trim();
}

function isSwissRow(r: JB2DetailRow) {
  const wc = toNum(r.workCenter);
  if (!SWISS_WORK_CENTERS.includes(wc)) return false;

  const emp = empCodeStr(r);
  if (EXCLUDED_EMPLOYEE_CODES.has(emp)) return false;

  // JobBOSS report excludes REWORK. If workCode exists, honor it.
  const workCode = String(r.workCode ?? "").trim().toUpperCase();
  if (workCode === "REWORK") return false;

  return true;
}

// Per your rule: "Actual production hours = machineHours"
// Special case: Lights Out (9999) sometimes stores "hours per part" in machineHours, multiply by pieces.
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

function sum(vals: Array<number>) {
  let total = 0;
  for (const v of vals) total += v || 0;
  return total;
}

async function fetchDayRows(params: { baseUrl: string; startIso: string; endIso: string }) {
  const take = 1000;
  let skip = 0;
  const all: JB2DetailRow[] = [];

  while (true) {
    // Use the same filter style you use on the main page,
    // so the API route has the best chance of filtering server-side.
    const qs = new URLSearchParams();

    qs.append("filters[workCenter][in]", SWISS_WORK_CENTERS.join("|"));
    qs.append("filters[ticketDate][gte]", params.startIso);
    qs.append("filters[ticketDate][lte]", params.endIso);
    qs.append("sort", "ticketDate");

    // Keep paging controls if your API supports them
    qs.append("take", String(take));
    qs.append("skip", String(skip));

    const url = `${params.baseUrl}/api/time-tickets?${qs.toString()}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as any;

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
    !Number.isNaN(Date.parse(day + "T00:00:00Z"));

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

  const allRows = await fetchDayRows({ baseUrl, startIso, endIso });

  // Safeguard filters, even if API already filtered
  const swissRows = allRows.filter(isSwissRow);

  // Apply shift rules
  let rows = swissRows;

  if (shift === "lightsOut") {
    rows = swissRows.filter((r) => toNum(r.shift) === 3 && empCodeStr(r) === "9999");
  } else if (shift === "night") {
    rows = swissRows.filter((r) => toNum(r.shift) === 3 && empCodeStr(r) !== "9999");
  } else if (shift === "morning") {
    rows = swissRows.filter((r) => toNum(r.shift) === 1 && empCodeStr(r) !== "9999");
  }

  const totalClock = sum(rows.map((r) => toNum(r.manHours)));
  const totalMach = sum(rows.map((r) => toNum(r.machineHours)));
  const totalProd = sum(rows.map((r) => getProductionHours(r)));

  return (
    <div style={{ padding: 16 }}>
      <h1>Production Hours, Details</h1>
      <div>Day: {day}</div>
      <div>Shift: {shiftLabel(shift)}</div>

      <div style={{ marginTop: 10 }}>
        Tickets: {rows.length}
        {", "}
        Total Production Hrs: {totalProd.toFixed(2)}
        {", "}
        Total Mach Hrs: {totalMach.toFixed(2)}
        {", "}
        Total Clock Hrs: {totalClock.toFixed(2)}
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
            <th style={{ padding: "8px 6px" }}>WC</th>
            <th style={{ padding: "8px 6px" }}>Op</th>
            <th style={{ padding: "8px 6px" }}>Clock Hrs</th>
            <th style={{ padding: "8px 6px" }}>Mach Hrs</th>
            <th style={{ padding: "8px 6px" }}>Good</th>
            <th style={{ padding: "8px 6px" }}>Scrap</th>
            <th style={{ padding: "8px 6px" }}>Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
              <td style={{ padding: "8px 6px" }}>{String(r.ticketDate ?? "").slice(11, 19)}</td>
              <td style={{ padding: "8px 6px" }}>
                {r.employeeName ?? ""} ({empCodeStr(r)})
              </td>
              <td style={{ padding: "8px 6px" }}>{r.jobNumber ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{toNum(r.workCenter) || ""}</td>
              <td style={{ padding: "8px 6px" }}>{r.operationNumber ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{toNum(r.manHours).toFixed(2)}</td>
              <td style={{ padding: "8px 6px" }}>{toNum(r.machineHours).toFixed(2)}</td>
              <td style={{ padding: "8px 6px" }}>{r.piecesFinished ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{r.piecesScrapped ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{r.comments ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
