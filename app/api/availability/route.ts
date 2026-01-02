import { NextResponse } from "next/server";

export const runtime = "nodejs";

const DEFAULT_TZ = "Europe/Madrid";
const CALENDAR_ID =
  "b1ba30b7ea289cf18f05db50c90ae0e8f279412f4e381ca696a8cea47d3db9e8@group.calendar.google.com";

type Interval = [number, number];
type BusyMap = Record<string, Interval[]>;

function jsonHeaders() {
  return { "Cache-Control": "no-store" };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function ymdInTz(dateUtc: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(dateUtc);
}

function minutesInDayInTz(dateUtc: Date, tz: string) {
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

function addInterval(busy: BusyMap, dayIso: string, it: Interval) {
  const [s, e] = it;
  if (e <= s) return;
  if (!busy[dayIso]) busy[dayIso] = [];
  busy[dayIso].push([s, e]);
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out: Interval[] = [];
  let cur = sorted[0].slice() as Interval;
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else {
      out.push(cur);
      cur = [s, e];
    }
  }
  out.push(cur);
  return out;
}

function rangeDaysISO(from: string, to: string): string[] {
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return [];
  if (b.getTime() < a.getTime()) return [];
  const out: string[] = [];
  let cur = new Date(a.getTime());
  while (cur.getTime() <= b.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * ✅ Token OAuth2 per Service Account (senza librerie esterne)
 * Usa ENV GOOGLE_SERVICE_ACCOUNT_JSON (string JSON)
 */
async function getAccessToken(scope: string) {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "";
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const sa = JSON.parse(raw);
  const email: string = sa.client_email;
  const key: string = sa.private_key;

  // JWT manually with WebCrypto
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const data = `${enc(header)}.${enc(claim)}`;

  // import private key PEM
  const pem = key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const der = Buffer.from(pem, "base64");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(data)
  );

  const signature = Buffer.from(sig)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${data}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok) {
    throw new Error(tokenJson?.error_description || "Token error");
  }
  return tokenJson.access_token as string;
}

async function fetchEvents(timeMinISO: string, timeMaxISO: string) {
  const token = await getAccessToken("https://www.googleapis.com/auth/calendar.readonly");

  const url = new URL(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
  );
  url.searchParams.set("timeMin", timeMinISO);
  url.searchParams.set("timeMax", timeMaxISO);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "2500");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message || "Google Calendar error");
  return json.items || [];
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { ok: true, tz: DEFAULT_TZ, closed: [], busy: {}, v: 3, hint: "Use ?from=YYYY-MM-DD&to=YYYY-MM-DD" },
        { status: 200, headers: jsonHeaders() }
      );
    }

    const days = rangeDaysISO(from, to);
    if (!days.length) {
      return NextResponse.json({ ok: false, error: "Invalid range", tz: DEFAULT_TZ, closed: [], busy: {}, v: 3 }, { status: 200, headers: jsonHeaders() });
    }

    // Range UTC ampio per prendere eventi che toccano i giorni
    const timeMin = new Date(from + "T00:00:00Z").toISOString();
    const timeMax = new Date(to + "T23:59:59Z").toISOString();

    const items = await fetchEvents(timeMin, timeMax);

    const busy: BusyMap = {};
    const closed = new Set<string>();

    for (const ev of items) {
      const start = ev.start?.dateTime || ev.start?.date;
      const end = ev.end?.dateTime || ev.end?.date;

      if (!start || !end) continue;

      // all-day: start/end sono YYYY-MM-DD (end esclusivo)
      if (ev.start?.date && ev.end?.date) {
        const startDay = ev.start.date as string;
        const endDayExclusive = ev.end.date as string;

        // chiudi tutti i giorni dal startDay incluso a endDayExclusive escluso
        let cur = new Date(startDay + "T00:00:00Z");
        const endEx = new Date(endDayExclusive + "T00:00:00Z");

        while (cur.getTime() < endEx.getTime()) {
          const dIso = ymdInTz(cur, DEFAULT_TZ);
          closed.add(dIso);
          addInterval(busy, dIso, [0, 1440]);
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
        continue;
      }

      // timed event
      const sUtc = new Date(start);
      const eUtc = new Date(end);
      if (Number.isNaN(sUtc.getTime()) || Number.isNaN(eUtc.getTime())) continue;

      // spezzetta per giorno in TZ
      let cursor = new Date(sUtc.getTime());
      while (cursor.getTime() < eUtc.getTime()) {
        const dayIso = ymdInTz(cursor, DEFAULT_TZ);

        // fine del giorno locale: prendiamo "domani 00:00" in tz stimato via Date+format
        // Approccio semplice: se cambia giornoIso, significa che siamo passati oltre.
        const next = new Date(cursor.getTime() + 6 * 60 * 60 * 1000); // step
        let dayEndUtc = new Date(cursor.getTime());
        while (ymdInTz(dayEndUtc, DEFAULT_TZ) === dayIso) {
          dayEndUtc = new Date(dayEndUtc.getTime() + 60 * 60 * 1000);
        }
        // torna indietro a inizio ora e usa come "fine giorno"
        // (sufficiente per blocking slot)
        const segEnd = new Date(Math.min(eUtc.getTime(), dayEndUtc.getTime()));

        const sMin = minutesInDayInTz(cursor, DEFAULT_TZ);
        const eMin = minutesInDayInTz(segEnd, DEFAULT_TZ) || 1440;

        addInterval(busy, dayIso, [sMin, eMin]);

        cursor = segEnd;
        if (cursor.getTime() === sUtc.getTime()) break;
        if (next.getTime() <= cursor.getTime()) break;
      }
    }

    for (const k of Object.keys(busy)) {
      busy[k] = mergeIntervals(busy[k]);
      if (busy[k].length === 1 && busy[k][0][0] <= 0 && busy[k][0][1] >= 1440) {
        closed.add(k);
      }
    }

    // limita a giorni richiesti
    const daysTz = days.map((d) => ymdInTz(new Date(d + "T00:00:00Z"), DEFAULT_TZ));
    const busyInRange: BusyMap = {};
    for (const d of daysTz) if (busy[d]?.length) busyInRange[d] = busy[d];

    return NextResponse.json(
      {
        ok: true,
        tz: DEFAULT_TZ,
        closed: daysTz.filter((d) => closed.has(d)),
        busy: busyInRange,
        v: 3,
      },
      { status: 200, headers: jsonHeaders() }
    );
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: msg, tz: DEFAULT_TZ, closed: [], busy: {}, v: 3 },
      { status: 200, headers: jsonHeaders() }
    );
  }
}
