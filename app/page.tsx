"use client";

import React, { useEffect, useMemo, useState } from "react";

type Lang = "es" | "en" | "it" | "fr" | "de" | "ru";
type ExperienceId = "half_am" | "half_pm" | "day" | "sunset" | "overnight";
type Interval = [number, number]; // minuti [start,end)
type BusyMap = Record<string, Interval[]>;

type ApiResponse = {
  ok: boolean;
  tz?: string;
  closed: string[];
  busy: BusyMap;
  v?: number;
};

/* =========================
   CONFIG — MODIFICA QUI
   ========================= */

// ✅ Metti qui i PERCORSI REALI delle tue 10 foto in /public
// Esempio: se hai /public/hero/1.jpg allora scrivi "/hero/1.jpg"
const HERO_IMAGES: string[] = [
  "/hero/1.jpg",
  "/hero/2.jpg",
  "/hero/3.jpg",
  "/hero/4.jpg",
  "/hero/5.jpg",
  "/hero/6.jpg",
  "/hero/7.jpg",
  "/hero/8.jpg",
  "/hero/9.jpg",
  "/hero/10.jpg",
];

// Timezone
const TZ = "Europe/Madrid";

// Orari definitivi
const SLOT: Record<ExperienceId, Interval | null> = {
  half_am: [10 * 60, 14 * 60], // 10:00–14:00
  half_pm: [14 * 60 + 30, 18 * 60 + 30], // 14:30–18:30
  day: [10 * 60, 18 * 60], // 10:00–18:00
  sunset: [19 * 60, 21 * 60 + 30], // ✅ 19:00–21:30
  overnight: null, // multi-day
};

// Prezzi stagionali (Lagoon 380 – Ibiza) confermati
type Season = "low" | "mid" | "high";
const SEASON_PRICES: Record<
  Season,
  { day: number; halfday: number; sunset: number; night: number }
> = {
  low: { day: 650, halfday: 450, sunset: 420, night: 350 },
  mid: { day: 850, halfday: 600, sunset: 520, night: 450 },
  high: { day: 1100, halfday: 780, sunset: 650, night: 600 },
};

// Mappa mesi → stagione (puoi cambiarla come vuoi)
function seasonFromDateISO(dateISO: string): Season {
  // dateISO: YYYY-MM-DD
  const m = Number(dateISO.slice(5, 7)); // 1..12
  // Scelta pratica (modificabile):
  // Low: Nov–Mar, Mid: Apr–May & Oct, High: Jun–Sep
  if (m === 11 || m === 12 || m === 1 || m === 2 || m === 3) return "low";
  if (m === 4 || m === 5 || m === 10) return "mid";
  return "high"; // 6,7,8,9
}

// Spese fisse obbligatorie (metti i tuoi numeri)
const FIXED_COSTS = [
  { id: "skipper", labelKey: "fixed_skipper", price: 0 },
  { id: "fuel", labelKey: "fixed_fuel", price: 0 },
  { id: "cleaning", labelKey: "fixed_cleaning", price: 0 },
  { id: "diesel", labelKey: "fixed_diesel", price: 0 },
];

// Extra opzionali (prezzi confermati)
const EXTRA_PRICES = {
  seabob: 650, // ciascuno
  catering_pp: 25, // a persona
  drinks_pack: 150, // totale (12 persone)
  towel: 15, // a telo
};

// Link pagamento (metti il tuo link Stripe / checkout)
const PAYMENT_URL = "#";

/* =========================
   TESTI (6 LINGUE)
   ========================= */

const I18N: Record<
  Lang,
  {
    langLabel: string;
    title: string;
    subtitle: string;
    selectDate: string;
    loading: string;
    available: string;
    notAvailable: string;
    experiences: string;
    fixedCosts: string;
    extras: string;
    includedFree: string;
    total: string;
    bookWhatsapp: string;
    payNow: string;
    people: string;
    nights: string;
    dateFrom: string;
    dateTo: string;

    exp_half_am: string;
    exp_half_pm: string;
    exp_day: string;
    exp_sunset: string;
    exp_overnight: string;

    half_am_sub: string;
    half_pm_sub: string;
    day_sub: string;
    sunset_sub: string;
    overnight_sub: string;

    fixed_skipper: string;
    fixed_fuel: string;
    fixed_cleaning: string;
    fixed_diesel: string;

    extra_seabob: string;
    extra_catering: string;
    extra_drinks: string;
    extra_towel: string;

    free_sup: string;
    free_snorkel: string;
    free_buoy: string;
    free_dinghy: string;

    season_low: string;
    season_mid: string;
    season_high: string;

    summary: string;
  }
