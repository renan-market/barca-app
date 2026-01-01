"use client";

import { useEffect, useMemo, useState } from "react";

type ExperienceId = "halfday" | "day" | "sunset" | "overnight" | "custom";
type SeasonKey = "Bassa" | "Media" | "Alta";
type HalfDaySlot = "Mattina" | "Pomeriggio";

type Experience = {
  id: ExperienceId;
  title: string;
  subtitle: string;
  durationLabel: string;
};

type Interval = [number, number]; // minuti [start, end)
type BusyMap = Record<string, Interval[]>;

const WHATSAPP_NUMBER = "393398864884"; // senza + e senza spazi (formato wa.me)
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/3cI5kE2es0gm79zb6Ibsc02";

// ✅ EXTRA FISSI OBBLIGATORI (somma automatica)
const FEE_SKIPPER = 170;
const FEE_CLEANING = 50;
const FEE_FUEL_DAY = 40; // solo Day / Mezza / Sunset
const OVERNIGHT_FUEL_NOTE = "Carburante escluso: 15€/ora";

// ✅ Orari definitivi (minuti)
const MIN_10_00 = 10 * 60;
const MIN_14_00 = 14 * 60;
const MIN_14_30 = 14 * 60 + 30;
const MIN_18_00 = 18 * 60;
const MIN_18_30 = 18 * 60 + 30;
const MIN_19_00 = 19 * 60;
const MIN_21_30 = 21 * 60 + 30;

const SLOT_DAY: Interval = [MIN_10_00, MIN_18_00];
const SLOT_HALF_AM: Interval = [MIN_10_00, MIN_14_00];
const SLOT_HALF_PM: Interval = [MIN_14_30, MIN_18_30];
const SLOT_SUNSET: Interval = [MIN_19_00, MIN_21_30];

// ✅ Lingue
type Lang = "it" | "en" | "es" | "fr" | "ru";
const LANG_OPTIONS: { id: Lang; label: string }[] = [
  { id: "it", label: "IT" },
  { id: "en", label: "EN" },
  { id: "es", label: "ES" },
  { id: "fr", label: "FR" },
  { id: "ru", label: "RU" },
];

const BOAT = {
  name: "Lagoon 380",
  location: "Ibiza",
};

// ✅ FOTO LOCALI (public/...)
// (se non le hai tutte, non cambia niente: lascia così)
const BOAT_IMAGES = [
  "/boats/lagoon380/01.jpg",
  "/boats/lagoon380/02.jpg",
  "/boats/lagoon380/03.jpg",
  "/boats/lagoon380/04.jpg",
  "/boats/lagoon380/05.jpg",
  "/boats/lagoon380/06.jpg",
];

// ✅ Esperienze
const EXPERIENCES: Experience[] = [
  { id: "day", title: "Day Charter", subtitle: "Giornata intera in mare", durationLabel: "10:00–18:00" },
  { id: "halfday", title: "Mezza giornata", subtitle: "Mattina o pomeriggio in mare", durationLabel: "4 ore" },
  { id: "sunset", title: "Sunset", subtitle: "Tramonto + aperitivo", durationLabel: "19:00–21:30" },
  { id: "overnight", title: "Pernottamento", subtitle: "Multi-day (con notti)", durationLabel: "Da/A" },
  { id: "custom", title: "Personalizzata", subtitle: "Extra + richiesta su misura", durationLabel: "variabile" },
];

// ✅ PREZZI STAGIONALI (base)
const PRICES: Record<SeasonKey, { day: number; halfday: number; sunset: number; night: number }> = {
  Bassa: { day: 650, halfday: 450, sunset: 420, night: 845 },
  Media: { day: 850, halfday: 600, sunset: 520, night: 1105 },
  Alta: { day: 1100, halfday: 780, sunset: 650, night: 1430 },
};

// ✅ APRILE = EXTRA-BASSA (AUTO)
const APRIL_PRICES = { day: 380, halfday: 280, sunset: 260, night: 500 } as const;

// ✅ BASSA (Maggio + Ottobre)
const MAY_OCT_PRICES = { day: 460, halfday: 320, sunset: 290, night: 575 } as const;

// ✅ GIUGNO / LUGLIO / AGOSTO
const JUNE_PRICES = { day: 600, halfday: 420, sunset: 370, night: 780 } as const;
const JULY_PRICES = { day: 700, halfday: 500, sunset: 410, night: 910 } as const;
const AUGUST_PRICES = { day: 800, halfday: 570, sunset: 470, night: 1040 } as const;

// ✅ EXTRA
const EXTRA = {
  seabob: 650,
  drinksPremium: 150,
  cateringPerPerson: 25,
  gopro: 80,
} as const;

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

function isBaseExperience(id: ExperienceId) {
  return id === "day" || id === "halfday" || id === "sunset" || id === "overnight";
}

/**
 * ✅ FIX STAGIONI
 * - Alta: Luglio + Agosto
 * - Media: Giugno + Settembre
 * - Bassa: Aprile + Maggio + Ottobre + resto
 */
function getSeasonFromDate(d: Date | null | undefined): SeasonKey {
  if (!d || Number.isNaN(d.getTime())) return "Bassa";
  const month = d.getMonth(); // 0-11
  if (month === 6 || month === 7) return "Alta"; // Luglio, Agosto
  if (month === 5 || month === 8) return "Media"; // Giugno, Settembre
  return "Bassa";
}
function isApril(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getMonth() === 3;
}
function isMayOrOctober(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  const m = d.getMonth();
  return m === 4 || m === 9;
}
function isJune(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getMonth() === 5;
}
function isJuly(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getMonth() === 6;
}
function isAugust(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getMonth() === 7;
}

