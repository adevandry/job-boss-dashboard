import { fetchAllTickets } from "@/lib/fetchTickets";
import { groupHoursByDayAndShift, totalHours } from "@/lib/productionHours";
import ProductionHoursChart from "@/app/production-hours/ProductionHoursChart";
import { headers } from "next/headers";

function toJB2DateTimeZ(d: Date) {
  // "2026-01-03T00:00:00.000Z" -> "2026-01-03T00:00:00Z"
  return d.toISOString().replace(".000Z", "Z");
}

function last7DaysExcludingTodayUTC() {
  const now = new Date();
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 23, 59, 59)
  );
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 7, 0, 0, 0)
  );
  return { startIso: toJB2DateTimeZ(start), endIso: toJB2DateTimeZ(end) };
}

export default async function ProductionHoursPage() {
  const { startIso, endIso } = last7DaysExcludingTodayUTC();

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const baseUrl = `${protocol}://${host}`;

  const tickets = await fetchAllTickets({ startIso, endIso, baseUrl });

  const grouped = groupHoursByDayAndShift(tickets);
  const total = totalHours(grouped);

  const days = Object.keys(grouped).sort();
  const rows = days.map((day) => {
    const r = grouped[day];
    return {
      day,
      morning: r.morning,
      night: r.night,
      lightsOut: r.lightsOut,
      unknown: r.unknown,
      total: r.morning + r.night + r.lightsOut + r.unknown,
    };
  });

  // This is what the chart wants (no unknown, no total)
  const chartRows = rows.map((r) => ({
    day: r.day,
    morning: r.morning,
    night: r.night,
    lightsOut: r.lightsOut,
  }));

  return (
    <div style={{ padding: 16 }}>
      <h1>Production Hours</h1>
      <div style={{ color: "#2A4A60", marginTop: 6 }}>Last 7 days performance overview</div>

      <div style={{ marginTop: 8 }}>
        Range: {startIso} to {endIso}
      </div>

      <div style={{ marginTop: 4 }}>
        Total (production hours): {total.toFixed(2)}
      </div>

      <div style={{ marginTop: 16 }}>
        <ProductionHoursChart rows={chartRows} />
      </div>

      {/* Always-works drilldown links, even if a bar is tiny/zero */}
      <div style={{ marginTop: 14 }}>
        {rows.map((r) => (
          <div
            key={r.day}
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginBottom: 6,
              fontSize: 14,
            }}
          >
            <strong style={{ width: 70 }}>{r.day.slice(5)}</strong>

            <a href={`/production-hours/details?day=${r.day}&shift=morning`}>Day</a>
            <a href={`/production-hours/details?day=${r.day}&shift=night`}>Evening</a>
            <a href={`/production-hours/details?day=${r.day}&shift=lightsOut`}>Lights Out</a>
          </div>
        ))}
      </div>
    </div>
  );
}