> = {
  it: {
    langLabel: "Italiano",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Esperienze private in catamarano",
    selectDate: "Seleziona data",
    loading: "Carico…",
    available: "Disponibile",
    notAvailable: "Non disponibile",
    experiences: "Esperienze",
    fixedCosts: "Spese fisse (obbligatorie)",
    extras: "Extra (opzionali)",
    includedFree: "Inclusi gratis",
    total: "Totale",
    bookWhatsapp: "Prenota su WhatsApp",
    payNow: "Paga ora",
    people: "Persone",
    nights: "Notti",
    dateFrom: "Da",
    dateTo: "A",
    exp_half_am: "Mezza Giornata (Mattina)",
    exp_half_pm: "Mezza Giornata (Pomeriggio)",
    exp_day: "Day Charter",
    exp_sunset: "Sunset",
    exp_overnight: "Pernottamento",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-day (Date Da/A)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Carburante",
    fixed_cleaning: "Pulizie",
    fixed_diesel: "Gasolio",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Pacchetto bevande (12 persone)",
    extra_towel: "Teli mare",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Maschera + tubo snorkeling",
    free_buoy: "Boe / buoy",
    free_dinghy: "Dinghy",
    season_low: "Bassa",
    season_mid: "Media",
    season_high: "Alta",
    summary: "Riepilogo",
  },
  es: {
    langLabel: "Español",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Experiencias privadas en catamarán",
    selectDate: "Elige fecha",
    loading: "Cargando…",
    available: "Disponible",
    notAvailable: "No disponible",
    experiences: "Experiencias",
    fixedCosts: "Costes fijos (obligatorios)",
    extras: "Extras (opcionales)",
    includedFree: "Incluido gratis",
    total: "Total",
    bookWhatsapp: "Reservar por WhatsApp",
    payNow: "Pagar ahora",
    people: "Personas",
    nights: "Noches",
    dateFrom: "Desde",
    dateTo: "Hasta",
    exp_half_am: "Media jornada (Mañana)",
    exp_half_pm: "Media jornada (Tarde)",
    exp_day: "Día completo",
    exp_sunset: "Sunset",
    exp_overnight: "Pernocta",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-day (fechas)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Combustible",
    fixed_cleaning: "Limpieza",
    fixed_diesel: "Gasoil",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Pack bebidas (12 personas)",
    extra_towel: "Toallas",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Máscara + tubo snorkel",
    free_buoy: "Boyas",
    free_dinghy: "Dinghy",
    season_low: "Baja",
    season_mid: "Media",
    season_high: "Alta",
    summary: "Resumen",
  },
  en: {
    langLabel: "English",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Private catamaran experiences",
    selectDate: "Select date",
    loading: "Loading…",
    available: "Available",
    notAvailable: "Not available",
    experiences: "Experiences",
    fixedCosts: "Fixed costs (mandatory)",
    extras: "Extras (optional)",
    includedFree: "Included for free",
    total: "Total",
    bookWhatsapp: "Book on WhatsApp",
    payNow: "Pay now",
    people: "People",
    nights: "Nights",
    dateFrom: "From",
    dateTo: "To",
    exp_half_am: "Half Day (Morning)",
    exp_half_pm: "Half Day (Afternoon)",
    exp_day: "Day Charter",
    exp_sunset: "Sunset",
    exp_overnight: "Overnight",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-day (date range)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Fuel",
    fixed_cleaning: "Cleaning",
    fixed_diesel: "Diesel",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Drinks pack (12 people)",
    extra_towel: "Beach towels",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Mask + snorkel tube",
    free_buoy: "Buoys",
    free_dinghy: "Dinghy",
    season_low: "Low",
    season_mid: "Mid",
    season_high: "High",
    summary: "Summary",
  },
  fr: {
    langLabel: "Français",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Expériences privées en catamaran",
    selectDate: "Choisir une date",
    loading: "Chargement…",
    available: "Disponible",
    notAvailable: "Indisponible",
    experiences: "Expériences",
    fixedCosts: "Frais fixes (obligatoires)",
    extras: "Extras (optionnels)",
    includedFree: "Inclus gratuitement",
    total: "Total",
    bookWhatsapp: "Réserver sur WhatsApp",
    payNow: "Payer maintenant",
    people: "Personnes",
    nights: "Nuits",
    dateFrom: "Du",
    dateTo: "Au",
    exp_half_am: "Demi-journée (Matin)",
    exp_half_pm: "Demi-journée (Après-midi)",
    exp_day: "Journée",
    exp_sunset: "Sunset",
    exp_overnight: "Nuit",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-jours (dates)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Carburant",
    fixed_cleaning: "Nettoyage",
    fixed_diesel: "Gazole",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Pack boissons (12 pers.)",
    extra_towel: "Serviettes",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Masque + tuba",
    free_buoy: "Bouées",
    free_dinghy: "Dinghy",
    season_low: "Basse",
    season_mid: "Moyenne",
    season_high: "Haute",
    summary: "Résumé",
  },
  de: {
    langLabel: "Deutsch",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Private Katamaran-Erlebnisse",
    selectDate: "Datum wählen",
    loading: "Lädt…",
    available: "Verfügbar",
    notAvailable: "Nicht verfügbar",
    experiences: "Erlebnisse",
    fixedCosts: "Fixkosten (pflichtig)",
    extras: "Extras (optional)",
    includedFree: "Kostenlos inklusive",
    total: "Gesamt",
    bookWhatsapp: "Über WhatsApp buchen",
    payNow: "Jetzt bezahlen",
    people: "Personen",
    nights: "Nächte",
    dateFrom: "Von",
    dateTo: "Bis",
    exp_half_am: "Halbtags (Vormittag)",
    exp_half_pm: "Halbtags (Nachmittag)",
    exp_day: "Tag",
    exp_sunset: "Sunset",
    exp_overnight: "Übernachtung",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Mehrere Tage (Datumsspanne)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Treibstoff",
    fixed_cleaning: "Reinigung",
    fixed_diesel: "Diesel",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Getränkepaket (12 Pers.)",
    extra_towel: "Handtücher",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Maske + Schnorchel",
    free_buoy: "Bojen",
    free_dinghy: "Dinghy",
    season_low: "Niedrig",
    season_mid: "Mittel",
    season_high: "Hoch",
    summary: "Zusammenfassung",
  },
  ru: {
    langLabel: "Русский",
    title: "Lagoon 380 · Ibiza",
    subtitle: "Частные прогулки на катамаране",
    selectDate: "Выберите дату",
    loading: "Загрузка…",
    available: "Доступно",
    notAvailable: "Недоступно",
    experiences: "Опыт",
    fixedCosts: "Фиксированные расходы (обязательно)",
    extras: "Доп. услуги (опционально)",
    includedFree: "Включено бесплатно",
    total: "Итого",
    bookWhatsapp: "Бронь в WhatsApp",
    payNow: "Оплатить",
    people: "Люди",
    nights: "Ночи",
    dateFrom: "С",
    dateTo: "По",
    exp_half_am: "Полдня (утро)",
    exp_half_pm: "Полдня (день)",
    exp_day: "День",
    exp_sunset: "Sunset",
    exp_overnight: "Ночёвка",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Несколько дней (диапазон)",
    fixed_skipper: "Шкипер",
    fixed_fuel: "Топливо",
    fixed_cleaning: "Уборка",
    fixed_diesel: "Дизель",
    extra_seabob: "SeaBob",
    extra_catering: "Кейтеринг",
    extra_drinks: "Напитки (12 человек)",
    extra_towel: "Полотенца",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Маска + трубка",
    free_buoy: "Буи",
    free_dinghy: "Dinghy",
    season_low: "Низкий",
    season_mid: "Средний",
    season_high: "Высокий",
    summary: "Итог",
  },
};

