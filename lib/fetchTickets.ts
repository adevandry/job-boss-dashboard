// lib/fetchTickets.ts

import type { Ticket } from "./productionHours";

type JB2Row = {
    ticketDate?: string | null;
    shift?: number | null;
    manHours?: number | null;
    machineHours?: number | null;
    employeeCode?: number | null;
    workCenter?: number | null;
  
    piecesFinished?: number | null;
    cycleTime?: number | null;
    setupTime?: number | null;
  };

type JB2Response = { Data: JB2Row[] };

export async function fetchAllTickets(params: {
  startIso: string;
  endIso: string;
  baseUrl: string; // add this
}) {
  const take = 1000;
  let skip = 0;
  const all: Ticket[] = [];

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

    const json = (await res.json()) as JB2Response;
    const page = json.Data ?? [];

    for (const row of page) {
      if (!row.ticketDate) continue;

      all.push({
        ticketDate: row.ticketDate,
        shift: row.shift ?? null,
        manHours: row.manHours ?? null,
        machineHours: row.machineHours ?? null,
        employeeCode: row.employeeCode ?? null,
        workCenter: row.workCenter ?? null,

        piecesFinished: row.piecesFinished ?? null,
        cycleTime: row.cycleTime ?? null,
        setupTime: row.setupTime ?? null,
      });
    }

    if (page.length < take) break;
    skip += take;
  }

  return all;
}
