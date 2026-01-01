import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ⚠️ Calendario pubblico .ics
const GOOGLE_PUBLIC_ICS =
  "https://calendar.google.com/calendar/ical/b1ba30b7ea289cf18f05db50c90ae0e8f279412f4e381ca696a8cea47d3db9e8%40group.calendar.google.com/public/basic.ics";

// Timezone operativa (Ibiza)
const DEFAULT_TZ = "Europe/Madrid";

type Interval = [number, number]; // minuti [start, end) dentro il giorno (0..1440)
type BusyMap = Record<string, Interval[]>;

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymdLocalInTz(dateUtc: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  // en-CA => YYYY-MM-DD
  return dtf.format(dateUtc);
}

function toMinutesInDayInTz(dateUtc: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(dateUtc);
  const hh = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const mm = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return clamp(hh * 60 + mm, 0, 1440);
}

/**
 * Converte una "data/ora locale" (wall time) in UTC, nel fuso `tz`.
 * Implementazione senza librerie esterne.
 */
function zonedTimeToUtc(
  args: { y: number; mo: number; d: number; hh: number; mi: number; ss?: number },
  tz: string
) {
  // 1) guess UTC = stessa data/ora come se fosse UTC
  const ss = args.ss ?? 0;
  let guess = new Date(Date.UTC(args.y, args.mo - 1, args.d, args.hh, args.mi, ss));

  // 2) calcola che ora sarebbe in tz a quel guess
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const partsToObj = (dUtc: Date) => {
    const parts = dtf.formatToParts(dUtc);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
    return {
      y: Number(get("year")),
      mo: Number(get("month")),
      d: Number(get("day")),
      hh: Number(get("hour")),
      mi: Number(get("minute")),
      ss: Number(get("second")),
    };
  };

  const desired = {
    y: args.y,
    mo: args.mo,
    d: args.d,
    hh: args.hh,
    mi: args.mi,
    ss,
  };

  // 3) correzione 1-2 iterazioni (sufficiente per DST)
  for (let i = 0; i < 3; i++) {
    const got = partsToObj(guess);

    const desiredMs = Date.UTC(desired.y, desired.mo - 1, desired.d, desired.hh, desired.mi, desired.ss);
    const gotMs = Date.UTC(got.y, got.mo - 1, got.d, got.hh, got.mi, got.ss);

    const diff = desiredMs - gotMs;
    if (diff === 0) break;

    guess = new Date(guess.getTime() + diff);
  }

  return guess;
}

