"use client";

import { useMemo, useState } from "react";

type ExperienceId = "halfday" | "day" | "sunset" | "overnight" | "custom";
type SeasonKey = "Bassa" | "Media" | "Alta";
type HalfDaySlot = "Mattina" | "Pomeriggio";

type Experience = {
  id: ExperienceId;
  title: string;
  subtitle: string;
  durationLabel: string;
};

const WHATSAPP_NUMBER = "393398864884"; // senza + e senza spazi (formato wa.me)

const BOAT = {
  name: "Lagoon 380",
  location: "Ibiza",
};

// ✅ FOTO LOCALI (public/...)
const BOAT_IMAGES = [
  "/boats/lagoon380/01.jpg",
  "/boats/lagoon380/02.jpg",
  "/boats/lagoon380/03.jpg",
  "/boats/lagoon380/04.jpg",
  "/boats/lagoon380/05.jpg",
  "/boats/lagoon380/06.jpg",
];

// ✅ Esperienze (NO WEEKLY)
const EXPERIENCES: Experience[] = [
  { id: "day", title: "Day Charter", subtitle: "Giornata intera in mare", durationLabel: "8 ore" },
  { id: "halfday", title: "Mezza giornata", subtitle: "Mattina o pomeriggio in mare", durationLabel: "4 ore" },
  { id: "sunset", title: "Sunset", subtitle: "Tramonto + aperitivo", durationLabel: "3 ore" },
  { id: "overnight", title: "Pernottamento", subtitle: "Multi-day (con notti)", durationLabel: "Da/A" },
  { id: "custom", title: "Personalizzata", subtitle: "Extra + richiesta su misura", durationLabel: "variabile" },
];

// ✅ PREZZI STAGIONALI
// Night = "solo dormire" = Day + 30% (CONFERMATO)
const PRICES: Record<SeasonKey, { day: number; halfday: number; sunset: number; night: number }> = {
  Bassa: { day: 650, halfday: 450, sunset: 420, night: 845 },
  Media: { day: 850, halfday: 600, sunset: 520, night: 1105 },
  Alta: { day: 1100, halfday: 780, sunset: 650, night: 1430 },
};

// ✅ EXTRA (transfer tolto)
const EXTRA = {
  seabob: 650,
  drinksPremium: 150,
  cateringPerPerson: 25,
  gopro: 80,
  cleaning: 80,
} as const;

function getSeasonFromDate(d: Date): SeasonKey {
  const m = d.getMonth() + 1;
  if (m === 7 || m === 8) return "Alta";
  if (m === 5 || m === 6 || m === 9) return "Media";
  return "Bassa";
}

