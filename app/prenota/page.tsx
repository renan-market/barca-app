"use client";

import React, { useMemo, useState } from "react";

type ExperienceId = "day" | "half_am" | "half_pm" | "sunset" | "overnight";

type TimeInterval = {
  startMin: number; // minutes from 00:00
  endMin: number;   // minutes from 00:00
};

type Experience = {
  id: ExperienceId;
  title: string;
  subtitle: string;
  scheduleLabel: string;
  interval?: TimeInterval; // present for single-day time slots
  isMultiDay: boolean;     // true only for overnight
};

const TZ_LABEL = "Europe/Madrid";

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

function formatInterval(interval: TimeInterval): string {
  return `${minToHHMM(interval.startMin)}–${minToHHMM(interval.endMin)}`;
}

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  return `${yyyy}-${mm}-${dd}`;
}

function isValidISODate(s: string): boolean {
  // basic YYYY-MM-DD check
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function compareISO(a: string, b: string): number {
  // lexical compare works for ISO dates
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

const EXPERIENCES: Experience[] = [
  {
    id: "day",
    title: "Day Charter",
    subtitle: "Giornata intera",
    scheduleLabel: "Orario",
    interval: { startMin: 10 * 60, endMin: 18 * 60 }, // 10:00–18:00
    isMultiDay: false,
  },
  {
    id: "half_am",
    title: "Mezza Giornata",
    subtitle: "Mattina",
    scheduleLabel: "Orario",
    interval: { startMin: 10 * 60, endMin: 14 * 60 }, // 10:00–14:00
    isMultiDay: false,
  },
  {
    id: "half_pm",
    title: "Mezza Giornata",
    subtitle: "Pomeriggio",
    scheduleLabel: "Orario",
    interval: { startMin: 14 * 60 + 30, endMin: 18 * 60 + 30 }, // 14:30–18:30
    isMultiDay: false,
  },
  {
    id: "sunset",
    title: "Sunset",
    subtitle: "Tramonto",
    scheduleLabel: "Orario",
    interval: { startMin: 19 * 60, endMin: 21 * 60 + 30 }, // 19:00–21:30 (2h30)
    isMultiDay: false,
  },
  {
    id: "overnight",
    title: "Pernottamento",
    subtitle: "Multi-day",
    scheduleLabel: "Date",
    isMultiDay: true,
  },
];

export default function PrenotaPage(): React.ReactElement {
  const [selectedId, setSelectedId] = useState<ExperienceId>("day");

  // single-day date
  const [date, setDate] = useState<string>(todayISO());

  // multi-day dates
  const [dateFrom, setDateFrom] = useState<string>(todayISO());
  const [dateTo, setDateTo] = useState<string>(todayISO());

  const selected = useMemo(() => {
    return EXPERIENCES.find((e) => e.id === selectedId) ?? EXPERIENCES[0];
  }, [selectedId]);

  const errors = useMemo(() => {
    const list: string[] = [];

    if (!selected.isMultiDay) {
      if (!isValidISODate(date)) list.push("Seleziona una data valida.");
    } else {
      if (!isValidISODate(dateFrom) || !isValidISODate(dateTo)) {
        list.push("Seleziona entrambe le date (Da / A).");
      } else if (compareISO(dateFrom, dateTo) > 0) {
        list.push("La data 'Da' deve essere prima (o uguale) alla data 'A'.");
      }
    }

    return list;
  }, [selected.isMultiDay, date, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const base = `${selected.title} — ${selected.subtitle}`;
    if (!selected.isMultiDay && selected.interval) {
      return `${base} • ${date} • ${formatInterval(selected.interval)} (${TZ_LABEL})`;
    }
    if (selected.isMultiDay) {
      return `${base} • ${dateFrom} → ${dateTo} (${TZ_LABEL})`;
    }
    return base;
  }, [selected, date, dateFrom, dateTo]);

  const whatsappText = useMemo(() => {
    // testo semplice, stabile, senza dipendenze
    return `Ciao! Vorrei prenotare:\n${summary}\n\nGrazie!`;
  }, [summary]);

  const whatsappHref = useMemo(() => {
    // Metti qui il tuo numero WhatsApp in formato internazionale se vuoi (es. 39XXXXXXXXXX)
    // Per ora resta senza numero per non rompere nulla: apre WhatsApp con testo.
    const encoded = encodeURIComponent(whatsappText);
    return `https://wa.me/?text=${encoded}`;
  }, [whatsappText]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 md:py-10">
      <header className="mb-6 md:mb-10">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Prenota
        </h1>
        <p className="mt-2 text-sm opacity-80 md:text-base">
          Scegli l’esperienza e la data. (Timezone: {TZ_LABEL})
        </p>
      </header>

      {/* GRID: esperienze */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {EXPERIENCES.map((exp) => {
          const active = exp.id === selectedId;
          return (
            <button
              key={exp.id}
              type="button"
              onClick={() => setSelectedId(exp.id)}
              className={[
                "rounded-2xl border p-5 text-left shadow-sm transition",
                "hover:shadow-md",
                active ? "border-black/60" : "border-black/10",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold md:text-xl">
                    {exp.title}
                  </div>
                  <div className="mt-1 text-sm opacity-80">{exp.subtitle}</div>
                </div>
                <span
                  className={[
                    "rounded-full px-3 py-1 text-xs",
                    active ? "border border-black/30" : "border border-black/10",
                  ].join(" ")}
                >
                  Seleziona
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-black/10 p-3">
                <div className="text-xs opacity-70">{exp.scheduleLabel}</div>
                <div className="mt-1 text-sm font-medium">
                  {exp.isMultiDay
                    ? "Range date (Da/A)"
                    : exp.interval
                      ? formatInterval(exp.interval)
                      : "-"}
                </div>
              </div>
            </button>
          );
        })}
      </section>

      {/* DETTAGLIO SELEZIONE */}
      <section className="mt-6 rounded-2xl border border-black/10 p-5 shadow-sm md:mt-10 md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-semibold md:text-2xl">
              {selected.title} — {selected.subtitle}
            </h2>
            <p className="mt-1 text-sm opacity-80">
              {selected.isMultiDay
                ? "Seleziona le date di check-in e check-out."
                : selected.interval
                  ? `Orario: ${formatInterval(selected.interval)} (${TZ_LABEL})`
                  : ""}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[320px]">
            {!selected.isMultiDay ? (
              <label className="block">
                <span className="mb-1 block text-xs opacity-70">Data</span>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-black/15 px-4 py-3 text-sm outline-none"
                />
              </label>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs opacity-70">Da</span>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full rounded-xl border border-black/15 px-4 py-3 text-sm outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs opacity-70">A</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full rounded-xl border border-black/15 px-4 py-3 text-sm outline-none"
                  />
                </label>
              </div>
            )}

            {errors.length > 0 ? (
              <div className="rounded-xl border border-black/10 p-3 text-sm">
                <div className="font-semibold">Controlla:</div>
                <ul className="mt-2 list-disc pl-5 opacity-80">
                  {errors.map((er) => (
                    <li key={er}>{er}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="rounded-xl border border-black/10 p-3 text-sm">
                <div className="text-xs opacity-70">Riepilogo</div>
                <div className="mt-1 font-medium">{summary}</div>
              </div>
            )}

            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className={[
                "rounded-xl px-4 py-3 text-center text-sm font-semibold",
                errors.length > 0
                  ? "pointer-events-none border border-black/10 opacity-40"
                  : "border border-black/20 shadow-sm hover:shadow-md",
              ].join(" ")}
            >
              Prenota su WhatsApp
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