/**
 * Unfold lines (ICS spec): lines can be continued with CRLF + space
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

type ParsedDT = {
  kind: "allDay" | "dateTime";
  startUtc: Date;
  endUtc: Date;
};

function parseDtValue(line: string) {
  // Esempi:
  // DTSTART:20260517
  // DTSTART:20260517T100000Z
  // DTSTART;TZID=Europe/Madrid:20260517T100000
  const [left, rawVal = ""] = line.split(":");
  const val = rawVal.trim();

  const params = left.split(";");
  const prop = params[0]; // DTSTART / DTEND
  const tzid = params.find((p) => p.startsWith("TZID="))?.slice(5);

  return { prop, val, tzid };
}

function parseIcsDateTimeToUTC(val: string, tzid: string | undefined, fallbackTz: string): { kind: "allDay" | "dateTime"; utc: Date } | null {
  if (!val) return null;

  // All-day: YYYYMMDD
  if (/^\d{8}$/.test(val)) {
    const y = Number(val.slice(0, 4));
    const mo = Number(val.slice(4, 6));
    const d = Number(val.slice(6, 8));
    const utc = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0));
    return Number.isNaN(utc.getTime()) ? null : { kind: "allDay", utc };
  }

  // UTC Z: YYYYMMDDTHHMMSSZ
  const mZ = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (mZ) {
    const y = Number(mZ[1]);
    const mo = Number(mZ[2]);
    const d = Number(mZ[3]);
    const hh = Number(mZ[4]);
    const mi = Number(mZ[5]);
    const ss = Number(mZ[6]);
    const utc = new Date(Date.UTC(y, mo - 1, d, hh, mi, ss));
    return Number.isNaN(utc.getTime()) ? null : { kind: "dateTime", utc };
  }

  // Local datetime without Z: YYYYMMDDTHHMMSS (o HHMM)
  const mLocal = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (mLocal) {
    const y = Number(mLocal[1]);
    const mo = Number(mLocal[2]);
    const d = Number(mLocal[3]);
    const hh = Number(mLocal[4]);
    const mi = Number(mLocal[5]);
    const ss = Number(mLocal[6]);
    const tz = tzid || fallbackTz;
    const utc = zonedTimeToUtc({ y, mo, d, hh, mi, ss }, tz);
    return Number.isNaN(utc.getTime()) ? null : { kind: "dateTime", utc };
  }

  // Local datetime short (senza secondi): YYYYMMDDTHHMM
  const mShort = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/);
  if (mShort) {
    const y = Number(mShort[1]);
    const mo = Number(mShort[2]);
    const d = Number(mShort[3]);
    const hh = Number(mShort[4]);
    const mi = Number(mShort[5]);
    const tz = tzid || fallbackTz;
    const utc = zonedTimeToUtc({ y, mo, d, hh, mi, ss: 0 }, tz);
    return Number.isNaN(utc.getTime()) ? null : { kind: "dateTime", utc };
  }

  return null;
}

function addInterval(busy: BusyMap, dayIso: string, interval: Interval) {
  const [s, e] = interval;
  if (e <= s) return;

  if (!busy[dayIso]) busy[dayIso] = [];
  busy[dayIso].push([s, e]);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return [];
  const sorted = intervals
    .slice()
    .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

  const out: Interval[] = [];
  let cur = sorted[0].slice() as Interval;

  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= cur[1]) {
      cur[1] = Math.max(cur[1], e);
    } else {
      out.push(cur);
      cur = [s, e];
    }
  }
  out.push(cur);
  return out;
}

function dateIsoToUtcMidnight(iso: string) {
  // iso: YYYY-MM-DD
  return new Date(iso + "T00:00:00Z");
}

function rangeDatesInclusive(fromISO: string, toISO: string): string[] {
  const from = new Date(fromISO + "T00:00:00Z");
  const to = new Date(toISO + "T00:00:00Z");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  if (to.getTime() < from.getTime()) return [];

  const out: string[] = [];
  let cur = new Date(from.getTime());
  while (cur.getTime() <= to.getTime()) {
    // UTC day string
    const yyyy = cur.getUTCFullYear();
    const mm = pad2(cur.getUTCMonth() + 1);
    const dd = pad2(cur.getUTCDate());
    out.push(`${yyyy}-${mm}-${dd}`);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * Parse ICS → busy per giorno (in DEFAULT_TZ), e closed (giorni full-day)
 */
