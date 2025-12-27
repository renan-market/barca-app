"use client";

import { useEffect, useMemo, useState } from "react";

type BlockRange = {
  id: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD (incluso)
  label?: string;
  createdAt: string;
};

const STORAGE_KEY = "bh_blocks_v1";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function ymdToDate(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function dateToYmdUTC(d: Date) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function addDaysUTC(ymd: string, days: number) {
  const d = ymdToDate(ymd);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToYmdUTC(d);
}

function ymdToIcsValueDate(ymd: string) {
  // YYYY-MM-DD -> YYYYMMDD
  return ymd.replaceAll("-", "");
}

function makeId(start: string, end: string) {
  return `bh-${start.replaceAll("-", "")}-${end.replaceAll("-", "")}-${Math.random().toString(16).slice(2)}`;
}

function uniqById(items: BlockRange[]) {
  const m = new Map<string, BlockRange>();
  for (const it of items) m.set(it.id, it);
  return Array.from(m.values());
}

function sanitizeRanges(items: BlockRange[]) {
  // Normalizza, ordina, rimuove vuoti
  const cleaned = items
    .filter((x) => x.start && x.end)
    .map((x) => ({
      ...x,
      start: x.start,
      end: x.end,
    }))
    .sort((a, b) => a.start.localeCompare(b.start));
  return uniqById(cleaned);
}

function mergeOverlaps(items: BlockRange[]) {
  // Unisce range sovrapposti/adiacenti (start <= prevEnd+1)
  if (items.length <= 1) return items;
  const sorted = [...items].sort((a, b) => a.start.localeCompare(b.start));
  const out: BlockRange[] = [];
  let cur = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const nxt = sorted[i];
    const curEndPlus1 = addDaysUTC(cur.end, 1);
    if (nxt.start <= curEndPlus1) {
      // estendi
      if (nxt.end > cur.end) cur.end = nxt.end;
    } else {
      out.push(cur);
      cur = { ...nxt };
    }
  }
  out.push(cur);
  return out;
}

function blocksToIcs(blocks: BlockRange[]) {
  const now = new Date();
  const dtstamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  const header = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Blu Horizonte//Barca App Blocks//IT",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Blocchi Barca",
    "X-WR-TIMEZONE:Europe/Rome",
    "",
  ].join("\n");

  const events = blocks
    .map((b) => {
      // All-day: DTEND è giorno successivo (esclusivo)
      const dtstart = ymdToIcsValueDate(b.start);
      const dtend = ymdToIcsValueDate(addDaysUTC(b.end, 1));
      const summary = (b.label?.trim() ? b.label.trim() : "BLOCCATO").replaceAll("\n", " ");
      return [
        "BEGIN:VEVENT",
        `UID:${b.id}@bluhorizonte`,
        `DTSTAMP:${dtstamp}`,
        `SUMMARY:${summary}`,
        `DTSTART;VALUE=DATE:${dtstart}`,
        `DTEND;VALUE=DATE:${dtend}`,
        "END:VEVENT",
        "",
      ].join("\n");
    })
    .join("\n");

  const footer = "END:VCALENDAR\n";

  return header + events + footer;
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function parseIcsForAllDayBlocks(icsText: string): BlockRange[] {
  // Parser semplice: prende VEVENT con DTSTART;VALUE=DATE e DTEND;VALUE=DATE
  // e converte DTEND (esclusivo) -> end incluso (DTEND - 1 giorno)
  const lines = icsText.split(/\r?\n/);
  const out: BlockRange[] = [];
  let inEvent = false;
  let dtstart: string | null = null; // YYYYMMDD
  let dtend: string | null = null;   // YYYYMMDD (exclusive)
  let summary: string | null = null;
  let uid: string | null = null;

  const flush = () => {
    if (!dtstart || !dtend) return;
    const s = `${dtstart.slice(0, 4)}-${dtstart.slice(4, 6)}-${dtstart.slice(6, 8)}`;
    // dtend exclusive -> end inclusive
    const endExclusive = `${dtend.slice(0, 4)}-${dtend.slice(4, 6)}-${dtend.slice(6, 8)}`;
    const e = addDaysUTC(endExclusive, -1);

    out.push({
      id: uid ? uid.replaceAll("@bluhorizonte", "") : makeId(s, e),
      start: s,
      end: e,
      label: summary || "BLOCCATO",
      createdAt: new Date().toISOString(),
    });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      dtstart = null;
      dtend = null;
      summary = null;
      uid = null;
      continue;
    }
    if (line === "END:VEVENT") {
      if (inEvent) flush();
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith("UID:")) uid = line.slice(4);
    if (line.startsWith("SUMMARY:")) summary = line.slice(8);

    // all-day formats
    if (line.startsWith("DTSTART;VALUE=DATE:")) dtstart = line.split(":")[1] || null;
    if (line.startsWith("DTEND;VALUE=DATE:")) dtend = line.split(":")[1] || null;
  }

  return out;
}