function formatEUR(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toISODateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseISODateOnly(v: string) {
  const [y, m, d] = v.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function nightsBetween(fromISO: string, toISO: string) {
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  const ms = to.getTime() - from.getTime();
  const n = Math.floor(ms / (1000 * 60 * 60 * 24));
  return Number.isFinite(n) ? n : 0;
}

function isBaseExperience(id: ExperienceId) {
  return id === "day" || id === "halfday" || id === "sunset" || id === "overnight";
}

function calcBasePrice(args: { season: SeasonKey; exp: ExperienceId; nights: number }) {
  const p = PRICES[args.season];
  if (args.exp === "day") return p.day;
  if (args.exp === "sunset") return p.sunset;
  if (args.exp === "halfday") return p.halfday;
  if (args.exp === "overnight") return p.night * (args.nights || 0);
  return null;
}

export default function Page() {
  const today = useMemo(() => new Date(), []);
  const [selected, setSelected] = useState<ExperienceId>("day");

  // ✅ salva l’ultima esperienza “vera” scelta (così Personalizzata somma EXTRA + SERVIZIO)
  const [lastBaseExperience, setLastBaseExperience] = useState<Exclude<ExperienceId, "custom">>("day");

  // Galleria
  const [imgIndex, setImgIndex] = useState(0);

  // Date singola (day/sunset/halfday)
  const [date, setDate] = useState<string>(() => toISODateInputValue(today));

  // Range date (overnight)
  const [dateFrom, setDateFrom] = useState<string>(() => toISODateInputValue(today));
  const [dateTo, setDateTo] = useState<string>(() => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    return toISODateInputValue(t);
  });

  const [people, setPeople] = useState<number>(4);
  const [name, setName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [halfdaySlot, setHalfdaySlot] = useState<HalfDaySlot>("Mattina");

  // ✅ Extra (selezionabili SOLO in Personalizzata, ma contano nel totale del servizio)
  const [extraSeabob, setExtraSeabob] = useState(false);
  const [extraDrinks, setExtraDrinks] = useState(false);
  const [extraCatering, setExtraCatering] = useState(false);
  const [extraGopro, setExtraGopro] = useState(false);
  const [extraCleaning, setExtraCleaning] = useState(false);

  // ✅ Stagione
  const [seasonMode, setSeasonMode] = useState<"auto" | "manual">("auto");
  const [manualSeason, setManualSeason] = useState<SeasonKey>("Media");

  const experience = useMemo(() => EXPERIENCES.find((e) => e.id === selected)!, [selected]);

  function onSelectExperience(id: ExperienceId) {
    setSelected(id);
    if (isBaseExperience(id)) setLastBaseExperience(id);
  }

  // ✅ “Base reale” per i calcoli:
  // se sei su Personalizzata, la base è l’ultima esperienza vera (anche Overnight)
  const baseExpForCalc: ExperienceId = selected === "custom" ? lastBaseExperience : selected;

  // ✅ Se la base è Overnight, DEVONO restare visibili le date Da/A (anche dentro Personalizzata)
  const usesOvernightDates = baseExpForCalc === "overnight";

  // ✅ Stagione auto basata sulla data corretta:
  // - Overnight → dateFrom
  // - altrimenti → date
  const seasonBaseDate = useMemo(() => {
    const base = usesOvernightDates ? dateFrom : date;
    return parseISODateOnly(base);
  }, [usesOvernightDates, dateFrom, date]);

  const autoSeason = useMemo<SeasonKey>(() => {
    if (!seasonBaseDate) return getSeasonFromDate(new Date());
    return getSeasonFromDate(seasonBaseDate);
  }, [seasonBaseDate]);

  const season: SeasonKey = seasonMode === "auto" ? autoSeason : manualSeason;

  // ✅ Notti calcolate quando la base è Overnight (anche se sei in Personalizzata)
  const nights = useMemo(() => {
    if (!usesOvernightDates) return 0;
    if (!dateFrom || !dateTo) return 0;
    const n = nightsBetween(dateFrom, dateTo);
    return n > 0 ? n : 0;
  }, [usesOvernightDates, dateFrom, dateTo]);

  const basePrice = useMemo(() => {
    return calcBasePrice({ season, exp: baseExpForCalc, nights });
  }, [season, baseExpForCalc, nights]);

  // ✅ Label pernottamento: mostra sempre €/notte anche se notti=0
  const priceLabel = useMemo(() => {
    if (baseExpForCalc === "overnight") {
      const perNight = PRICES[season].night;
      if (!nights) return `${formatEUR(perNight)} / notte`;
      return `${formatEUR(perNight)} × ${nights} notti`;
    }
    return basePrice !== null ? formatEUR(basePrice) : "Da definire";
  }, [season, nights, baseExpForCalc, basePrice]);

  // ✅ Extra totale: SEMPRE calcolato (ma UI per selezionarli resta solo in Personalizzata)
  const extrasTotal = useMemo(() => {
    const catering = extraCatering ? EXTRA.cateringPerPerson * people : 0;
    return (
      (extraSeabob ? EXTRA.seabob : 0) +
      (extraDrinks ? EXTRA.drinksPremium : 0) +
      catering +
      (extraGopro ? EXTRA.gopro : 0) +
      (extraCleaning ? EXTRA.cleaning : 0)
    );
  }, [extraSeabob, extraDrinks, extraCatering, extraGopro, extraCleaning, people]);

  // ✅ Totale = base servizio + extra (sempre)
  const totalEstimated = useMemo(() => {
    return (basePrice ?? 0) + extrasTotal;
  }, [basePrice, extrasTotal]);

  // ✅ Auto-fix date: evita A prima di Da (senza cambiare UI)
  function setFromSafe(v: string) {
    setDateFrom(v);
    // se A <= Da, metti A = Da + 1
    if (dateTo && v && dateTo <= v) {
      const d = parseISODateOnly(v);
      if (d) {
        d.setDate(d.getDate() + 1);
        setDateTo(toISODateInputValue(d));
      }
    }
  }
  function setToSafe(v: string) {
    // se A <= Da, metti A = Da + 1
    if (dateFrom && v && v <= dateFrom) {
      const d = parseISODateOnly(dateFrom);
      if (d) {
        d.setDate(d.getDate() + 1);
        setDateTo(toISODateInputValue(d));
        return;
      }
    }
    setDateTo(v);
  }

  const whatsappText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Ciao! Vorrei fare una *richiesta* per ${BOAT.name} (${BOAT.location}).`);
    lines.push("");

    const baseTitle = EXPERIENCES.find((e) => e.id === baseExpForCalc)?.title ?? baseExpForCalc;

    if (selected === "custom") {
      lines.push(`*Esperienza:* Personalizzata (extra)`);
      lines.push(`*Base selezionata:* ${baseTitle}`);
    } else if (selected === "halfday") {
      lines.push(`*Esperienza:* ${experience.title} (${experience.durationLabel}) — ${halfdaySlot}`);
    } else {
      lines.push(`*Esperienza:* ${experience.title} (${experience.durationLabel})`);
    }

    // Date (coerenti con base)
    if (usesOvernightDates) {
      lines.push(`*Da:* ${dateFrom}`);
      lines.push(`*A:* ${dateTo}`);
      lines.push(`*Notti:* ${nights || "—"}`);
      lines.push(`*Prezzo notte:* ${formatEUR(PRICES[season].night)} (${season})`);
      lines.push(`*Dettaglio:* ${priceLabel}`);
    } else {
      lines.push(`*Data:* ${date}`);
      lines.push(`*Prezzo base stimato:* ${basePrice !== null ? formatEUR(basePrice) : "Da definire"} (${season})`);
    }

    lines.push(`*Persone:* ${people}`);

    if (extrasTotal > 0) lines.push(`*Extra:* ${formatEUR(extrasTotal)}`);
    lines.push(`*Totale stimato:* ${formatEUR(totalEstimated)}`);

    lines.push("");
    lines.push("*Incluso:* skipper, maschere e boccaglio, paddle SUP, dinghy.");
    lines.push("*Non incluso:* carburante e cambusa.");

    if (name.trim()) lines.push(`*Nome:* ${name.trim()}`);
    if (notes.trim()) lines.push(`*Note:* ${notes.trim()}`);

    lines.push("");
    lines.push("Grazie! 🙏");
    return encodeURIComponent(lines.join("\n"));
  }, [
    selected,
    experience.title,
    experience.durationLabel,
    baseExpForCalc,
    usesOvernightDates,
    date,
    dateFrom,
    dateTo,
    nights,
    people,
    basePrice,
    season,
    name,
    notes,
    halfdaySlot,
    extrasTotal,
    totalEstimated,
    priceLabel,
  ]);

  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

  const heroSrc = BOAT_IMAGES[Math.max(0, Math.min(imgIndex, BOAT_IMAGES.length - 1))];

  function prevImg() {
    setImgIndex((i) => (i - 1 + BOAT_IMAGES.length) % BOAT_IMAGES.length);
  }
  function nextImg() {
    setImgIndex((i) => (i + 1) % BOAT_IMAGES.length);
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-500 via-cyan-500 to-indigo-700">
      <div className="mx-auto max-w-md px-4 pt-6 pb-24">
        <div className="rounded-[28px] bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white drop-shadow-sm">Richiesta prenotazione</h1>
              <p className="text-white/85 mt-1">
                Questa è una <b>richiesta</b>, non una prenotazione automatica. Verifichiamo la disponibilità e ti rispondiamo su WhatsApp.
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/70">Barca</div>
              <div className="font-semibold text-white">{BOAT.name}</div>
              <div className="text-sm text-white/85">{BOAT.location}</div>
            </div>
          </div>

          <div className="mt-5 rounded-[28px] bg-white/95 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />

            {/* GALLERIA */}
            <div className="p-4">
              <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                <img src={heroSrc} alt={`${BOAT.name} foto`} className="w-full h-56 object-cover" />
                <button
                  type="button"
                  onClick={prevImg}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-gray-200 shadow px-3 py-2 text-sm font-bold"
                  aria-label="Foto precedente"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={nextImg}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/90 border border-gray-200 shadow px-3 py-2 text-sm font-bold"
                  aria-label="Foto successiva"
                >
                  ›
                </button>
              </div>

              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {BOAT_IMAGES.map((src, idx) => {
                  const active = idx === imgIndex;
                  return (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setImgIndex(idx)}
                      className={[
                        "shrink-0 rounded-xl overflow-hidden border transition",
                        active ? "border-transparent ring-2 ring-sky-200" : "border-gray-200 hover:border-gray-300",
                      ].join(" ")}
                      aria-label={`Apri foto ${idx + 1}`}
                    >
                      <img src={src} alt={`Miniatura ${idx + 1}`} className="h-14 w-20 object-cover" />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-5 pb-5 space-y-5">
              {/* ESPERIENZE */}
              <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Scegli l’esperienza</h2>
                <div className="grid grid-cols-2 gap-3">
                  {EXPERIENCES.map((exp) => {
                    const active = exp.id === selected;
                    return (
                      <button
                        key={exp.id}
                        type="button"
                        onClick={() => onSelectExperience(exp.id)}
                        className={[
                          "text-left rounded-2xl border p-3 transition",
                          "shadow-[0_6px_16px_rgba(0,0,0,0.06)]",
                          active
                            ? "border-transparent ring-2 ring-sky-200 bg-gradient-to-b from-white to-sky-50"
                            : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <div className="font-semibold">{exp.title}</div>
                        <div className="text-xs text-gray-600 mt-1">{exp.subtitle}</div>
                        <div className="mt-2 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium bg-gray-100 text-gray-700">
                          {exp.durationLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* EXTRA (UI SOLO in Personalizzata) */}
              {selected === "custom" && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-gray-500">Extra (opzionali)</div>
                      <div className="font-bold text-gray-900">Seleziona e vedi il totale</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Totale extra</div>
                      <div className="font-extrabold text-gray-900">{formatEUR(extrasTotal)}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={extraSeabob} onChange={(e) => setExtraSeabob(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="text-gray-900">Seabob</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.seabob)}</span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={extraDrinks} onChange={(e) => setExtraDrinks(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="text-gray-900">Bevande Premium</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.drinksPremium)}</span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={extraCatering} onChange={(e) => setExtraCatering(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="text-gray-900">Catering</span>
                      </div>
                      <span className="font-semibold text-gray-900">
                        {formatEUR(EXTRA.cateringPerPerson)} × {people}
                      </span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={extraGopro} onChange={(e) => setExtraGopro(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="text-gray-900">Foto/Video (GoPro)</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.gopro)}</span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={extraCleaning} onChange={(e) => setExtraCleaning(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
                        <span className="text-gray-900">Pulizia finale</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.cleaning)}</span>
                    </label>

                    <p className="text-xs text-gray-500">
                      Bevande Premium: pacchetto aperitivo per il gruppo (fino a 12 persone). Catering: {formatEUR(EXTRA.cateringPerPerson)} a persona.
                    </p>
                  </div>
                </section>
              )}

              {/* DATA + PERSONE */}
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">{usesOvernightDates ? "Date" : "Data"}</label>

                  {usesOvernightDates ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-xs text-gray-600 mb-1">Da</div>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => setFromSafe(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-gray-600 mb-1">A</div>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => setToSafe(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                        />
                      </div>
                      <div className="text-xs text-gray-700">
                        Notti:{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-1 bg-sky-50 text-sky-700 font-semibold">
                          {nights || "—"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                      />
                      <div className="mt-2 text-xs text-gray-700">
                        Stagione (auto):{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-1 bg-sky-50 text-sky-700 font-semibold">
                          {autoSeason}
                        </span>
                      </div>
                    </>
                  )}

                  {selected === "halfday" && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {(["Mattina", "Pomeriggio"] as HalfDaySlot[]).map((s) => {
                        const active = halfdaySlot === s;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setHalfdaySlot(s)}
                            className={[
                              "rounded-xl px-3 py-2 text-xs font-semibold border transition",
                              "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                              active
                                ? "border-transparent bg-gradient-to-b from-sky-50 to-white ring-2 ring-sky-200"
                                : "border-gray-200 bg-white hover:border-gray-300",
                            ].join(" ")}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-900">Persone</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={people}
                    onChange={(e) => setPeople(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                  <div className="mt-2 text-xs text-gray-500">Max 12 (modificabile)</div>
                </div>
              </section>

              {/* SELETTORE STAGIONE */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-gray-500">Stagione prezzi</div>
                    <div className="font-bold text-gray-900">
                      {seasonMode === "auto" ? `Automatica (${autoSeason})` : `Manuale (${manualSeason})`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeasonMode("auto")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "auto" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200",
                      ].join(" ")}
                    >
                      Auto
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeasonMode("manual")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "manual" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-700 border-gray-200",
                      ].join(" ")}
                    >
                      Manuale
                    </button>
                  </div>
                </div>

                {seasonMode === "manual" && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(["Bassa", "Media", "Alta"] as SeasonKey[]).map((s) => {
                      const active = manualSeason === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setManualSeason(s)}
                          className={[
                            "rounded-xl px-3 py-2 text-sm font-semibold border transition",
                            "shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]",
                            active ? "border-transparent bg-gradient-to-b from-sky-50 to-white ring-2 ring-sky-200" : "border-gray-200 bg-white hover:border-gray-300",
                          ].join(" ")}
                        >
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}

                <p className="text-xs text-gray-500 mt-3">
                  Metti <b>Manuale</b> per vedere i prezzi in Alta/Media/Bassa senza cambiare data.
                </p>
              </section>

              {/* PREZZO */}
              <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 to-white p-4 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500">Prezzo stimato</div>

                    {baseExpForCalc === "overnight" ? (
                      <>
                        <div className="text-lg font-extrabold">{formatEUR(PRICES[season].night)} / notte</div>
                        <div className="text-xs text-gray-600 mt-1">{priceLabel}</div>
                        {extrasTotal > 0 && <div className="text-xs text-gray-600 mt-1">Extra: {formatEUR(extrasTotal)}</div>}
                        <div className="text-xs text-gray-700 mt-1">
                          Totale stimato: <b>{formatEUR(totalEstimated)}</b>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-extrabold">{basePrice !== null ? formatEUR(basePrice) : "Da definire"}</div>
                        {extrasTotal > 0 && <div className="text-xs text-gray-600 mt-1">Extra: {formatEUR(extrasTotal)}</div>}
                        <div className="text-xs text-gray-700 mt-1">
                          Totale stimato: <b>{formatEUR(totalEstimated)}</b>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-gray-500">Stagione</div>
                    <div className="font-semibold">{season}</div>
                  </div>
                </div>

                <p className="text-xs text-gray-600 mt-2">
                  *Prezzo indicativo. Confermiamo disponibilità e dettagli su WhatsApp.
                </p>
              </section>

              {/* DATI */}
              <section className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">Nome (opzionale)</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Es. Renan"
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-900">Note (opzionale)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Orario preferito, porto, richieste speciali…"
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div className="text-xs text-gray-600">
                  <b>Incluso:</b> skipper, maschere e boccaglio, paddle SUP, dinghy. <b>Non incluso:</b> carburante e cambusa.
                </div>
              </section>

              {/* CTA WhatsApp */}
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-2xl text-white text-center font-extrabold py-3 shadow-[0_14px_30px_rgba(16,185,129,0.35)] active:scale-[0.99] transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                Invia richiesta su WhatsApp
              </a>

              <p className="text-xs text-gray-500 text-center">
                Ti rispondiamo su WhatsApp appena verifichiamo la disponibilità.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
