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

  comments?: string | null;
};

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
  if (s === "morning") return "Day";
  if (s === "night") return "Evening";
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

    const json = (await res.json()) as { Data?: JB2DetailRow[] };
    const page = json.Data ?? [];

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

  // Apply your shift rules
  let rows = allRows;

  if (shift === "lightsOut") {
    rows = allRows.filter((r) => r.shift === 3 && r.employeeCode === 9999);
  } else if (shift === "night") {
    rows = allRows.filter((r) => r.shift === 3 && r.employeeCode !== 9999);
  } else if (shift === "morning") {
    rows = allRows.filter((r) => r.shift === 1 && r.employeeCode !== 9999);
  }

  const totalMan = sum(rows.map((r) => r.manHours));
  const totalMach = sum(rows.map((r) => r.machineHours));

  return (
    <div style={{ padding: 16 }}>
      <h1>Production Hours, Details</h1>
      <div>Day: {day}</div>
      <div>Shift: {shiftLabel(shift)}</div>

      <div style={{ marginTop: 10 }}>
        Tickets: {rows.length}, Total Man Hrs: {totalMan.toFixed(2)}, Total Mach Hrs:{" "}
        {totalMach.toFixed(2)}
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
            <th style={{ padding: "8px 6px" }}>Man Hrs</th>
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
                {r.employeeName ?? ""} ({r.employeeCode ?? ""})
              </td>
              <td style={{ padding: "8px 6px" }}>{r.jobNumber ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{r.workCenter ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{r.operationNumber ?? ""}</td>
              <td style={{ padding: "8px 6px" }}>{Number(r.manHours ?? 0).toFixed(2)}</td>
              <td style={{ padding: "8px 6px" }}>{Number(r.machineHours ?? 0).toFixed(2)}</td>
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