/* =========================
   UTILS
   ========================= */

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

function compareISO(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function overlaps(a: Interval, b: Interval) {
  return a[0] < b[1] && b[0] < a[1];
}

function isSlotBlocked(busy: Interval[], slot: Interval) {
  return busy.some((it) => overlaps(it, slot));
}

function minToHHMM(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const pad = (x: number) => (x < 10 ? `0${x}` : `${x}`);
  return `${pad(h)}:${pad(m)}`;
}

function formatInterval(it: Interval) {
  return `${minToHHMM(it[0])}–${minToHHMM(it[1])}`;
}

/* =========================
   UI PARTS
   ========================= */

function Card({
  title,
  children,
  right,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-white/30 bg-white/90 shadow-[0_14px_36px_rgba(0,0,0,0.12)] backdrop-blur px-5 py-5">
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="text-lg font-extrabold text-slate-900">{title}</div>
          {right ? <div className="shrink-0">{right}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold",
        ok
          ? "bg-sky-50 text-slate-900 border border-sky-100"
          : "bg-slate-100 text-slate-600 border border-slate-200",
      ].join(" ")}
    >
      {ok ? "✅" : "❌"} {label}
    </span>
  );
}

function Qty({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1">
      <button
        type="button"
        className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-extrabold text-slate-800"
        onClick={() => onChange(Math.max(0, value - 1))}
        aria-label="minus"
      >
        −
      </button>
      <div className="w-10 text-center text-base font-extrabold text-slate-900">
        {value}
      </div>
      <button
        type="button"
        className="h-9 w-9 rounded-lg border border-slate-200 text-lg font-extrabold text-slate-800"
        onClick={() => onChange(value + 1)}
        aria-label="plus"
      >
        +
      </button>
    </div>
  );
}