// ✅ prezzi mese-specifici: Aprile → Mag/Ott → Giugno → Luglio → Agosto → default stagione
function getEffectivePrices(args: { season: SeasonKey; auto: boolean; baseDate: Date | null }) {
  if (args.auto && isApril(args.baseDate)) return APRIL_PRICES;
  if (args.season === "Bassa" && isMayOrOctober(args.baseDate)) return MAY_OCT_PRICES;
  if (isJune(args.baseDate)) return JUNE_PRICES;
  if (isJuly(args.baseDate)) return JULY_PRICES;
  if (isAugust(args.baseDate)) return AUGUST_PRICES;
  return PRICES[args.season];
}

// ✅ Pernottamento: prezzo settimana (fallback)
const OVERNIGHT_WEEKLY: Record<"apr" | "may" | "jun" | "jul" | "aug" | "sep" | "oct", number> = {
  apr: 4500,
  may: 5000,
  jun: 5500,
  jul: 6500,
  aug: 7500,
  sep: 6000,
  oct: 4500,
};

function getOvernightWeeklyPrice(baseDate: Date | null): number | null {
  if (!baseDate) return null;
  const m = baseDate.getMonth() + 1;
  if (m === 4) return OVERNIGHT_WEEKLY.apr;
  if (m === 5) return OVERNIGHT_WEEKLY.may;
  if (m === 6) return OVERNIGHT_WEEKLY.jun;
  if (m === 7) return OVERNIGHT_WEEKLY.jul;
  if (m === 8) return OVERNIGHT_WEEKLY.aug;
  if (m === 9) return OVERNIGHT_WEEKLY.sep;
  if (m === 10) return OVERNIGHT_WEEKLY.oct;
  return null;
}

function calcBasePrice(args: {
  season: SeasonKey;
  exp: ExperienceId;
  nights: number;
  auto: boolean;
  baseDate: Date | null;
}) {
  const p = getEffectivePrices({ season: args.season, auto: args.auto, baseDate: args.baseDate });
  if (args.exp === "day") return p.day;
  if (args.exp === "sunset") return p.sunset;
  if (args.exp === "halfday") return p.halfday;
  if (args.exp === "overnight") {
    const weekly = getOvernightWeeklyPrice(args.baseDate);
    return weekly ?? null;
  }
  return null;
}

function safeReadLang(): Lang {
  if (typeof window === "undefined") return "it";
  try {
    const v = window.localStorage.getItem("bh_lang");
    if (v === "it" || v === "en" || v === "es" || v === "fr" || v === "ru") return v;
  } catch {}
  return "it";
}

// =========================
// ✅ Availability helpers
// =========================
function overlaps(a: Interval, b: Interval) {
  return a[0] < b[1] && b[0] < a[1];
}
function dayHasAnyBusy(busy: BusyMap, dayISO: string) {
  return Array.isArray(busy[dayISO]) && busy[dayISO].length > 0;
}
function allIntervalsEndBefore(busy: BusyMap, dayISO: string, minute: number) {
  const list = busy[dayISO] || [];
  return list.every((iv) => iv[1] <= minute);
}
function slotBlockedByBusy(busy: BusyMap, dayISO: string, slot: Interval) {
  const list = busy[dayISO] || [];
  return list.some((iv) => overlaps(iv, slot));
}
function rangeDaysInclusive(fromISO: string, toISO: string) {
  if (!fromISO || !toISO) return [];
  if (toISO < fromISO) return [];
  const from = new Date(fromISO + "T00:00:00");
  const to = new Date(toISO + "T00:00:00");
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return [];
  const out: string[] = [];
  for (let d = new Date(from); d.getTime() <= to.getTime(); d.setDate(d.getDate() + 1)) {
    out.push(toISODateInputValue(d));
  }
  return out;
}

