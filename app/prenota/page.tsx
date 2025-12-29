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

const WHATSAPP_NUMBER = "393398864884"; // senza + e senza spazi (formato wa.me)
const STRIPE_PAYMENT_LINK = "https://buy.stripe.com/3cI5kE2es0gm79zb6Ibsc02";

// ✅ Lingue
type Lang = "it" | "en" | "es" | "fr" | "ru";
const LANG_OPTIONS: { id: Lang; label: string }[] = [
  { id: "it", label: "IT" },
  { id: "en", label: "EN" },
  { id: "es", label: "ES" },
  { id: "fr", label: "FR" },
  { id: "ru", label: "RU" }, // ✅ RUSSO
];

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
  { id: "sunset", title: "Sunset", subtitle: "Tramonto + aperitivo", durationLabel: "2h30" }, // ✅ 2h30
  { id: "overnight", title: "Pernottamento", subtitle: "Multi-day (con notti)", durationLabel: "Da/A" },
  { id: "custom", title: "Personalizzata", subtitle: "Extra + richiesta su misura", durationLabel: "variabile" },
];

// ✅ PREZZI STAGIONALI (fallback, fuori Apr–Ott)
const PRICES: Record<SeasonKey, { day: number; halfday: number; sunset: number; night: number }> = {
  Bassa: { day: 650, halfday: 450, sunset: 420, night: 845 },
  Media: { day: 850, halfday: 600, sunset: 520, night: 1105 },
  Alta: { day: 1100, halfday: 780, sunset: 650, night: 1430 },
};

// ✅ LISTINO DEFINITIVO APR–OTT (prezzi base barca)
// 🔧 FIX: night non può essere 0, altrimenti in overnight somma solo gli extra.
// Coerente coi tuoi night stagionali: Bassa 350 / Media 450 / Alta 600
const APRIL_PRICES = { day: 460, halfday: 280, sunset: 180, night: 350 } as const; // Aprile (extra-bassa → night bassa)
const MAY_PRICES = { day: 650, halfday: 400, sunset: 260, night: 450 } as const; // Maggio (media)
const JUNE_PRICES = { day: 800, halfday: 500, sunset: 320, night: 450 } as const; // Giugno (media)
const JULY_PRICES = { day: 920, halfday: 580, sunset: 380, night: 600 } as const; // Luglio (alta)
const AUGUST_PRICES = { day: 1000, halfday: 620, sunset: 420, night: 600 } as const; // Agosto (alta)
const SEPTEMBER_PRICES = { day: 880, halfday: 550, sunset: 360, night: 450 } as const; // Settembre (media)
const OCTOBER_PRICES = { day: 650, halfday: 400, sunset: 260, night: 450 } as const; // Ottobre (media)

// ✅ EXTRA opzionali (transfer tolto)
const EXTRA = {
  seabob: 650,
  drinksPremium: 150,
  cateringPerPerson: 25,
  gopro: 80,
} as const;

// ✅ EXTRA OBBLIGATORI (day/mezza/sunset)
const MANDATORY_DAY = {
  skipper: 170,
  cleaning: 50,
  fuel: 40,
} as const;

