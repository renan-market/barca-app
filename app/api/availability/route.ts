import { NextResponse } from "next/server";

export const runtime = "nodejs";

const GOOGLE_PUBLIC_ICS =
  "https://calendar.google.com/calendar/ical/b1ba30b7ea289cf18f05db50c90ae0e8f279412f4e381ca696a8cea47d3db9e8%40group.calendar.google.com/public/basic.ics";

function ymd(d: Date) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseIcsDateToUTC(dateStr: string): Date | null {
  if (!dateStr) return null;

  // YYYYMMDD (all-day)
  if (/^\d{8}$/.test(dateStr)) {
    const y = Number(dateStr.slice(0, 4));
    const m = Number(dateStr.slice(4, 6));
    const d = Number(dateStr.slice(6, 8));
    const dt = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // YYYYMMDDTHHMMSSZ (UTC)
  const m = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (!m) return null;

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const hh = Number(m[4]);
  const mi = Number(m[5]);
  const ss = Number(m[6]);
  const dt = new Date(Date.UTC(y, mo - 1, da, hh, mi, ss));
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function addDaysUTC(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function expandEventToClosedDates(dtStart: Date, dtEnd: Date): string[] {
  // DTEND per all-day è esclusivo
  const out: string[] = [];
  let cur = new Date(Date.UTC(dtStart.getUTCFullYear(), dtStart.getUTCMonth(), dtStart.getUTCDate()));
  const end = new Date(Date.UTC(dtEnd.getUTCFullYear(), dtEnd.getUTCMonth(), dtEnd.getUTCDate()));

  while (cur.getTime() < end.getTime()) {
    out.push(ymd(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
}

/**
 * Unfold lines (ICS spec): lines can be continued with CRLF + space
 * We normalize and join them before parsing.
 */
function normalizeIcsLines(ics: string): string[] {
  const normalized = ics.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const raw = normalized.split("\n");

  const out: string[] = [];
  for (const line of raw) {
    if (!line) continue;
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.trimStart();
    } else {
      out.push(line);
    }
  }
  return out;
}

function parseClosedDatesFromIcs(ics: string): Set<string> {
  const closed = new Set<string>();
  const lines = normalizeIcsLines(ics);

  let inEvent = false;
  let dtStartRaw: string | null = null;
  let dtEndRaw: string | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      dtStartRaw = null;
      dtEndRaw = null;
      continue;
    }

    if (line.startsWith("END:VEVENT")) {
      if (inEvent && dtStartRaw) {
        const dtStart = parseIcsDateToUTC(dtStartRaw);
        let dtEnd = dtEndRaw ? parseIcsDateToUTC(dtEndRaw) : null;

        // Se manca DTEND → 1 giorno
        if (dtStart && !dtEnd) dtEnd = addDaysUTC(dtStart, 1);

        if (dtStart && dtEnd) {
          for (const day of expandEventToClosedDates(dtStart, dtEnd)) closed.add(day);
        }
      }
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith("DTSTART")) {
      const val = line.split(":")[1]?.trim() ?? "";
      dtStartRaw = val || null;
    }
    if (line.startsWith("DTEND")) {
      const val = line.split(":")[1]?.trim() ?? "";
      dtEndRaw = val || null;
    }
  }

  return closed;
}

function rangeDatesInclusive(fromISO: string, toISO: string): string[] {
  const from = new Date(fromISO + "T00:00:00Z");
  const to = new Date(toISO + "T00:00:00Z");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  if (to.getTime() < from.getTime()) return [];

  const out: string[] = [];
  let cur = new Date(from.getTime());
  while (cur.getTime() <= to.getTime()) {
    out.push(ymd(cur));
    cur = addDaysUTC(cur, 1);
  }
  return out;
}

export async function GET(req: Request) {
  // REGOLA: niente ok:false. Se errore → ok:true closed:[]
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { ok: true, closed: [], hint: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Legge Google Calendar PUBLIC .ics (quello che hai testato e contiene 20260401)
    let icsText = "";
    const res = await fetch(GOOGLE_PUBLIC_ICS, {
      cache: "no-store",
      headers: { "User-Agent": "barca-app" },
    });

    if (res.ok) {
      icsText = await res.text();
    } else {
      // 2) Fallback: prova il file locale se esiste (non rompe nulla)
      const localUrl = new URL("/gcal.ics", url.origin).toString();
      const res2 = await fetch(localUrl, { cache: "no-store" });
      if (res2.ok) icsText = await res2.text();
    }

    if (!icsText || !icsText.includes("BEGIN:VCALENDAR")) {
      return NextResponse.json({ ok: true, closed: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }

    const closedSet = parseClosedDatesFromIcs(icsText);
    const days = rangeDatesInclusive(from, to);
    const closedInRange = days.filter((d) => closedSet.has(d));

    return NextResponse.json(
      { ok: true, closed: closedInRange },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: true, closed: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
}