export default function Page() {
  const today = useMemo(() => new Date(), []);

  // ✅ Lingua + UI selector
  const [lang, setLang] = useState<Lang>("it");
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    setLang(safeReadLang());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("bh_lang", lang);
    } catch {}
  }, [lang]);
  useEffect(() => {
    if (!langOpen) return;
    const onDown = () => setLangOpen(false);
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [langOpen]);

  const t = useMemo(() => {
    const dict: Record<Lang, Record<string, string>> = {
      it: {
        title: "Richiesta prenotazione",
        subtitle:
          "Questa è una richiesta, non una prenotazione automatica. Verifichiamo la disponibilità e ti rispondiamo su WhatsApp.",
        boat: "Barca",
        chooseExp: "Scegli l’esperienza",
        availability: "Disponibilità",
        checking: "Controllo in corso...",
        notAvailable: "Non disponibile",
        error: "Errore",
        available: "Disponibile",
        datesInfo: "Disponibilità calcolata dal calendario (Google Calendar).",
        extrasTitle: "Extra (opzionali)",
        extrasSubtitle: "Seleziona e vedi il totale",
        extrasTotal: "Totale extra",
        date: "Data",
        dates: "Date",
        from: "Da",
        to: "A",
        nights: "Notti",
        seasonAuto: "Stagione (auto):",
        people: "Persone",
        max12: "Max 12 (modificabile)",
        seasonPrices: "Stagione prezzi",
        auto: "Auto",
        manual: "Manuale",
        manualHint: "Metti Manuale per vedere i prezzi in Alta/Media/Bassa senza cambiare data.",
        estimated: "Prezzo stimato",
        season: "Stagione",
        notePrice: "*Prezzo indicativo. Confermiamo disponibilità e dettagli su WhatsApp.",
        nameOpt: "Nome (opzionale)",
        notesOpt: "Note (opzionale)",
        namePh: "Es. Renan",
        notesPh: "Orario preferito, porto, richieste speciali…",
        included:
          "Incluso: skipper, maschere e boccaglio, paddle SUP, dinghy. (per pernottamento: lenzuola e asciugamani)",
        notIncluded: "Non incluso: carburante e cambusa.",
        waSend: "Invia su WhatsApp",
        waChecking: "Controllo disponibilità...",
        waClosed: "Non disponibile",
        waError: "Errore disponibilità",
        waReply: "Ti rispondiamo su WhatsApp appena verifichiamo la disponibilità.",
        language: "Lingua",
        payment: "Pagamento",
        halfAM: "Mattina (10:00–14:00)",
        halfPM: "Pomeriggio (14:30–18:30)",
      },
      en: {
        title: "Booking request",
        subtitle: "This is a request, not an automatic booking. We check availability and reply on WhatsApp.",
        boat: "Boat",
        chooseExp: "Choose experience",
        availability: "Availability",
        checking: "Checking...",
        notAvailable: "Not available",
        error: "Error",
        available: "Available",
        datesInfo: "Availability calculated from the calendar (Google Calendar).",
        extrasTitle: "Extras (optional)",
        extrasSubtitle: "Select and see the total",
        extrasTotal: "Extras total",
        date: "Date",
        dates: "Dates",
        from: "From",
        to: "To",
        nights: "Nights",
        seasonAuto: "Season (auto):",
        people: "People",
        max12: "Max 12 (editable)",
        seasonPrices: "Price season",
        auto: "Auto",
        manual: "Manual",
        manualHint: "Use Manual to preview seasons without changing the date.",
        estimated: "Estimated price",
        season: "Season",
        notePrice: "*Indicative price. We confirm details on WhatsApp.",
        nameOpt: "Name (optional)",
        notesOpt: "Notes (optional)",
        namePh: "e.g. Renan",
        notesPh: "Preferred time, port, special requests…",
        included: "Included: skipper, snorkel masks, SUP paddle, dinghy.",
        notIncluded: "Not included: fuel and provisions.",
        waSend: "Send on WhatsApp",
        waChecking: "Checking availability...",
        waClosed: "Not available",
        waError: "Availability error",
        waReply: "We reply on WhatsApp as soon as we verify availability.",
        language: "Language",
        payment: "Payment",
        halfAM: "Morning (10:00–14:00)",
        halfPM: "Afternoon (14:30–18:30)",
      },
      es: {
        title: "Solicitud de reserva",
        subtitle:
          "Esto es una solicitud, no una reserva automática. Verificamos disponibilidad y respondemos por WhatsApp.",
        boat: "Barco",
        chooseExp: "Elige la experiencia",
        availability: "Disponibilidad",
        checking: "Comprobando...",
        notAvailable: "No disponible",
        error: "Error",
        available: "Disponible",
        datesInfo: "Disponibilidad calculada por el calendario (Google Calendar).",
        extrasTitle: "Extras (opcional)",
        extrasSubtitle: "Selecciona y mira el total",
        extrasTotal: "Total extras",
        date: "Fecha",
        dates: "Fechas",
        from: "Desde",
        to: "Hasta",
        nights: "Noches",
        seasonAuto: "Temporada (auto):",
        people: "Personas",
        max12: "Máx 12 (editable)",
        seasonPrices: "Temporada precios",
        auto: "Auto",
        manual: "Manual",
        manualHint: "Usa Manual para ver temporadas sin cambiar la fecha.",
        estimated: "Precio estimado",
        season: "Temporada",
        notePrice: "*Precio orientativo. Confirmamos detalles por WhatsApp.",
        nameOpt: "Nombre (opcional)",
        notesOpt: "Notas (opcional)",
        namePh: "Ej. Renan",
        notesPh: "Hora preferida, puerto, peticiones…",
        included: "Incluye: patrón, máscaras y snorkel, SUP, dinghy.",
        notIncluded: "No incluye: combustible y provisiones.",
        waSend: "Enviar por WhatsApp",
        waChecking: "Comprobando disponibilidad...",
        waClosed: "No disponible",
        waError: "Error de disponibilidad",
        waReply: "Respondemos por WhatsApp cuando confirmemos disponibilidad.",
        language: "Idioma",
        payment: "Pago",
        halfAM: "Mañana (10:00–14:00)",
        halfPM: "Tarde (14:30–18:30)",
      },
      fr: {
        title: "Demande de réservation",
        subtitle:
          "Ceci est une demande, pas une réservation automatique. Nous vérifions la disponibilité et répondons sur WhatsApp.",
        boat: "Bateau",
        chooseExp: "Choisir l’expérience",
        availability: "Disponibilité",
        checking: "Vérification...",
        notAvailable: "Indisponible",
        error: "Erreur",
        available: "Disponible",
        datesInfo: "Disponibilité calculée via le calendrier (Google Calendar).",
        extrasTitle: "Extras (optionnels)",
        extrasSubtitle: "Sélectionne et vois le total",
        extrasTotal: "Total extras",
        date: "Date",
        dates: "Dates",
        from: "Du",
        to: "Au",
        nights: "Nuits",
        seasonAuto: "Saison (auto) :",
        people: "Personnes",
        max12: "Max 12 (modifiable)",
        seasonPrices: "Saison des prix",
        auto: "Auto",
        manual: "Manuel",
        manualHint: "Utilise Manuel pour prévisualiser sans changer la date.",
        estimated: "Prix estimé",
        season: "Saison",
        notePrice: "*Prix indicatif. Nous confirmons sur WhatsApp.",
        nameOpt: "Nom (optionnel)",
        notesOpt: "Notes (optionnel)",
        namePh: "Ex. Renan",
        notesPh: "Heure préférée, port, demandes…",
        included: "Inclus : skipper, masques et tuba, SUP, annexe.",
        notIncluded: "Non inclus : carburant et provisions.",
        waSend: "Envoyer sur WhatsApp",
        waChecking: "Vérification disponibilité...",
        waClosed: "Indisponible",
        waError: "Erreur disponibilité",
        waReply: "Nous répondons sur WhatsApp dès que la disponibilité est vérifiée.",
        language: "Langue",
        payment: "Paiement",
        halfAM: "Matin (10:00–14:00)",
        halfPM: "Après-midi (14:30–18:30)",
      },
      ru: {
        title: "Запрос на бронирование",
        subtitle: "Это запрос, а не автоматическое бронирование. Мы проверим доступность и ответим в WhatsApp.",
        boat: "Лодка",
        chooseExp: "Выберите вариант",
        availability: "Доступность",
        checking: "Проверяем...",
        notAvailable: "Недоступно",
        error: "Ошибка",
        available: "Доступно",
        datesInfo: "Доступность рассчитывается по календарю (Google Calendar).",
        extrasTitle: "Дополнительно (опционально)",
        extrasSubtitle: "Выберите и посмотрите итог",
        extrasTotal: "Итого доп.",
        date: "Дата",
        dates: "Даты",
        from: "С",
        to: "По",
        nights: "Ночей",
        seasonAuto: "Сезон (авто):",
        people: "Людей",
        max12: "Макс 12 (можно изменить)",
        seasonPrices: "Сезон цен",
        auto: "Авто",
        manual: "Вручную",
        manualHint: "Вручную — чтобы смотреть сезоны без смены даты.",
        estimated: "Оценка цены",
        season: "Сезон",
        notePrice: "*Ориентировочная цена. Подтверждаем в WhatsApp.",
        nameOpt: "Имя (необязательно)",
        notesOpt: "Комментарий (необязательно)",
        namePh: "Напр. Renan",
        notesPh: "Время, порт, пожелания…",
        included: "Включено: шкипер, маски/трубки, SUP, динги.",
        notIncluded: "Не включено: топливо и провизия.",
        waSend: "WhatsApp",
        waChecking: "Проверяем доступность...",
        waClosed: "Недоступно",
        waError: "Ошибка доступности",
        waReply: "Ответим в WhatsApp после проверки.",
        language: "Язык",
        payment: "Оплата",
        halfAM: "Утро (10:00–14:00)",
        halfPM: "День (14:30–18:30)",
      },
    };
    return (key: string) => dict[lang][key] ?? key;
  }, [lang]);

  const [selected, setSelected] = useState<ExperienceId>("day");
  const [lastBaseExperience, setLastBaseExperience] = useState<Exclude<ExperienceId, "custom">>("day");
  const [halfdaySlot, setHalfdaySlot] = useState<HalfDaySlot>("Mattina");

  const [imgIndex, setImgIndex] = useState(0);

  const [date, setDate] = useState<string>(() => toISODateInputValue(today));
  const [dateFrom, setDateFrom] = useState<string>(() => toISODateInputValue(today));
  const [dateTo, setDateTo] = useState<string>(() => {
    const t2 = new Date();
    t2.setDate(t2.getDate() + 1);
    return toISODateInputValue(t2);
  });

  const [people, setPeople] = useState<number>(4);
  const [name, setName] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [extraSeabob, setExtraSeabob] = useState(false);
  const [extraDrinks, setExtraDrinks] = useState(false);
  const [extraCatering, setExtraCatering] = useState(false);
  const [extraGopro, setExtraGopro] = useState(false);

  const [seasonMode, setSeasonMode] = useState<"auto" | "manual">("auto");
  const [manualSeason, setManualSeason] = useState<SeasonKey>("Media");

  // ✅ Calendario dati
  const [closedDates, setClosedDates] = useState<string[]>([]);
  const [busyMap, setBusyMap] = useState<BusyMap>({});
  const [availabilityError, setAvailabilityError] = useState<string | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState<boolean>(false);

  const experience = useMemo(() => EXPERIENCES.find((e) => e.id === selected)!, [selected]);

  function onSelectExperience(id: ExperienceId) {
    setSelected(id);
    if (isBaseExperience(id)) setLastBaseExperience(id);
  }

  const baseExpForCalc: ExperienceId = selected === "custom" ? lastBaseExperience : selected;
  const usesOvernightDates = baseExpForCalc === "overnight";

  const seasonBaseDate = useMemo(() => {
    const base = usesOvernightDates ? dateFrom : date;
    return parseISODateOnly(base);
  }, [usesOvernightDates, dateFrom, date]);

  const autoSeason = useMemo<SeasonKey>(() => getSeasonFromDate(seasonBaseDate ?? new Date()), [seasonBaseDate]);
  const season: SeasonKey = seasonMode === "auto" ? autoSeason : manualSeason;

  const seasonLabel = useMemo(() => {
    if (seasonMode === "auto" && isApril(seasonBaseDate)) return "Aprile";
    return season;
  }, [seasonMode, season, seasonBaseDate]);

  const nights = useMemo(() => {
    if (!usesOvernightDates) return 0;
    if (!dateFrom || !dateTo) return 0;
    // semplice: numero notti = differenza giorni (ma qui la UI mostra solo)
    const from = new Date(dateFrom + "T00:00:00");
    const to = new Date(dateTo + "T00:00:00");
    const ms = to.getTime() - from.getTime();
    const n = Math.floor(ms / (1000 * 60 * 60 * 24));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [usesOvernightDates, dateFrom, dateTo]);

  const basePrice = useMemo(
    () =>
      calcBasePrice({
        season,
        exp: baseExpForCalc,
        nights,
        auto: seasonMode === "auto",
        baseDate: seasonBaseDate,
      }),
    [season, baseExpForCalc, nights, seasonMode, seasonBaseDate]
  );

  const extrasTotal = useMemo(() => {
    const catering = extraCatering ? EXTRA.cateringPerPerson * people : 0;
    return (
      (extraSeabob ? EXTRA.seabob : 0) +
      (extraDrinks ? EXTRA.drinksPremium : 0) +
      catering +
      (extraGopro ? EXTRA.gopro : 0)
    );
  }, [extraSeabob, extraDrinks, extraCatering, extraGopro, people]);

  const includeFuelFixed = baseExpForCalc !== "overnight";
  const fixedExtrasTotal = useMemo(() => {
    const fuel = includeFuelFixed ? FEE_FUEL_DAY : 0;
    const skipper = baseExpForCalc === "overnight" ? FEE_SKIPPER * (nights || 0) : FEE_SKIPPER;
    return skipper + FEE_CLEANING + fuel;
  }, [includeFuelFixed, baseExpForCalc, nights]);

  const totalEstimated = useMemo(() => (basePrice ?? 0) + extrasTotal, [basePrice, extrasTotal]);
  const grandTotalEstimated = useMemo(() => totalEstimated + fixedExtrasTotal, [totalEstimated, fixedExtrasTotal]);

  function setFromSafe(v: string) {
    setDateFrom(v);
    if (dateTo && v && dateTo <= v) {
      const d = parseISODateOnly(v);
      if (d) {
        d.setDate(d.getDate() + 1);
        setDateTo(toISODateInputValue(d));
      }
    }
  }
  function setToSafe(v: string) {
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

  // =========================
  // ✅ Fetch calendar availability (closed + busy)
  // =========================
  async function checkAvailability(fromISO: string, toISO: string) {
    if (!fromISO || !toISO) return;
    setCheckingAvailability(true);
    setAvailabilityError(null);

    try {
      const r = await fetch(`/api/availability?from=${encodeURIComponent(fromISO)}&to=${encodeURIComponent(toISO)}`, {
        cache: "no-store",
      });
      const data = (await r.json().catch(() => null)) as any;

      if (!data || data.ok !== true) {
        setClosedDates([]);
        setBusyMap({});
        setAvailabilityError(data?.error ? String(data.error) : "Errore verifica disponibilità");
        return;
      }

      const closed = Array.isArray(data.closed) ? (data.closed as string[]) : [];
      const busy = (data.busy && typeof data.busy === "object" ? (data.busy as BusyMap) : {}) as BusyMap;

      setClosedDates(closed);
      setBusyMap(busy);
      setAvailabilityError(null);
    } catch (e: any) {
      setClosedDates([]);
      setBusyMap({});
      setAvailabilityError(e?.message ? String(e.message) : "Errore verifica disponibilità");
    } finally {
      setCheckingAvailability(false);
    }
  }

  // per le esperienze giornaliere basta 1 giorno; per pernottamento serve range
  useEffect(() => {
    const fromISO = usesOvernightDates ? dateFrom : date;
    const toISO = usesOvernightDates ? dateTo : date;

    if (usesOvernightDates && (!dateFrom || !dateTo || dateTo <= dateFrom)) {
      setClosedDates([]);
      setBusyMap({});
      setAvailabilityError(null);
      return;
    }

    const tt = setTimeout(() => {
      checkAvailability(fromISO, toISO);
    }, 250);

    return () => clearTimeout(tt);
  }, [usesOvernightDates, date, dateFrom, dateTo]);

  const closedSet = useMemo(() => new Set(closedDates), [closedDates]);

  function isClosedISO(iso: string) {
    return !!iso && closedSet.has(iso);
  }

  // =========================
  // ✅ Availability decision (OPZIONE A + pernottamento)
  // =========================
  const dailySelectedISO = usesOvernightDates ? dateFrom : date;

  const isDayAvailable = useMemo(() => {
    const d = dailySelectedISO;
    if (!d) return true;
    if (isClosedISO(d)) return false;
    // Day Charter 10–18: blocca se overlap con slot day
    return !slotBlockedByBusy(busyMap, d, SLOT_DAY);
  }, [dailySelectedISO, busyMap, closedSet]);
const isHalfDayAvailable = useMemo(() => {
  const d = dailySelectedISO;
  if (!d) return true;
  if (isClosedISO(d)) return false;
  const slot = halfdaySlot === "Mattina" ? SLOT_HALF_AM : SLOT_HALF_PM;
  return !slotBlockedByBusy(busyMap, d, slot);
}, [dailySelectedISO, busyMap, closedSet, halfdaySlot]);

   const isHalfDayAfternoonAvailable = useMemo(() => {
    const d = dailySelectedISO;
    if (!d) return true;
    if (isClosedISO(d)) return false;
    return !slotBlockedByBusy(busyMap, d, SLOT_HALF_PM);
  }, [dailySelectedISO, busyMap, closedSet]);


  const isSunsetAvailable = useMemo(() => {
    const d = dailySelectedISO;
    if (!d) return true;
    if (isClosedISO(d)) return false;
    return !slotBlockedByBusy(busyMap, d, SLOT_SUNSET);
  }, [dailySelectedISO, busyMap, closedSet]);

  const isOvernightAvailable = useMemo(() => {
    if (!usesOvernightDates) return true;
    if (!dateFrom || !dateTo) return true;

    // range Da→A incluso (come hai chiesto)
    const days = rangeDaysInclusive(dateFrom, dateTo);
    if (!days.length) return true;

    for (const day of days) {
      // all-day chiuso => blocca sempre
      if (isClosedISO(day)) return false;

      const hasBusy = dayHasAnyBusy(busyMap, day);
      if (!hasBusy) continue;

      if (day === dateFrom) {
        // giorno di arrivo: OK se TUTTI gli eventi finiscono entro 18:00
        // (Sunset o qualsiasi cosa dopo 18:00 => blocca)
        if (!allIntervalsEndBefore(busyMap, day, MIN_18_00)) return false;
      } else {
        // tutti gli altri giorni (incluso check-out): qualsiasi busy => blocca
        return false;
      }
    }

    return true;
  }, [usesOvernightDates, dateFrom, dateTo, busyMap, closedSet]);

  const selectedAvailabilityOk = useMemo(() => {
    if (availabilityError) return false;
    if (checkingAvailability) return false;

    if (baseExpForCalc === "day") return isDayAvailable;
    if (baseExpForCalc === "halfday") return isHalfDayAvailable;
    if (baseExpForCalc === "sunset") return isSunsetAvailable;
    if (baseExpForCalc === "overnight") return isOvernightAvailable;

    // custom: dipende dalla base selezionata (lastBaseExperience)
    if (selected === "custom") {
      if (lastBaseExperience === "day") return isDayAvailable;
      if (lastBaseExperience === "halfday") return isHalfDayAvailable;
      if (lastBaseExperience === "sunset") return isSunsetAvailable;
      if (lastBaseExperience === "overnight") return isOvernightAvailable;
    }

    return true;
  }, [
    availabilityError,
    checkingAvailability,
    baseExpForCalc,
    isDayAvailable,
    isHalfDayAvailable,
    isSunsetAvailable,
    isOvernightAvailable,
    selected,
    lastBaseExperience,
  ]);

  const availabilityLabel = useMemo(() => {
    if (checkingAvailability) return t("checking");
    if (availabilityError) return t("error");
    return selectedAvailabilityOk ? t("available") : t("notAvailable");
  }, [checkingAvailability, availabilityError, selectedAvailabilityOk, t]);

  const selectionMessage = useMemo(() => {
    if (availabilityError) return availabilityError;

    if (selectedAvailabilityOk) return null;

    // messaggio chiaro per l’esperienza selezionata
    if (baseExpForCalc === "day") return "⚠️ Giorno occupato nella fascia 10:00–18:00.";
    if (baseExpForCalc === "halfday") {
      return halfdaySlot === "Mattina"
        ? "⚠️ Mezza giornata mattina occupata (10:00–14:00)."
        : "⚠️ Mezza giornata pomeriggio occupata (14:30–18:30).";
    }
    if (baseExpForCalc === "sunset") return "⚠️ Sunset occupato (19:00–21:30).";
    if (baseExpForCalc === "overnight") return "⚠️ Pernottamento non disponibile nel range selezionato.";

    if (selected === "custom") return "⚠️ Base selezionata non disponibile per le date scelte.";
    return "⚠️ Non disponibile.";
  }, [availabilityError, selectedAvailabilityOk, baseExpForCalc, halfdaySlot, selected]);

  const waDisabled = checkingAvailability || !!availabilityError || !selectedAvailabilityOk;
  const canSendWhatsapp = !waDisabled;

  // =========================
  // ✅ WhatsApp text
  // =========================
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

    const effective = getEffectivePrices({ season, auto: seasonMode === "auto", baseDate: seasonBaseDate });

    if (usesOvernightDates) {
      lines.push(`*Da:* ${dateFrom}`);
      lines.push(`*A:* ${dateTo}`);
      lines.push(`*Notti:* ${nights || "—"}`);
      lines.push(`*Prezzo notte:* ${formatEUR(effective.night)} (${seasonLabel})`);
    } else {
      lines.push(`*Data:* ${date}`);
      lines.push(`*Prezzo base stimato:* ${basePrice !== null ? formatEUR(basePrice) : "Da definire"} (${seasonLabel})`);
      if (selected === "halfday") lines.push(`*Fascia:* ${halfdaySlot}`);
    }

    lines.push(`*Persone:* ${people}`);
    if (extrasTotal > 0) lines.push(`*Extra opzionali:* ${formatEUR(extrasTotal)}`);

    lines.push("");
    lines.push("*Extra fissi (obbligatori):*");
    lines.push(`- Skipper: ${formatEUR(FEE_SKIPPER)}`);
    lines.push(`- Pulizie: ${formatEUR(FEE_CLEANING)}`);
    if (baseExpForCalc !== "overnight") {
      lines.push(`- Carburante: ${formatEUR(FEE_FUEL_DAY)}`);
    } else {
      lines.push(`- ${OVERNIGHT_FUEL_NOTE}`);
    }

    lines.push(`*Totale stimato:* ${formatEUR(grandTotalEstimated)}`);

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
    seasonLabel,
    seasonMode,
    seasonBaseDate,
    name,
    notes,
    halfdaySlot,
    extrasTotal,
    grandTotalEstimated,
  ]);

  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

  const heroSrc = BOAT_IMAGES[Math.max(0, Math.min(imgIndex, BOAT_IMAGES.length - 1))];

  function prevImg() {
    setImgIndex((i) => (i - 1 + BOAT_IMAGES.length) % BOAT_IMAGES.length);
  }
  function nextImg() {
    setImgIndex((i) => (i + 1) % BOAT_IMAGES.length);
  }

  function openStripe() {
    window.open(STRIPE_PAYMENT_LINK, "_blank", "noreferrer");
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-500 via-cyan-500 to-indigo-700">
      <div className="mx-auto max-w-md px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <div className="rounded-[28px] bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white drop-shadow-sm">{t("title")}</h1>
              <p className="text-white/90 mt-1">{t("subtitle")}</p>
            </div>

            <div className="relative flex flex-col items-end gap-2 text-right">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setLangOpen((v) => !v);
                }}
                className="rounded-2xl border border-white/25 bg-white/15 backdrop-blur-md shadow-[0_8px_18px_rgba(0,0,0,0.10)] px-3 py-2 text-left"
              >
                <div className="text-[11px] text-white/85 font-semibold">🌍 {t("language")}</div>
                <div className="text-sm font-extrabold text-white">{lang.toUpperCase()}</div>
              </button>

              {langOpen && (
                <div
                  className="absolute right-0 top-full mt-2 z-30 w-[140px] rounded-2xl border border-white/25 bg-white shadow-[0_14px_30px_rgba(0,0,0,0.20)] overflow-hidden"
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  {LANG_OPTIONS.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => {
                        setLang(o.id);
                        setLangOpen(false);
                      }}
                      className={[
                        "w-full text-left px-3 py-2 text-sm font-semibold transition",
                        o.id === lang ? "bg-sky-50 text-sky-900" : "bg-white text-gray-900 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="text-xs text-white/75">{t("boat")}</div>
                <div className="font-semibold text-white">{BOAT.name}</div>
                <div className="text-sm text-white/90">{BOAT.location}</div>
              </div>
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
                <h2 className="text-sm font-semibold text-gray-900 mb-2">{t("chooseExp")}</h2>
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
                        <div className="font-semibold text-gray-900">{exp.title}</div>
                        <div className="text-xs text-slate-800 mt-1">{exp.subtitle}</div>
                        <div className="mt-2 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium bg-gray-100 text-gray-700">
                          {exp.durationLabel}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* ✅ Fascia Mezza giornata (solo quando selezionata) */}
                {selected === "halfday" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setHalfdaySlot("Mattina")}
                      className={[
                        "rounded-xl px-3 py-2 text-sm font-semibold border transition",
                        halfdaySlot === "Mattina"
                          ? "border-transparent bg-gradient-to-b from-sky-50 to-white ring-2 ring-sky-200"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      ].join(" ")}
                    >
                      {t("halfAM")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setHalfdaySlot("Pomeriggio")}
                      className={[
                        "rounded-xl px-3 py-2 text-sm font-semibold border transition",
                        halfdaySlot === "Pomeriggio"
                          ? "border-transparent bg-gradient-to-b from-sky-50 to-white ring-2 ring-sky-200"
                          : "border-gray-200 bg-white hover:border-gray-300",
                      ].join(" ")}
                    >
                      {t("halfPM")}
                    </button>
                  </div>
                )}
              </section>

              {/* BLOCCO DISPONIBILITÀ */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-800">{t("availability")}</div>
                    <div className="font-bold text-gray-900">{availabilityLabel}</div>
                  </div>
                  <div className="text-right">
                    {availabilityError ? (
                      <div className="text-xs text-red-600 font-semibold">{t("error")}</div>
                    ) : !selectedAvailabilityOk ? (
                      <div className="text-xs text-red-600 font-semibold">{t("notAvailable")}</div>
                    ) : (
                      <div className="text-xs text-emerald-700 font-semibold">OK</div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-800 mt-2">{t("datesInfo")}</p>
                {selectionMessage && <p className="text-xs text-red-600 font-semibold mt-2">{selectionMessage}</p>}
              </section>




{!selectedAvailabilityOk &&
  baseExpForCalc === "halfday" &&
  halfdaySlot === "Mattina" &&
  isHalfDayAfternoonAvailable && (
    <p className="text-xs text-slate-800 font-semibold mt-2">
      👉 <span className="font-extrabold">
        Disponibile nel pomeriggio (14:30–18:30)
      </span>{" "}
      — perfetto per godersi il mare 🌊
    </p>
  )}





              {/* EXTRA (UI SOLO in Personalizzata) */}
              {selected === "custom" && (
                <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-800">{t("extrasTitle")}</div>
                      <div className="font-bold text-gray-900">{t("extrasSubtitle")}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-800">{t("extrasTotal")}</div>
                      <div className="font-extrabold text-gray-900">{formatEUR(extrasTotal)}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-sm">
                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={extraSeabob}
                          onChange={(e) => setExtraSeabob(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-gray-900">Seabob</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.seabob)}</span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={extraDrinks}
                          onChange={(e) => setExtraDrinks(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-gray-900">Bevande Premium</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.drinksPremium)}</span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={extraCatering}
                          onChange={(e) => setExtraCatering(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-gray-900">Catering</span>
                      </div>
                      <span className="font-semibold text-gray-900">
                        {formatEUR(EXTRA.cateringPerPerson)} × {people}
                      </span>
                    </label>

                    <label className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={extraGopro}
                          onChange={(e) => setExtraGopro(e.target.checked)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                        <span className="text-gray-900">Foto/Video (GoPro)</span>
                      </div>
                      <span className="font-semibold text-gray-900">{formatEUR(EXTRA.gopro)}</span>
                    </label>

                    <p className="text-xs text-slate-800">
                      Bevande Premium: pacchetto aperitivo per il gruppo (fino a 12 persone). Catering:{" "}
                      {formatEUR(EXTRA.cateringPerPerson)} a persona.
                    </p>
                  </div>
                </section>
              )}

              {/* DATA + PERSONE */}
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">
                    {usesOvernightDates ? t("dates") : t("date")}
                  </label>

                  {usesOvernightDates ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-xs text-slate-800 mb-1">{t("from")}</div>
                        <input
                          type="date"
                          value={dateFrom}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAvailabilityError(null);
                            setFromSafe(v);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                        />
                      </div>
                      <div>
                        <div className="text-xs text-slate-800 mb-1">{t("to")}</div>
                        <input
                          type="date"
                          value={dateTo}
                          onChange={(e) => {
                            const v = e.target.value;
                            setAvailabilityError(null);
                            setToSafe(v);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                        />
                      </div>
                      <div className="text-xs text-slate-900">
                        {t("nights")}:{" "}
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
                        onChange={(e) => {
                          const v = e.target.value;
                          setAvailabilityError(null);
                          setDate(v);
                        }}
                        className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                      />
                      <div className="mt-2 text-xs text-slate-900">
                        {t("seasonAuto")}{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-1 bg-sky-50 text-sky-700 font-semibold">
                          {seasonMode === "auto" ? seasonLabel : autoSeason}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-900">{t("people")}</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={people}
                    onChange={(e) => setPeople(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                  <div className="mt-2 text-xs text-slate-800">{t("max12")}</div>
                </div>
              </section>

              {/* SELETTORE STAGIONE */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-800">{t("seasonPrices")}</div>
                    <div className="font-bold text-gray-900">
                      {seasonMode === "auto" ? `Automatica (${seasonLabel})` : `Manuale (${manualSeason})`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeasonMode("auto")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "auto"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-800 border-gray-200",
                      ].join(" ")}
                    >
                      {t("auto")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeasonMode("manual")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "manual"
                          ? "bg-gray-900 text-white border-gray-900"
                          : "bg-white text-gray-800 border-gray-200",
                      ].join(" ")}
                    >
                      {t("manual")}
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

                <p className="text-xs text-slate-800 mt-3">{t("manualHint")}</p>
              </section>

              {/* PREZZO */}
              <section className="rounded-2xl border border-gray-200 bg-gradient-to-b from-sky-50 to-white p-4 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-800">{t("estimated")}</div>
                    <div className="text-lg font-extrabold">{basePrice !== null ? formatEUR(basePrice) : "Da definire"}</div>
                    {extrasTotal > 0 && <div className="text-xs text-slate-800 mt-1">Extra: {formatEUR(extrasTotal)}</div>}

                    <div className="mt-3 rounded-xl border border-gray-200 bg-white/80 p-3">
                      <div className="text-[11px] font-semibold text-slate-800 mb-2">Dettaglio prezzo</div>

                      <div className="flex justify-between text-sm text-gray-900">
                        <span>Prezzo esperienza</span>
                        <span className="font-semibold">{formatEUR(basePrice ?? 0)}</span>
                      </div>

                      <div className="mt-2 flex justify-between text-sm text-gray-900">
                        <span>Skipper (obbligatorio)</span>
                        <span className="font-semibold">{formatEUR(FEE_SKIPPER)}</span>
                      </div>

                      <div className="flex justify-between text-sm text-gray-900">
                        <span>Pulizie (obbligatorio)</span>
                        <span className="font-semibold">{formatEUR(FEE_CLEANING)}</span>
                      </div>

                      {baseExpForCalc !== "overnight" ? (
                        <div className="flex justify-between text-sm text-gray-900">
                          <span>Carburante (obbligatorio)</span>
                          <span className="font-semibold">{formatEUR(FEE_FUEL_DAY)}</span>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-800">{OVERNIGHT_FUEL_NOTE}</div>
                      )}

                      {selected === "custom" && extrasTotal > 0 && (
                        <div className="mt-2 flex justify-between text-sm text-gray-900">
                          <span>Extra opzionali</span>
                          <span className="font-semibold">{formatEUR(extrasTotal)}</span>
                        </div>
                      )}

                      <div className="my-3 h-px bg-black/10" />

                      <div className="flex justify-between font-extrabold text-gray-900">
                        <span>Totale</span>
                        <span>{formatEUR(grandTotalEstimated)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-slate-800">{t("season")}</div>
                    <div className="font-semibold">{seasonLabel}</div>
                  </div>
                </div>

                <p className="text-xs text-slate-800 mt-2">{t("notePrice")}</p>
              </section>

              {/* DATI */}
              <section className="space-y-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">{t("nameOpt")}</label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("namePh")}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-900">{t("notesOpt")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t("notesPh")}
                    rows={4}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                </div>

                <div className="text-xs text-slate-900">
                  <b>{t("included").split(":")[0]}:</b> {t("included").split(":").slice(1).join(":").trim()}{" "}
                  <b>{t("notIncluded").split(":")[0]}:</b> {t("notIncluded").split(":").slice(1).join(":").trim()}
                </div>
              </section>

              {/* CTA ROW */}
              <section className="pt-1">
                <div className="grid grid-cols-3 gap-2 items-stretch">
                  {canSendWhatsapp ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="col-span-2 block w-full rounded-2xl text-white text-center font-extrabold py-3 shadow-[0_14px_30px_rgba(16,185,129,0.35)] active:scale-[0.99] transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
                    >
                      {t("waSend")}
                    </a>
                  ) : (
                    <button
                      type="button"
                      disabled
                      className="col-span-2 block w-full rounded-2xl text-white/95 text-center font-extrabold py-3 bg-gray-500 cursor-not-allowed"
                    >
                      {checkingAvailability ? t("waChecking") : t("waClosed")}
                    </button>
                  )}

                  <div className="relative flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={openStripe}
                      className="w-full rounded-2xl border border-gray-200 bg-white shadow-[0_8px_18px_rgba(0,0,0,0.08)] px-3 py-2 text-left hover:bg-gray-50 transition"
                    >
                      <div className="text-[11px] text-slate-800 font-semibold">💳 {t("payment")}</div>
                      <div className="text-sm font-extrabold text-gray-900">Stripe</div>
                    </button>
                  </div>
                </div>

                <p className="text-xs text-slate-900 text-center mt-3">{t("waReply")}</p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