export default function AdminBlocchiPage() {
  const [blocks, setBlocks] = useState<BlockRange[]>([]);
  const [start, setStart] = useState<string>("");
  const [end, setEnd] = useState<string>("");
  const [label, setLabel] = useState<string>("BLOCCATO (stagione chiusa)");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as BlockRange[];
      setBlocks(sanitizeRanges(parsed));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks));
    } catch {
      // ignore
    }
  }, [blocks]);

  const mergedBlocks = useMemo(() => mergeOverlaps(sanitizeRanges(blocks)), [blocks]);
  const icsText = useMemo(() => blocksToIcs(mergedBlocks), [mergedBlocks]);

  const addBlock = () => {
    setMessage("");
    if (!start || !end) {
      setMessage("⚠️ Inserisci sia Data Da che Data A.");
      return;
    }
    if (end < start) {
      setMessage("⚠️ La data A deve essere uguale o dopo la data Da.");
      return;
    }
    const b: BlockRange = {
      id: makeId(start, end),
      start,
      end,
      label: label || "BLOCCATO",
      createdAt: new Date().toISOString(),
    };
    setBlocks((prev) => sanitizeRanges([...prev, b]));
    setMessage("✅ Blocco aggiunto.");
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const clearAll = () => {
    setBlocks([]);
    setMessage("✅ Lista blocchi svuotata.");
  };

  const importFromSite = async () => {
    setMessage("");
    try {
      const res = await fetch("/gcal.ics", { cache: "no-store" });
      const text = await res.text();
      const parsed = parseIcsForAllDayBlocks(text);
      if (!parsed.length) {
        setMessage("⚠️ Nessun evento all-day trovato in /gcal.ics.");
        return;
      }
      setBlocks((prev) => sanitizeRanges([...prev, ...parsed]));
      setMessage(`✅ Importati ${parsed.length} blocchi da /gcal.ics`);
    } catch {
      setMessage("❌ Errore importando /gcal.ics");
    }
  };

  const copyIcs = async () => {
    try {
      await navigator.clipboard.writeText(icsText);
      setMessage("✅ Copiato negli appunti.");
    } catch {
      setMessage("❌ Non riesco a copiare. Usa Download.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl sm:text-3xl font-bold">Admin blocchi disponibilità</h1>
        <p className="text-gray-600 mt-2">
          Qui crei blocchi (Da/A) e poi esporti un <b>gcal.ics</b> pronto. I blocchi si salvano sul tuo PC.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium">Data Da</label>
            <input
              type="date"
              className="mt-2 w-full border rounded-xl px-3 py-2"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium">Data A</label>
            <input
              type="date"
              className="mt-2 w-full border rounded-xl px-3 py-2"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </div>
          <div className="bg-white rounded-2xl shadow p-4">
            <label className="text-sm font-medium">Etichetta</label>
            <input
              className="mt-2 w-full border rounded-xl px-3 py-2"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="BLOCCATO"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            onClick={addBlock}
            className="rounded-2xl px-4 py-2 bg-black text-white shadow"
          >
            + Aggiungi blocco
          </button>
          <button
            onClick={importFromSite}
            className="rounded-2xl px-4 py-2 bg-white border shadow-sm"
          >
            Importa da /gcal.ics
          </button>
          <button
            onClick={() => downloadText("gcal.ics", icsText)}
            className="rounded-2xl px-4 py-2 bg-white border shadow-sm"
          >
            Download gcal.ics
          </button>
          <button
            onClick={copyIcs}
            className="rounded-2xl px-4 py-2 bg-white border shadow-sm"
          >
            Copia negli appunti
          </button>
          <button
            onClick={clearAll}
            className="rounded-2xl px-4 py-2 bg-red-50 border border-red-200 text-red-700 shadow-sm"
          >
            Svuota tutto
          </button>
        </div>

        {message ? (
          <div className="mt-4 bg-white border rounded-2xl p-3">
            {message}
          </div>
        ) : null}

        <div className="mt-8 bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold">Blocchi attivi (uniti automaticamente)</h2>
          <p className="text-gray-600 text-sm mt-1">
            Se metti blocchi che si sovrappongono, li uniamo in un range unico.
          </p>

          {mergedBlocks.length === 0 ? (
            <p className="mt-4 text-gray-600">Nessun blocco.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {mergedBlocks.map((b) => (
                <div key={b.id} className="flex items-center justify-between border rounded-2xl p-3">
                  <div>
                    <div className="font-medium">
                      {b.start} → {b.end}
                    </div>
                    <div className="text-sm text-gray-600">{b.label || "BLOCCATO"}</div>
                  </div>
                  <button
                    onClick={() => removeBlock(b.id)}
                    className="px-3 py-1 rounded-xl border bg-white"
                  >
                    Rimuovi
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 bg-white rounded-2xl shadow p-4">
          <h2 className="text-lg font-semibold">Anteprima gcal.ics</h2>
          <p className="text-gray-600 text-sm mt-1">
            Questo è il contenuto che verrà usato dalla PWA (dopo che lo metti in <b>public/gcal.ics</b>).
          </p>
          <textarea
            className="mt-3 w-full h-72 border rounded-2xl p-3 font-mono text-xs"
            value={icsText}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