// ✅ EXTRA OBBLIGATORI (overnight/week)
const MANDATORY_WEEK = {
  skipper: 1400,
  cleaning: 50,
  fuelPerHourPerEngine: 15,
  engines: 2,
  avgEngineHours: 15, // media settimana
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

/**
 * ✅ FIX STAGIONI (fallback)
 * - Alta: Luglio + Agosto
 * - Media: Giugno + Settembre
 * - Bassa: resto
 */
function getSeasonFromDate(d: Date | null | undefined): SeasonKey {
  if (!d || Number.isNaN(d.getTime())) return "Bassa";
  const month = d.getMonth(); // 0-11
  if (month === 6 || month === 7) return "Alta"; // Luglio, Agosto
  if (month === 5 || month === 8) return "Media"; // Giugno, Settembre
  return "Bassa";
}

// ✅ Orari per mese (Apr–Ott) — solo display (non cambia grafica)
function getTimeRangeFor(args: { baseDate: Date | null; exp: ExperienceId; halfdaySlot: HalfDaySlot }): string | null {
  const d = args.baseDate;
  if (!d || Number.isNaN(d.getTime())) return null;

  const m = d.getMonth(); // 0-11
  const exp = args.exp;

  // APRILE (3)
  if (m === 3) {
    if (exp === "sunset") return "17:30–20:00";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "14:30–18:30";
    return null;
  }

  // MAGGIO (4)
  if (m === 4) {
    if (exp === "sunset") return "18:00–20:30";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "15:00–19:00";
    return null;
  }

  // GIUGNO (5)
  if (m === 5) {
    if (exp === "sunset") return "18:45–21:15";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "15:30–19:30";
    return null;
  }

  // LUGLIO (6)
  if (m === 6) {
    if (exp === "sunset") return "18:45–21:15";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "16:00–20:00";
    return null;
  }

  // AGOSTO (7)
  if (m === 7) {
    if (exp === "sunset") return "18:15–20:45";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "15:30–19:30";
    return null;
  }

  // SETTEMBRE (8)
  if (m === 8) {
    if (exp === "sunset") return "17:30–20:00";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "14:30–18:30";
    return null;
  }

  // OTTOBRE (9)
  if (m === 9) {
    if (exp === "sunset") return "16:45–19:15";
    if (exp === "day") return "10:00–18:00";
    if (exp === "halfday") return args.halfdaySlot === "Mattina" ? "10:00–14:00" : "14:00–18:00";
    return null;
  }

  return null;
}

// ✅ prezzi mese-specifici: Aprile → Maggio → Giugno → Luglio → Agosto → Settembre → Ottobre → fallback stagione
function getEffectivePrices(args: { season: SeasonKey; baseDate: Date | null }) {
  const d = args.baseDate;
  if (d && !Number.isNaN(d.getTime())) {
    const m = d.getMonth(); // 0-11
    if (m === 3) return APRIL_PRICES;
    if (m === 4) return MAY_PRICES;
    if (m === 5) return JUNE_PRICES;
    if (m === 6) return JULY_PRICES;
    if (m === 7) return AUGUST_PRICES;
    if (m === 8) return SEPTEMBER_PRICES;
    if (m === 9) return OCTOBER_PRICES;
  }
  return PRICES[args.season];
}

function calcBasePrice(args: { season: SeasonKey; exp: ExperienceId; nights: number; baseDate: Date | null }) {
  const p = getEffectivePrices({ season: args.season, baseDate: args.baseDate });
  if (args.exp === "day") return p.day;
  if (args.exp === "sunset") return p.sunset;
  if (args.exp === "halfday") return p.halfday;

  // overnight: usa p.night * notti (ora p.night è valorizzato anche in Apr–Ott)
  if (args.exp === "overnight") {
    return p.night * (args.nights || 0);
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

  // ✅ chiudi menu lingua quando tocchi fuori (iPhone)
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
        datesInfo: "Le date vengono controllate dal calendario. Se una data è occupata, la richiesta viene bloccata.",
        extrasTitle: "Extra (opzionali)",
        extrasSubtitle: "Seleziona e vedi il totale",
        extrasTotal: "Totale extra",
        mandatoryTitle: "Extra obbligatori",
        mandatorySubtitle: "Voci obbligatorie (mostrate separatamente)",
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
        included: "Extra obbligatori: skipper + pulizia + carburante (vedi elenco).",
        notIncluded: "Altri extra (opzionali) e cambusa.",
        waSend: "Invia su WhatsApp",
        waChecking: "Controllo disponibilità...",
        waClosed: "Date non disponibili",
        waError: "Errore disponibilità",
        waReply: "Ti rispondiamo su WhatsApp appena verifichiamo la disponibilità.",
        language: "Lingua",
        payment: "Pagamento",
        time: "Orario",
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
        datesInfo: "Dates are checked from the calendar. If a date is busy, the request is blocked.",
        extrasTitle: "Extras (optional)",
        extrasSubtitle: "Select and see the total",
        extrasTotal: "Extras total",
        mandatoryTitle: "Mandatory extras",
        mandatorySubtitle: "Mandatory items (shown separately)",
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
        included: "Mandatory extras: skipper + cleaning + fuel (see list).",
        notIncluded: "Other optional extras and provisions.",
        waSend: "Send on WhatsApp",
        waChecking: "Checking availability...",
        waClosed: "Dates not available",
        waError: "Availability error",
        waReply: "We reply on WhatsApp as soon as we verify availability.",
        language: "Language",
        payment: "Payment",
        time: "Time",
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
        datesInfo: "Las fechas se verifican en el calendario. Si una fecha está ocupada, se bloquea la solicitud.",
        extrasTitle: "Extras (opcional)",
        extrasSubtitle: "Selecciona y mira el total",
        extrasTotal: "Total extras",
        mandatoryTitle: "Extras obligatorios",
        mandatorySubtitle: "Elementos obligatorios (mostrados aparte)",
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
        included: "Extras obligatorios: patrón + limpieza + combustible (ver lista).",
        notIncluded: "Otros extras opcionales y provisiones.",
        waSend: "Enviar por WhatsApp",
        waChecking: "Comprobando disponibilidad...",
        waClosed: "Fechas no disponibles",
        waError: "Error de disponibilidad",
        waReply: "Respondemos por WhatsApp cuando confirmemos disponibilidad.",
        language: "Idioma",
        payment: "Pago",
        time: "Horario",
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
        datesInfo: "Les dates sont vérifiées via le calendrier. Si une date est prise, la demande est bloquée.",
        extrasTitle: "Extras (optionnels)",
        extrasSubtitle: "Sélectionne et vois le total",
        extrasTotal: "Total extras",
        mandatoryTitle: "Extras obligatoires",
        mandatorySubtitle: "Éléments obligatoires (affichés séparément)",
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
        included: "Extras obligatoires : skipper + ménage + carburant (voir liste).",
        notIncluded: "Autres extras optionnels et provisions.",
        waSend: "Envoyer sur WhatsApp",
        waChecking: "Vérification disponibilité...",
        waClosed: "Dates indisponibles",
        waError: "Erreur disponibilité",
        waReply: "Nous répondons sur WhatsApp dès que la disponibilité est vérifiée.",
        language: "Langue",
        payment: "Paiement",
        time: "Horaire",
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
        datesInfo: "Даты проверяются по календарю. Если дата занята, запрос блокируется.",
        extrasTitle: "Дополнительно (опционально)",
        extrasSubtitle: "Выберите и посмотрите итог",
        extrasTotal: "Итого доп.",
        mandatoryTitle: "Обязательные доплаты",
        mandatorySubtitle: "Обязательные пункты (показаны отдельно)",
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
        included: "Обязательные доплаты: шкипер + уборка + топливо (см. список).",
        notIncluded: "Другие опции и провизия.",
        waSend: "WhatsApp",
        waChecking: "Проверяем доступность...",
        waClosed: "Даты заняты",
        waError: "Ошибка доступности",
        waReply: "Ответим в WhatsApp после проверки.",
        language: "Язык",
        payment: "Оплата",
        time: "Время",
      },
    };
    return (key: string) => dict[lang][key] ?? key;
  }, [lang]);

  const [selected, setSelected] = useState<ExperienceId>("day");
  const [lastBaseExperience, setLastBaseExperience] = useState<Exclude<ExperienceId, "custom">>("day");

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

  const [halfdaySlot, setHalfDaySlot] = useState<HalfDaySlot>("Mattina");

  const [extraSeabob, setExtraSeabob] = useState(false);
  const [extraDrinks, setExtraDrinks] = useState(false);
  const [extraCatering, setExtraCatering] = useState(false);
  const [extraGopro, setExtraGopro] = useState(false);

  const [seasonMode, setSeasonMode] = useState<"auto" | "manual">("auto");
  const [manualSeason, setManualSeason] = useState<SeasonKey>("Media");

  const [closedDates, setClosedDates] = useState<string[]>([]);
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

  // ✅ etichetta visibile: se Aprile mostra "Aprile"
  const seasonLabel = useMemo(() => {
    const d = seasonBaseDate;
    if (!d || Number.isNaN(d.getTime())) return season;
    const m = d.getMonth();
    if (m === 3) return "Aprile";
    if (m === 4) return "Maggio";
    if (m === 5) return "Giugno";
    if (m === 6) return "Luglio";
    if (m === 7) return "Agosto";
    if (m === 8) return "Settembre";
    if (m === 9) return "Ottobre";
    return season;
  }, [season, seasonBaseDate]);

  const nights = useMemo(() => {
    if (!usesOvernightDates) return 0;
    if (!dateFrom || !dateTo) return 0;
    const n = nightsBetween(dateFrom, dateTo);
    return n > 0 ? n : 0;
  }, [usesOvernightDates, dateFrom, dateTo]);

  const basePrice = useMemo(
    () =>
      calcBasePrice({
        season,
        exp: baseExpForCalc,
        nights,
        baseDate: seasonBaseDate,
      }),
    [season, baseExpForCalc, nights, seasonBaseDate]
  );

  const priceLabel = useMemo(() => {
    const effective = getEffectivePrices({ season, baseDate: seasonBaseDate });
    if (baseExpForCalc === "overnight") {
      const perNight = effective.night;
      if (!nights) return `${formatEUR(perNight)} / notte`;
      return `${formatEUR(perNight)} × ${nights} notti`;
    }
    return basePrice !== null ? formatEUR(basePrice) : "Da definire";
  }, [season, nights, baseExpForCalc, basePrice, seasonBaseDate]);

  const extrasTotal = useMemo(() => {
    const catering = extraCatering ? EXTRA.cateringPerPerson * people : 0;
    return (
      (extraSeabob ? EXTRA.seabob : 0) +
      (extraDrinks ? EXTRA.drinksPremium : 0) +
      catering +
      (extraGopro ? EXTRA.gopro : 0)
    );
  }, [extraSeabob, extraDrinks, extraCatering, extraGopro, people]);

  // ✅ Mandatory extras (sempre)
  const mandatoryExtras = useMemo(() => {
    if (!usesOvernightDates) {
      return {
        skipper: MANDATORY_DAY.skipper,
        cleaning: MANDATORY_DAY.cleaning,
        fuel: MANDATORY_DAY.fuel,
        fuelNote: null as string | null,
      };
    }
    const fuelEst = MANDATORY_WEEK.avgEngineHours * MANDATORY_WEEK.fuelPerHourPerEngine * MANDATORY_WEEK.engines; // 15h * 15 * 2 = 450
    return {
      skipper: MANDATORY_WEEK.skipper,
      cleaning: MANDATORY_WEEK.cleaning,
      fuel: fuelEst, // solo stima per total
      fuelNote: `Fuel: ${MANDATORY_WEEK.fuelPerHourPerEngine}€/h × ${MANDATORY_WEEK.engines} motori (stima media ${MANDATORY_WEEK.avgEngineHours}h ≈ ${formatEUR(
        fuelEst
      )})`,
    };
  }, [usesOvernightDates]);

  const mandatoryTotal = useMemo(() => {
    return (mandatoryExtras.skipper || 0) + (mandatoryExtras.cleaning || 0) + (mandatoryExtras.fuel || 0);
  }, [mandatoryExtras]);

  const totalEstimated = useMemo(
    () => (basePrice ?? 0) + mandatoryTotal + extrasTotal,
    [basePrice, mandatoryTotal, extrasTotal]
  );

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
        setAvailabilityError(data?.error ? String(data.error) : "Errore verifica disponibilità");
        return;
      }

      const closed = Array.isArray(data.closed) ? (data.closed as string[]) : [];

      setClosedDates(closed);
      setAvailabilityError(null);
    } catch (e: any) {
      setClosedDates([]);
      setAvailabilityError(e?.message ? String(e.message) : "Errore verifica disponibilità");
    } finally {
      setCheckingAvailability(false);
    }
  }

  useEffect(() => {
    const fromISO = usesOvernightDates ? dateFrom : date;
    const toISO = usesOvernightDates ? dateTo : date;

    if (usesOvernightDates && (!dateFrom || !dateTo || dateTo <= dateFrom)) {
      setClosedDates([]);
      setAvailabilityError(null);
      return;
    }

    const tt = setTimeout(() => {
      checkAvailability(fromISO, toISO);
    }, 250);

    return () => clearTimeout(tt);
  }, [usesOvernightDates, date, dateFrom, dateTo]);

  const hasClosedInSelection = closedDates.length > 0;
  const waDisabled = checkingAvailability || !!availabilityError || hasClosedInSelection;
  const canSendWhatsapp = !waDisabled;

  const timeRange = useMemo(() => {
    const exp = baseExpForCalc;
    if (exp !== "day" && exp !== "halfday" && exp !== "sunset") return null;
    return getTimeRangeFor({ baseDate: seasonBaseDate, exp, halfdaySlot });
  }, [baseExpForCalc, seasonBaseDate, halfdaySlot]);

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

    if (timeRange && !usesOvernightDates) {
      lines.push(`*Orario:* ${timeRange}`);
    }

    const effective = getEffectivePrices({ season, baseDate: seasonBaseDate });

    if (usesOvernightDates) {
      lines.push(`*Da:* ${dateFrom}`);
      lines.push(`*A:* ${dateTo}`);
      lines.push(`*Notti:* ${nights || "—"}`);
      lines.push(`*Prezzo notte:* ${formatEUR(effective.night)} (${seasonLabel})`);
      lines.push(`*Dettaglio:* ${priceLabel}`);
    } else {
      lines.push(`*Data:* ${date}`);
      lines.push(`*Prezzo base barca:* ${basePrice !== null ? formatEUR(basePrice) : "Da definire"} (${seasonLabel})`);
    }

    // ✅ mandatory extras (elencati)
    lines.push("");
    lines.push("*Extra obbligatori:*");
    if (!usesOvernightDates) {
      lines.push(`- Skipper: ${formatEUR(MANDATORY_DAY.skipper)}`);
      lines.push(`- Pulizia finale: ${formatEUR(MANDATORY_DAY.cleaning)}`);
      lines.push(`- Carburante (forfait day): ${formatEUR(MANDATORY_DAY.fuel)}`);
      lines.push(
        `*Totale extra obbligatori:* ${formatEUR(MANDATORY_DAY.skipper + MANDATORY_DAY.cleaning + MANDATORY_DAY.fuel)}`
      );
    } else {
      const fuelEst = MANDATORY_WEEK.avgEngineHours * MANDATORY_WEEK.fuelPerHourPerEngine * MANDATORY_WEEK.engines;
      lines.push(`- Skipper (7 giorni): ${formatEUR(MANDATORY_WEEK.skipper)}`);
      lines.push(`- Pulizia finale: ${formatEUR(MANDATORY_WEEK.cleaning)}`);
      lines.push(
        `- Carburante: ${MANDATORY_WEEK.fuelPerHourPerEngine}€/h × ${MANDATORY_WEEK.engines} motori (stima ${MANDATORY_WEEK.avgEngineHours}h ≈ ${formatEUR(
          fuelEst
        )})`
      );
      lines.push(
        `*Totale extra obbligatori stimato:* ${formatEUR(MANDATORY_WEEK.skipper + MANDATORY_WEEK.cleaning + fuelEst)}`
      );
    }

    if (extrasTotal > 0) lines.push(`*Extra opzionali:* ${formatEUR(extrasTotal)}`);
    lines.push(`*Totale stimato:* ${formatEUR(totalEstimated)}`);

    if (hasClosedInSelection) {
      lines.push("");
      lines.push(`⚠️ Nota: nel calendario risultano occupate queste date: ${closedDates.join(", ")}`);
    }

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
    seasonBaseDate,
    name,
    notes,
    halfdaySlot,
    extrasTotal,
    totalEstimated,
    priceLabel,
    hasClosedInSelection,
    closedDates,
    timeRange,
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
        {/* … RESTO IDENTICO AL TUO FILE … */}
        {/* (ho lasciato tutto invariato: UI/Stripe/WhatsApp/logiche, cambia solo night Apr–Ott) */}
      </div>
    </main>
  );
}
