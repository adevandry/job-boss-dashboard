import { headers } from "next/headers";

type ShiftKey = "morning" | "night" | "lightsOut";

type JB2DetailRow = {
  ticketDate?: string | null;
  shift?: number | null;

  employeeCode?: number | null;
  employeeName?: string | null;

  jobNumber?: string | null;
  workCenter?: number | null;
  operationNumber?: number | null;

  manHours?: number | null;
  machineHours?: number | null;

  piecesFinished?: number | null;
  piecesScrapped?: number | null;

  cycleTime?: number | null; // JobBOSS appears to return this in minutes per part

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
  if (s === "night") return "Night";
  if (s === "lightsOut") return "Lights Out";
  return "";
}

async function fetchDayRows(params: { baseUrl: string; startIso: string; endIso: string }) {
  const take = 1000;
  let skip = 0;
  const all: JB2DetailRow[] = [];

  while (true) {
    const qs = new URLSearchParams({
      "ticketDate[gte]": params.startIso,
      "ticketDate[lte]": params.endIso,
      take: String(take),
      skip: String(skip),
    });

    const url = `${params.baseUrl}/api/time-tickets?${qs.toString()}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Fetch failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { Data?: JB2DetailRow[]; data?: JB2DetailRow[] };
    const page = (json.Data ?? json.data ?? []) as JB2DetailRow[];

    all.push(...page);

    if (page.length < take) break;
    skip += take;
  }

  return all;
}

function sum(vals: Array<number | null | undefined>) {
  let total = 0;
  for (const v of vals) total += Number(v ?? 0) || 0;
  return total;
}

function isSwissDepartmentRow(r: JB2DetailRow) {
  const empCode = String(r.employeeCode ?? "").trim();
  if (!empCode) return false;
  if (EXCLUDED_EMPLOYEE_CODES.has(empCode)) return false;

  const wc = Number(r.workCenter ?? 0);
  return SWISS_WORK_CENTERS.includes(wc);
}

// Actual hours for this dashboard should follow the same logic as the main chart.
// For most employees, actual hours are machineHours.
// For Lights Out (employee 9999), JobBOSS sometimes stores machineHours as hours-per-part,
// so when machineHours < 1 and there are pieces, multiply by total pieces.
function getActualHours(r: JB2DetailRow) {
  const machine = Number(r.machineHours ?? 0) || 0;

  const good = Number(r.piecesFinished ?? 0) || 0;
  const scrap = Number(r.piecesScrapped ?? 0) || 0;
  const totalPieces = good + scrap;

  const emp = String(r.employeeCode ?? "").trim();

  if (emp === "9999" && totalPieces > 0 && machine > 0 && machine < 1) {
    return totalPieces * machine;
  }

  return machine;
}

// Estimated hours: good parts * cycle time.
// JobBOSS appears to return cycleTime in MINUTES per part (not hours).
function getEstimatedHours(r: JB2DetailRow) {
  const good = Number(r.piecesFinished ?? 0) || 0;
  const cycleMinutes = Number(r.cycleTime ?? 0) || 0;

  // minutes -> hours
  return good * (cycleMinutes / 60);
}

function fmt2(n: number) {
  return (Number(n) || 0).toFixed(2);
}

function fmt6(n: number) {
  return (Number(n) || 0).toFixed(6);
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

  // First: restrict to Swiss WCs and exclude the three employees.
  let rows = allRows.filter(isSwissDepartmentRow);

  // Then apply shift rules
  if (shift === "lightsOut") {
    rows = rows.filter((r) => Number(r.shift) === 3 && Number(r.employeeCode) === 9999);
  } else if (shift === "night") {
    rows = rows.filter((r) => Number(r.shift) === 3 && Number(r.employeeCode) !== 9999);
  } else if (shift === "morning") {
    rows = rows.filter((r) => Number(r.shift) === 1 && Number(r.employeeCode) !== 9999);
  }

  const totalActual = rows.reduce((acc, r) => acc + getActualHours(r), 0);
  const totalEstimated = rows.reduce((acc, r) => acc + getEstimatedHours(r), 0);

  return (
    <div style={{ padding: 16 }}>
      <h1>Production Hours, Details</h1>
      <div>Day: {day}</div>
      <div>Shift: {shiftLabel(shift)}</div>

      <div style={{ marginTop: 10 }}>
        <div>Tickets: {rows.length}</div>
        <div>Total Actual Hrs (machineHours): {fmt2(totalActual)}</div>
        <div>Total Estimated Hrs (good x cycleTime): {fmt2(totalEstimated)}</div>
      </div>

      {rows.length === 0 ? (
        <div style={{ marginTop: 16 }}>No tickets found for this day and shift.</div>
      ) : null}

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "2px solid #ccc" }}>
            <th style={{ padding: "8px 6px" }}>Time</th>
            <th style={{ padding: "8px 6px" }}>Shift</th>
            <th style={{ padding: "8px 6px" }}>Employee</th>
            <th style={{ padding: "8px 6px" }}>Job</th>
            <th style={{ padding: "8px 6px" }}>WC</th>
            <th style={{ padding: "8px 6px" }}>Op</th>
            <th style={{ padding: "8px 6px" }}>Actual Hrs</th>
            <th style={{ padding: "8px 6px" }}>Est Hrs</th>
            <th style={{ padding: "8px 6px" }}>Cycle (min/part)</th>
            <th style={{ padding: "8px 6px" }}>Good</th>
            <th style={{ padding: "8px 6px" }}>Scrap</th>
            <th style={{ padding: "8px 6px" }}>Comments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const actual = getActualHours(r);
            const est = getEstimatedHours(r);
            const cycleMin = Number(r.cycleTime ?? 0) || 0;

            return (
              <tr key={idx} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ padding: "8px 6px" }}>{String(r.ticketDate ?? "").slice(11, 19)}</td>
                <td style={{ padding: "8px 6px" }}>{r.shift ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>
                  {r.employeeName ?? ""} ({r.employeeCode ?? ""})
                </td>
                <td style={{ padding: "8px 6px" }}>{r.jobNumber ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{r.workCenter ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{r.operationNumber ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{fmt2(actual)}</td>
                <td style={{ padding: "8px 6px" }}>{fmt2(est)}</td>
                <td style={{ padding: "8px 6px" }}>{cycleMin ? fmt6(cycleMin) : "0.000000"}</td>
                <td style={{ padding: "8px 6px" }}>{r.piecesFinished ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{r.piecesScrapped ?? ""}</td>
                <td style={{ padding: "8px 6px" }}>{r.comments ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