/* =========================
   MAIN PAGE
   ========================= */

export default function Page() {
  // lingua
  const [lang, setLang] = useState<Lang>("it");
  const t = I18N[lang];

  // hero slider
  const [heroIdx, setHeroIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroIdx((x) => (x + 1) % HERO_IMAGES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  // date / range
  const [selectedDate, setSelectedDate] = useState<string>(() => todayInTz(TZ));
  const [dateFrom, setDateFrom] = useState<string>(() => todayInTz(TZ));
  const [dateTo, setDateTo] = useState<string>(() => todayInTz(TZ));

  // esperienza selezionata
  const [experience, setExperience] = useState<ExperienceId>("half_am");

  // persone (per catering)
  const [people, setPeople] = useState<number>(2);

  // extras
  const [seabobQty, setSeabobQty] = useState<number>(0);
  const [towelQty, setTowelQty] = useState<number>(0);
  const [drinksPack, setDrinksPack] = useState<boolean>(false);

  // catering: per persona → checkbox + usa "people"
  const [catering, setCatering] = useState<boolean>(false);

  // disponibilità api (se esiste)
  const [api, setApi] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // carico disponibilità solo per data singola (non per overnight)
  useEffect(() => {
    let alive = true;

    async function load() {
      if (experience === "overnight") {
        // per overnight usiamo solo la chiusura full-day del check-in/check-out se vuoi in futuro
        setApi(null);
        return;
      }

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
  }, [selectedDate, experience]);

  const season = useMemo(() => seasonFromDateISO(selectedDate), [selectedDate]);

  const seasonLabel = useMemo(() => {
    if (season === "low") return t.season_low;
    if (season === "mid") return t.season_mid;
    return t.season_high;
  }, [season, t]);

  const basePrice = useMemo(() => {
    const p = SEASON_PRICES[season];
    if (experience === "day") return p.day;
    if (experience === "half_am" || experience === "half_pm") return p.halfday;
    if (experience === "sunset") return p.sunset;
    if (experience === "overnight") {
      // prezzo per notte
      // numero notti = differenza date (semplificato: conta giorni tra date)
      // Se date uguali → 1 notte (scelta pratica)
      if (compareISO(dateFrom, dateTo) === 0) return p.night;
      // calcolo notti: (dateTo - dateFrom) in giorni
      const a = new Date(`${dateFrom}T00:00:00`);
      const b = new Date(`${dateTo}T00:00:00`);
      const diffDays = Math.max(
        1,
        Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
      );
      return p.night * diffDays;
    }
    return 0;
  }, [experience, season, dateFrom, dateTo]);

  const fixedTotal = useMemo(
    () => FIXED_COSTS.reduce((sum, x) => sum + (x.price || 0), 0),
    []
  );

  const extrasTotal = useMemo(() => {
    const seabob = seabobQty * EXTRA_PRICES.seabob;
    const towel = towelQty * EXTRA_PRICES.towel;
    const drinks = drinksPack ? EXTRA_PRICES.drinks_pack : 0;
    const cat = catering ? people * EXTRA_PRICES.catering_pp : 0;
    return seabob + towel + drinks + cat;
  }, [seabobQty, towelQty, drinksPack, catering, people]);

  const grandTotal = useMemo(() => basePrice + fixedTotal + extrasTotal, [
    basePrice,
    fixedTotal,
    extrasTotal,
  ]);

  const { closedSet, intervals } = useMemo(() => {
    const closedSet = new Set(api?.closed ?? []);
    const raw = api?.busy?.[selectedDate] ?? [];
    const intervals: Interval[] = raw.map((it) => [it[0], it[1]]);
    return { closedSet, intervals };
  }, [api, selectedDate]);

  const isClosedAllDay = useMemo(
    () => closedSet.has(selectedDate),
    [closedSet, selectedDate]
  );

  // blocchi slot (solo per esperienze a data singola)
  const availability = useMemo(() => {
    const slot = SLOT;
    const dayBlocked =
      isClosedAllDay || (slot.day ? isSlotBlocked(intervals, slot.day) : false);
    const halfAMBlocked =
      isClosedAllDay ||
      (slot.half_am ? isSlotBlocked(intervals, slot.half_am) : false);
    const halfPMBlocked =
      isClosedAllDay ||
      (slot.half_pm ? isSlotBlocked(intervals, slot.half_pm) : false);
    const sunsetBlocked =
      isClosedAllDay ||
      (slot.sunset ? isSlotBlocked(intervals, slot.sunset) : false);

    return {
      dayBlocked,
      halfAMBlocked,
      halfPMBlocked,
      sunsetBlocked,
      overnightBlocked: isClosedAllDay, // scelta: overnight bloccato solo da evento tutto il giorno
    };
  }, [intervals, isClosedAllDay]);

  const expDefs = useMemo(() => {
    return [
      {
        id: "half_am" as const,
        title: t.exp_half_am,
        sub: t.half_am_sub,
        blocked: availability.halfAMBlocked,
      },
      {
        id: "half_pm" as const,
        title: t.exp_half_pm,
        sub: t.half_pm_sub,
        blocked: availability.halfPMBlocked,
      },
      {
        id: "day" as const,
        title: t.exp_day,
        sub: t.day_sub,
        blocked: availability.dayBlocked,
      },
      {
        id: "sunset" as const,
        title: t.exp_sunset,
        sub: t.sunset_sub,
        blocked: availability.sunsetBlocked,
      },
      {
        id: "overnight" as const,
        title: t.exp_overnight,
        sub: t.overnight_sub,
        blocked: availability.overnightBlocked,
      },
    ];
  }, [t, availability]);

  const selectedIntervalLabel = useMemo(() => {
    const it = SLOT[experience];
    if (experience === "overnight") return `${dateFrom} → ${dateTo}`;
    if (!it) return "";
    return `${selectedDate} • ${formatInterval(it)} (${TZ})`;
  }, [experience, selectedDate, dateFrom, dateTo]);

  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`${t.title}`);
    lines.push(`${t.summary}:`);
    const expTitle =
      experience === "half_am"
        ? t.exp_half_am
        : experience === "half_pm"
        ? t.exp_half_pm
        : experience === "day"
        ? t.exp_day
        : experience === "sunset"
        ? t.exp_sunset
        : t.exp_overnight;

    lines.push(`• ${expTitle}`);
    lines.push(`• ${selectedIntervalLabel}`);
    lines.push(`• ${t.people}: ${people}`);

    // extra scelti
    const ex: string[] = [];
    if (seabobQty > 0) ex.push(`${t.extra_seabob} x${seabobQty} (${euro(seabobQty * EXTRA_PRICES.seabob)})`);
    if (towelQty > 0) ex.push(`${t.extra_towel} x${towelQty} (${euro(towelQty * EXTRA_PRICES.towel)})`);
    if (drinksPack) ex.push(`${t.extra_drinks} (${euro(EXTRA_PRICES.drinks_pack)})`);
    if (catering) ex.push(`${t.extra_catering} ${people}p (${euro(people * EXTRA_PRICES.catering_pp)})`);

    lines.push(`• ${t.fixedCosts}: ${euro(fixedTotal)}`);
    lines.push(`• ${t.extras}: ${euro(extrasTotal)}`);
    lines.push(`• ${t.total}: ${euro(grandTotal)}`);

    if (ex.length) {
      lines.push(`Extras:`);
      ex.forEach((x) => lines.push(`  - ${x}`));
    }

    return lines.join("\n");
  }, [
    t,
    experience,
    selectedIntervalLabel,
    people,
    seabobQty,
    towelQty,
    drinksPack,
    catering,
    fixedTotal,
    extrasTotal,
    grandTotal,
  ]);

  const whatsappHref = useMemo(() => {
    const encoded = encodeURIComponent(summaryText);
    return `https://wa.me/?text=${encoded}`;
  }, [summaryText]);

  // UI
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-600 via-sky-500 to-sky-200">
      {/* HERO */}
      <section className="relative">
        <div className="relative h-[420px] sm:h-[520px] overflow-hidden">
          <img
            src={HERO_IMAGES[heroIdx] || HERO_IMAGES[0]}
            alt="hero"
            className="h-full w-full object-cover"
          />
          {/* overlay per leggibilità */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/30 to-black/10" />

          {/* top bar: lingua */}
          <div className="absolute left-0 right-0 top-0 z-10 px-4 pt-4">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-extrabold text-white backdrop-blur border border-white/20">
                Blu Horizonte
              </div>

              <div className="rounded-2xl bg-white/15 backdrop-blur border border-white/20 px-3 py-2">
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as Lang)}
                  className="bg-transparent text-white font-extrabold outline-none"
                  aria-label="language"
                >
                  <option value="es">🇪🇸 Español</option>
                  <option value="en">🇬🇧 English</option>
                  <option value="it">🇮🇹 Italiano</option>
                  <option value="fr">🇫🇷 Français</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="ru">🇷🇺 Русский</option>
                </select>
              </div>
            </div>
          </div>

          {/* testo hero */}
          <div className="absolute inset-0 z-10 flex items-end px-4 pb-8">
            <div className="mx-auto w-full max-w-6xl">
              <div className="max-w-3xl">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]">
                  {t.title}
                </h1>
                <p className="mt-2 text-lg sm:text-xl font-bold text-white/90 drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]">
                  {t.subtitle}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-extrabold text-white backdrop-blur border border-white/20">
                  Season: {seasonLabel}
                </div>
              </div>

              {/* dots + frecce */}
              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {HERO_IMAGES.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setHeroIdx(i)}
                      className={[
                        "h-2.5 w-2.5 rounded-full border border-white/40",
                        i === heroIdx ? "bg-white" : "bg-white/20",
                      ].join(" ")}
                      aria-label={`hero-${i + 1}`}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setHeroIdx((x) => (x - 1 + HERO_IMAGES.length) % HERO_IMAGES.length)
                    }
                    className="rounded-xl bg-white/15 px-3 py-2 text-white font-extrabold border border-white/20 backdrop-blur"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setHeroIdx((x) => (x + 1) % HERO_IMAGES.length)}
                    className="rounded-xl bg-white/15 px-3 py-2 text-white font-extrabold border border-white/20 backdrop-blur"
                  >
                    ›
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl grid gap-5 lg:grid-cols-3">
          {/* COL SX (esperienze + date) */}
          <div className="lg:col-span-2 grid gap-5">
            {/* Date */}
            <Card
              title={t.selectDate}
              right={
                <div className="text-sm font-extrabold text-slate-700">
                  {loading ? t.loading : "✓"}
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {experience !== "overnight" ? (
                  <label className="block">
                    <div className="text-xs font-extrabold text-slate-600 mb-1">
                      {t.selectDate}
                    </div>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none"
                    />
                  </label>
                ) : (
                  <>
                    <label className="block">
                      <div className="text-xs font-extrabold text-slate-600 mb-1">
                        {t.dateFrom}
                      </div>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none"
                      />
                    </label>
                    <label className="block">
                      <div className="text-xs font-extrabold text-slate-600 mb-1">
                        {t.dateTo}
                      </div>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none"
                      />
                    </label>
                  </>
                )}

                <label className="block">
                  <div className="text-xs font-extrabold text-slate-600 mb-1">
                    {t.people}
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={people}
                    onChange={(e) => setPeople(Math.max(1, Number(e.target.value || 1)))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none"
                  />
                </label>
              </div>

              {/* pills availability */}
              <div className="mt-4 flex flex-wrap gap-2">
                <Pill ok={!availability.halfAMBlocked} label={`${t.exp_half_am} ${t.half_am_sub}`} />
                <Pill ok={!availability.halfPMBlocked} label={`${t.exp_half_pm} ${t.half_pm_sub}`} />
                <Pill ok={!availability.dayBlocked} label={`${t.exp_day} ${t.day_sub}`} />
                <Pill ok={!availability.sunsetBlocked} label={`${t.exp_sunset} ${t.sunset_sub}`} />
              </div>
            </Card>

            {/* Esperienze */}
            <Card title={t.experiences}>
              <div className="grid gap-4 sm:grid-cols-2">
                {expDefs.map((exp) => {
                  const price =
                    exp.id === "day"
                      ? SEASON_PRICES[season].day
                      : exp.id === "sunset"
                      ? SEASON_PRICES[season].sunset
                      : exp.id === "overnight"
                      ? SEASON_PRICES[season].night
                      : SEASON_PRICES[season].halfday;

                  const active = experience === exp.id;
                  const disabled = exp.blocked && exp.id !== "overnight"; // overnight lo gestiamo a parte
                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => setExperience(exp.id)}
                      className={[
                        "text-left rounded-2xl border px-5 py-5 transition shadow-[0_14px_36px_rgba(0,0,0,0.10)]",
                        "bg-white",
                        active ? "border-sky-500 ring-2 ring-sky-200" : "border-slate-200",
                        disabled ? "opacity-50" : "hover:shadow-[0_18px_44px_rgba(0,0,0,0.14)]",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-black text-slate-900">
                            {exp.title}
                          </div>
                          <div className="mt-1 text-sm font-extrabold text-slate-700">
                            {exp.sub}
                          </div>
                          <div className="mt-2 text-xs font-extrabold text-slate-600">
                            {disabled ? t.notAvailable : t.available}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs font-extrabold text-slate-600">Da</div>
                          <div className="text-xl font-black text-slate-900">
                            {exp.id === "overnight" ? `${euro(price)}/notte` : euro(price)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-sky-50 px-4 py-3">
                <div className="text-xs font-extrabold text-slate-600">{t.summary}</div>
                <div className="mt-1 text-sm font-black text-slate-900">
                  {selectedIntervalLabel}
                </div>
              </div>
            </Card>
          </div>

          {/* COL DX (spese fisse + extra + totale + bottoni) */}
          <div className="grid gap-5">
            {/* Spese fisse */}
            <Card title={t.fixedCosts}>
              <div className="space-y-3">
                {FIXED_COSTS.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="text-sm font-extrabold text-slate-800">
                      {t[c.labelKey as keyof typeof t] as unknown as string}
                    </div>
                    <div className="text-sm font-black text-slate-900">
                      {euro(c.price || 0)}
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="text-sm font-extrabold text-slate-800">
                    Totale spese fisse
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {euro(fixedTotal)}
                  </div>
                </div>
              </div>
            </Card>

            {/* Extra */}
            <Card title={t.extras}>
              <div className="space-y-4">
                {/* SeaBob qty */}
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">
                        {t.extra_seabob}
                      </div>
                      <div className="text-xs font-extrabold text-slate-600">
                        {euro(EXTRA_PRICES.seabob)} / cad.
                      </div>
                    </div>
                    <Qty value={seabobQty} onChange={setSeabobQty} />
                  </div>
                </div>

                {/* Teli mare qty */}
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">
                        {t.extra_towel}
                      </div>
                      <div className="text-xs font-extrabold text-slate-600">
                        {euro(EXTRA_PRICES.towel)} / telo
                      </div>
                    </div>
                    <Qty value={towelQty} onChange={setTowelQty} />
                  </div>
                </div>

                {/* Drinks pack */}
                <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {t.extra_drinks}
                    </div>
                    <div className="text-xs font-extrabold text-slate-600">
                      {euro(EXTRA_PRICES.drinks_pack)} totale
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={drinksPack}
                    onChange={(e) => setDrinksPack(e.target.checked)}
                    className="mt-1 h-5 w-5"
                  />
                </label>

                {/* Catering per persona */}
                <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-black text-slate-900">
                      {t.extra_catering}
                    </div>
                    <div className="text-xs font-extrabold text-slate-600">
                      {euro(EXTRA_PRICES.catering_pp)} / persona (x{people})
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={catering}
                    onChange={(e) => setCatering(e.target.checked)}
                    className="mt-1 h-5 w-5"
                  />
                </label>

                <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="text-sm font-extrabold text-slate-800">
                    Totale extra
                  </div>
                  <div className="text-sm font-black text-slate-900">
                    {euro(extrasTotal)}
                  </div>
                </div>

                {/* Inclusi gratis */}
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="text-sm font-black text-slate-900">
                    {t.includedFree}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-sky-50 border border-sky-100 px-3 py-1 text-xs font-extrabold text-slate-800">
                      ✅ {t.free_sup}
                    </span>
                    <span className="rounded-full bg-sky-50 border border-sky-100 px-3 py-1 text-xs font-extrabold text-slate-800">
                      ✅ {t.free_snorkel}
                    </span>
                    <span className="rounded-full bg-sky-50 border border-sky-100 px-3 py-1 text-xs font-extrabold text-slate-800">
                      ✅ {t.free_buoy}
                    </span>
                    <span className="rounded-full bg-sky-50 border border-sky-100 px-3 py-1 text-xs font-extrabold text-slate-800">
                      ✅ {t.free_dinghy}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Totale */}
            <Card
              title={t.total}
              right={
                <div className="rounded-full bg-sky-600 px-4 py-2 text-white font-black shadow-[0_12px_30px_rgba(0,0,0,0.20)]">
                  {euro(grandTotal)}
                </div>
              }
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                  <span>Base</span>
                  <span>{euro(basePrice)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                  <span>{t.fixedCosts}</span>
                  <span>{euro(fixedTotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm font-extrabold text-slate-800">
                  <span>{t.extras}</span>
                  <span>{euro(extrasTotal)}</span>
                </div>

                <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <div className="text-xs font-extrabold text-slate-600">
                    {t.summary}
                  </div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs font-extrabold text-slate-800 leading-relaxed">
                    {summaryText}
                  </pre>
                </div>

                {/* Bottoni */}
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl bg-white text-sky-700 border border-white/60 px-4 py-4 text-center font-black shadow-[0_14px_36px_rgba(0,0,0,0.18)] hover:shadow-[0_18px_44px_rgba(0,0,0,0.22)] transition"
                  >
                    {t.bookWhatsapp}
                  </a>
                  <a
                    href={PAYMENT_URL}
                    className="rounded-2xl bg-sky-700 text-white border border-white/20 px-4 py-4 text-center font-black shadow-[0_14px_36px_rgba(0,0,0,0.18)] hover:shadow-[0_18px_44px_rgba(0,0,0,0.22)] transition"
                  >
                    {t.payNow}
                  </a>
                </div>

                <div className="mt-3 text-xs font-extrabold text-white/90 bg-black/20 border border-white/20 rounded-xl px-4 py-3">
                  Nota: inserisci i prezzi delle spese fisse in CONFIG (FIXED_COSTS) e il link pagamento in PAYMENT_URL.
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* footer mini */}
      <footer className="px-4 pb-10">
        <div className="mx-auto max-w-6xl text-center text-xs font-extrabold text-white/90">
          © Blu Horizonte · {TZ}
        </div>
      </footer>
    </main>
  );
}
