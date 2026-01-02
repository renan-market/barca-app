"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";

const PRICES = {
  day: 0, // TODO: metti prezzo DAY
  halfday: 0, // TODO: metti prezzo MEZZA GIORNATA
  sunset: 0, // TODO: metti prezzo SUNSET
  night: 0, // TODO: metti prezzo NOTTE (per pernottamento)
};

const TZ = "Europe/Madrid";

// ✅ NIENTE readonly/as const → tuple semplici e stabili
type Interval = [number, number]; // minuti [start,end)
type BusyMap = Record<string, Interval[]>;

type ApiResponse = {
  ok: boolean;
  tz?: string;
  closed: string[];
  busy: BusyMap;
  v?: number;
};

const SLOT: Record<"day" | "halfAM" | "halfPM" | "sunset", Interval> = {
  day: [10 * 60, 18 * 60], // 10:00-18:00
  halfAM: [10 * 60, 14 * 60], // 10:00-14:00
  halfPM: [14 * 60 + 30, 18 * 60 + 30], // 14:30-18:30
  sunset: [19 * 60, 21 * 60 + 30], // ✅ 19:00-21:30 (2h30)
};

function euro(n: number) {
  if (!n) return "€___";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function overlaps(a: Interval, b: Interval) {
  return a[0] < b[1] && b[0] < a[1];
}

function isSlotBlocked(busy: Interval[], slot: Interval) {
  return busy.some((it) => overlaps(it, slot));
}

type CardProps = {
  title: string;
  subtitle: string;
  price: string;
  disabled?: boolean;
  warningText?: string;
  extraLines?: React.ReactNode;
};

function ExperienceCard({
  title,
  subtitle,
  price,
  disabled,
  warningText,
  extraLines,
}: CardProps) {
  return (
    <div
      className={[
        "group block rounded-2xl border border-gray-300 bg-white",
        "p-5 sm:p-6",
        "shadow-[0_10px_28px_rgba(0,0,0,0.08)]",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "hover:shadow-[0_14px_34px_rgba(0,0,0,0.12)] active:scale-[0.99]",
        "transition",
      ].join(" ")}
      aria-disabled={disabled ? true : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-lg font-extrabold text-black leading-tight">
            {title}
          </h2>
          <p className="mt-1 text-base sm:text-sm font-semibold text-gray-900/90 leading-snug">
            {subtitle}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs font-bold text-gray-700">Da</div>
          <div className="text-lg sm:text-base font-extrabold text-black">
            {price}
          </div>
        </div>
      </div>

      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-900">
        Prenota / Richiedi su WhatsApp <span aria-hidden>›</span>
      </div>

      {extraLines ? <div className="mt-3">{extraLines}</div> : null}

      {disabled && warningText ? (
        <div className="mt-3 text-sm font-extrabold text-gray-900">
          {warningText}
        </div>
      ) : null}
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-bold",
        ok ? "bg-gray-100 text-gray-900" : "bg-gray-200 text-gray-700",
      ].join(" ")}
    >
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

export default function Page() {
  const [selectedDate, setSelectedDate] = useState<string>(() => todayInTz(TZ));
  const [api, setApi] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/availability?from=${selectedDate}&to=${selectedDate}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as ApiResponse;
        if (alive) setApi(data);
      } catch {
        if (alive) setApi({ ok: true, closed: [], busy: {} });
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [selectedDate]);

  const { closedSet, intervals } = useMemo(() => {
    const closedSet = new Set(api?.closed ?? []);
    const raw = api?.busy?.[selectedDate] ?? [];

    // ✅ Normalizzo sempre a tuple MUTABILI [number, number]
    const intervals: Interval[] = raw.map((it) => [it[0], it[1]]);

    return { closedSet, intervals };
  }, [api, selectedDate]);

  const isClosedAllDay = useMemo(
    () => closedSet.has(selectedDate),
    [closedSet, selectedDate]
  );

  // Blocchi per fasce
  const dayBlocked = isClosedAllDay || isSlotBlocked(intervals, SLOT.day);
  const halfAMBlocked = isClosedAllDay || isSlotBlocked(intervals, SLOT.halfAM);
  const halfPMBlocked = isClosedAllDay || isSlotBlocked(intervals, SLOT.halfPM);
  const sunsetBlocked = isClosedAllDay || isSlotBlocked(intervals, SLOT.sunset);

  // Pernottamento: blocchiamo solo se giorno full-day (evento tutto il giorno)
  const nightBlocked = isClosedAllDay;

  const warning = "Non disponibile per questa attività";

  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900 px-5 py-10">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-black">
          Lagoon 380 · Ibiza
        </h1>
        <p className="mt-2 text-lg sm:text-base font-semibold text-gray-900/80">
          Esperienze private in catamarano
        </p>

        {/* Selettore Data */}
        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_10px_26px_rgba(0,0,0,0.06)] text-left">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-base font-extrabold text-gray-900">
                Seleziona data
              </p>
              <p className="text-sm font-medium text-gray-700">
                La disponibilità qui sotto si aggiorna in base al tuo Google
                Calendar.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-4 py-2 text-base font-bold text-gray-900 shadow-sm"
              />
              <div className="text-sm font-bold text-gray-700">
                {loading ? "Carico…" : "✓"}
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Pill ok={!dayBlocked} label="Day 10–18" />
            <Pill ok={!halfAMBlocked} label="Half Mattina 10–14" />
            <Pill ok={!halfPMBlocked} label="Half Pomeriggio 14:30–18:30" />
            <Pill ok={!sunsetBlocked} label="Sunset 19–21:30" />
          </div>
        </div>

        {/* ✅ QUI: 2 CARD SEPARATE PER MEZZA GIORNATA */}
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {/* Day */}
          {dayBlocked ? (
            <div className="block">
              <ExperienceCard
                title="Day Charter"
                subtitle="10:00 – 18:00 (senza notte)"
                price={euro(PRICES.day)}
                disabled
                warningText={warning}
              />
            </div>
          ) : (
            <Link href="/prenota" className="block">
              <ExperienceCard
                title="Day Charter"
                subtitle="10:00 – 18:00 (senza notte)"
                price={euro(PRICES.day)}
              />
            </Link>
          )}

          {/* Half AM */}
          {halfAMBlocked ? (
            <div className="block">
              <ExperienceCard
                title="Mezza Giornata"
                subtitle="Mattina · 10:00 – 14:00"
                price={euro(PRICES.halfday)}
                disabled
                warningText={warning}
              />
            </div>
          ) : (
            <Link href="/prenota" className="block">
              <ExperienceCard
                title="Mezza Giornata"
                subtitle="Mattina · 10:00 – 14:00"
                price={euro(PRICES.halfday)}
              />
            </Link>
          )}

          {/* Half PM */}
          {halfPMBlocked ? (
            <div className="block">
              <ExperienceCard
                title="Mezza Giornata"
                subtitle="Pomeriggio · 14:30 – 18:30"
                price={euro(PRICES.halfday)}
                disabled
                warningText={warning}
              />
            </div>
          ) : (
            <Link href="/prenota" className="block">
              <ExperienceCard
                title="Mezza Giornata"
                subtitle="Pomeriggio · 14:30 – 18:30"
                price={euro(PRICES.halfday)}
              />
            </Link>
          )}

          {/* Sunset */}
          {sunsetBlocked ? (
            <div className="block">
              <ExperienceCard
                title="Sunset"
                subtitle="19:00 – 21:30 (senza notte)"
                price={euro(PRICES.sunset)}
                disabled
                warningText={warning}
              />
            </div>
          ) : (
            <Link href="/prenota" className="block">
              <ExperienceCard
                title="Sunset"
                subtitle="19:00 – 21:30 (senza notte)"
                price={euro(PRICES.sunset)}
              />
            </Link>
          )}

          {/* Pernottamento */}
          {nightBlocked ? (
            <div className="block">
              <ExperienceCard
                title="Pernottamento"
                subtitle="Multi-day (Date Da / A)"
                price={`${euro(PRICES.night)}/notte`}
                disabled
                warningText={warning}
              />
            </div>
          ) : (
            <Link href="/prenota" className="block">
              <ExperienceCard
                title="Pernottamento"
                subtitle="Multi-day (Date Da / A)"
                price={`${euro(PRICES.night)}/notte`}
              />
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