function parseBusyFromIcs(ics: string, tzFallback: string): { busy: BusyMap; closed: Set<string> } {
  const busy: BusyMap = {};
  const closed = new Set<string>();
  const lines = normalizeIcsLines(ics);

  let inEvent = false;

  let dtStartLine: string | null = null;
  let dtEndLine: string | null = null;

  for (const line of lines) {
    if (line.startsWith("BEGIN:VEVENT")) {
      inEvent = true;
      dtStartLine = null;
      dtEndLine = null;
      continue;
    }

    if (line.startsWith("END:VEVENT")) {
      if (inEvent && dtStartLine) {
        const sInfo = parseDtValue(dtStartLine);
        const eInfo = dtEndLine ? parseDtValue(dtEndLine) : null;

        const sParsed = parseIcsDateTimeToUTC(sInfo.val, sInfo.tzid, tzFallback);
        const eParsed = eInfo ? parseIcsDateTimeToUTC(eInfo.val, eInfo.tzid, tzFallback) : null;

        if (sParsed) {
          // DTEND mancante → 1 giorno se all-day, oppure 1 ora se dateTime (fallback conservativo)
          let startUtc = sParsed.utc;
          let endUtc: Date;

          if (eParsed) {
            endUtc = eParsed.utc;
          } else {
            if (sParsed.kind === "allDay") {
              endUtc = new Date(startUtc.getTime());
              endUtc.setUTCDate(endUtc.getUTCDate() + 1);
            } else {
              endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000);
            }
          }

          // Se all-day → DTEND è esclusivo, quindi chiude tutti i giorni in mezzo
          if (sParsed.kind === "allDay") {
            // startUtc e endUtc sono già a mezzanotte UTC,
            // ma noi li mappiamo ai giorni in tzFallback
            // andiamo giorno per giorno in tz finché < endUtc
            let cur = new Date(startUtc.getTime());
            while (cur.getTime() < endUtc.getTime()) {
              const dayIso = ymdLocalInTz(cur, tzFallback);
              closed.add(dayIso);
              addInterval(busy, dayIso, [0, 1440]);
              // +1 giorno
              cur = new Date(cur.getTime() + 24 * 60 * 60 * 1000);
            }
          } else {
            // Evento a orario: splitta in giorni locali (tzFallback)
            // Iteriamo da start a end, aggiungendo le porzioni per ogni giorno
            let curStart = new Date(startUtc.getTime());

            while (curStart.getTime() < endUtc.getTime()) {
              const dayIso = ymdLocalInTz(curStart, tzFallback);

              // UTC midnight del giorno successivo IN tzFallback:
              // calcoliamo "domani 00:00" in tz e convertiamo in UTC
              // (prendiamo la data locale dayIso e facciamo +1 giorno)
              const [Y, M, D] = dayIso.split("-").map(Number);
              const nextLocalMidnightUtc = zonedTimeToUtc({ y: Y, mo: M, d: D + 1, hh: 0, mi: 0, ss: 0 }, tzFallback);

              const segEnd = new Date(Math.min(endUtc.getTime(), nextLocalMidnightUtc.getTime()));

              const startMin = toMinutesInDayInTz(curStart, tzFallback);
              const endMin = toMinutesInDayInTz(segEnd, tzFallback);

              // se l'evento attraversa la mezzanotte, per il giorno corrente endMin sarà 0.
              // in quel caso consideriamo 1440 (fino a fine giorno).
              const effectiveEnd = endMin === 0 && segEnd.getTime() > curStart.getTime() ? 1440 : endMin;

              addInterval(busy, dayIso, [startMin, effectiveEnd]);

              curStart = segEnd;
            }
          }
        }
      }

      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (line.startsWith("DTSTART")) dtStartLine = line;
    if (line.startsWith("DTEND")) dtEndLine = line;
  }

  // merge per ogni giorno
  for (const k of Object.keys(busy)) {
    busy[k] = mergeIntervals(busy[k]);
    // se copre tutto il giorno, segna closed
    if (busy[k].length === 1 && busy[k][0][0] <= 0 && busy[k][0][1] >= 1440) {
      closed.add(k);
    }
  }

  return { busy, closed };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { ok: true, closed: [], busy: {}, hint: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    // 1) Leggi Google Calendar public .ics
    let icsText = "";
    const res = await fetch(GOOGLE_PUBLIC_ICS, {
      cache: "no-store",
      headers: { "User-Agent": "barca-app" },
    });

    if (res.ok) {
      icsText = await res.text();
    } else {
      // 2) Fallback file locale (se esiste)
      const localUrl = new URL("/gcal.ics", url.origin).toString();
      const res2 = await fetch(localUrl, { cache: "no-store" });
      if (res2.ok) icsText = await res2.text();
    }

    if (!icsText || !icsText.includes("BEGIN:VCALENDAR")) {
      return NextResponse.json(
        { ok: true, closed: [], busy: {} },
        { status: 200, headers: { "Cache-Control": "no-store" } }
      );
    }

    const { busy, closed } = parseBusyFromIcs(icsText, DEFAULT_TZ);

    // Limita risposta al range richiesto (per non mandare tutto l’anno)
    const daysUtc = rangeDatesInclusive(from, to);

    // daysUtc è in UTC, ma noi usiamo le chiavi in tz (Europe/Madrid).
    // Quindi trasformiamo ogni "giorno UTC" in "giorno tz" prendendo mezzanotte UTC e formattando.
    const daysTz = daysUtc.map((d) => ymdLocalInTz(dateIsoToUtcMidnight(d), DEFAULT_TZ));

    const busyInRange: BusyMap = {};
    for (const day of daysTz) {
      if (busy[day]?.length) busyInRange[day] = busy[day];
    }

    const closedInRange = daysTz.filter((d) => closed.has(d));

    return NextResponse.json(
      {
        ok: true,
        tz: DEFAULT_TZ,
        closed: closedInRange,
        busy: busyInRange,
        v: 2,
      },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    return NextResponse.json(
      { ok: true, closed: [], busy: {}, tz: DEFAULT_TZ, v: 2 },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    );
  }
}
