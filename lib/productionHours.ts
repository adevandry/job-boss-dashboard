// lib/productionHours.ts

export type Ticket = {
    ticketDate: string;
    shift: number | null;
    manHours: number | null;
    machineHours: number | null;
    employeeCode: number | null;
    workCenter: number | null;
  
    piecesFinished: number | null;
    cycleTime: number | null;
    setupTime: number | null;
  };
  
  export type ShiftName = "morning" | "night" | "lightsOut" | "unknown";
  
  const SWISS_WORKCENTER_ALLOWLIST: number[] = [
    // Fill this later when you know the Swiss work centers
  ];
  
  function isSwissWork(ticket: Ticket): boolean {
    if (SWISS_WORKCENTER_ALLOWLIST.length === 0) return true;
    return ticket.workCenter !== null && SWISS_WORKCENTER_ALLOWLIST.includes(ticket.workCenter);
  }
  
  export function dayKeyUTC(ticketDateIso: string): string {
    return ticketDateIso.slice(0, 10);
  }
  
  /**
   * SHIFT RULES (David):
   * - Day shift = shift 1, exclude employee 9999
   * - Evening shift = shift 3, exclude employee 9999
   * - Lights Out = shift 3 AND ONLY employee 9999 (Tony)
   */
  export function shiftName(ticket: Ticket): ShiftName {
    if (ticket.shift === 3 && ticket.employeeCode === 9999) return "lightsOut";
    if (ticket.shift === 3 && ticket.employeeCode !== 9999) return "night"; // Evening
    if (ticket.shift === 1 && ticket.employeeCode !== 9999) return "morning"; // Day
    return "unknown";
  }

  function productionHours(t: Ticket): number {
    const man = Number(t.manHours ?? 0) || 0;
    const mach = Number(t.machineHours ?? 0) || 0;
  
    // Default for most employees: use machineHours if present, else manHours
    let hours = man;
  
    // Special rule: Lights Out (Tony, 9999)
    // If cycleTime and pieces are present, compute total time
    if (t.employeeCode === 9999) {
      const cycle = Number(t.cycleTime ?? 0) || 0;
      const qty = Number(t.piecesFinished ?? 0) || 0;
      const setup = Number(t.setupTime ?? 0) || 0;
  
      const computed = cycle > 0 && qty > 0 ? cycle * qty + setup : setup;
  
      // Use the biggest number we have so we do not lose hours
      hours = Math.max(hours, computed);
    }
  
    return hours;
  }
  
  function shouldExcludeTicket(ticket: Ticket): boolean {
    // Swiss only
    if (!isSwissWork(ticket)) return true;
  
    return false;
  }
  
  export function groupHoursByDayAndShift(tickets: Ticket[]) {
    const out: Record<string, Record<ShiftName, number>> = {};
  
    for (const t of tickets) {
      if (!t.ticketDate) continue;
      if (shouldExcludeTicket(t)) continue;
  
      const day = dayKeyUTC(t.ticketDate);
      const s = shiftName(t);
  
      // Production Hours, prefer machineHours (Tony often has manHours = 0)
      const hours = productionHours(t);
  
      if (!out[day]) out[day] = { morning: 0, night: 0, lightsOut: 0, unknown: 0 };
      out[day][s] += hours;
    }
  
    return out;
  }
  
  export function totalHours(grouped: Record<string, Record<ShiftName, number>>) {
    let sum = 0;
    for (const day of Object.keys(grouped)) {
      const r = grouped[day];
      sum += r.morning + r.night + r.lightsOut + r.unknown;
    }
    return sum;
  }
  