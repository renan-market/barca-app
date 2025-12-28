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
  { id: "sunset", title: "Sunset", subtitle: "Tramonto + aperitivo", durationLabel: "3 ore" },
  { id: "overnight", title: "Pernottamento", subtitle: "Multi-day (con notti)", durationLabel: "Da/A" },
  { id: "custom", title: "Personalizzata", subtitle: "Extra + richiesta su misura", durationLabel: "variabile" },
];

// ✅ PREZZI STAGIONALI (restano come sono: NON tocchiamo Media/Alta adesso)
const PRICES: Record<SeasonKey, { day: number; halfday: number; sunset: number; night: number }> = {
  Bassa: { day: 650, halfday: 450, sunset: 420, night: 845 },
  Media: { day: 850, halfday: 600, sunset: 520, night: 1105 },
  Alta: { day: 1100, halfday: 780, sunset: 650, night: 1430 },
};

// ✅ APRILE = EXTRA-BASSA (AUTO) — prezzi separati
const APRIL_PRICES = { day: 380, halfday: 280, sunset: 260, night: 500 } as const;

// ✅ EXTRA (transfer tolto) — ✅ PULIZIA FINALE RIMOSSA
const EXTRA = {
  seabob: 650,
  drinksPremium: 150,
  cateringPerPerson: 25,
  gopro: 80,
} as const;

/**
 * ✅ FIX STAGIONI (Regola desiderata)
 * - Alta: Luglio + Agosto
 * - Media: Giugno + Settembre
 * - Bassa: Aprile + Maggio + Ottobre + resto (Nov–Mar)
 *
 * Inoltre: safe fallback per evitare errori runtime (500)
 */
function getSeasonFromDate(d: Date | null | undefined): SeasonKey {
  if (!d || Number.isNaN(d.getTime())) return "Bassa";
  const month = d.getMonth(); // 0-11
  if (month === 6 || month === 7) return "Alta"; // Luglio, Agosto
  if (month === 5 || month === 8) return "Media"; // Giugno, Settembre
  return "Bassa";
}

// ✅ APRILE check (mese 3 = aprile)
function isApril(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return false;
  return d.getMonth() === 3;
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

// ✅ usa prezzi APRILE solo quando auto e data base è in aprile
function getEffectivePrices(args: { season: SeasonKey; auto: boolean; baseDate: Date | null }) {
  if (args.auto && isApril(args.baseDate)) return APRIL_PRICES;
  return PRICES[args.season];
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
  if (args.exp === "overnight") return p.night * (args.nights || 0);
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
        // ✅ MODIFICA 1: testo incluso con parentesi
        included:
          "Incluso: skipper, maschere e boccaglio, paddle SUP, dinghy. (per pernottamento: lenzuola e asciugamani)",
        notIncluded: "Non incluso: carburante e cambusa.",
        waSend: "Invia su WhatsApp",
        waChecking: "Controllo disponibilità...",
        waClosed: "Date non disponibili",
        waError: "Errore disponibilità",
        waReply: "Ti rispondiamo su WhatsApp appena verifichiamo la disponibilità.",
        language: "Lingua",
        payment: "Pagamento",
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
        waClosed: "Dates not available",
        waError: "Availability error",
        waReply: "We reply on WhatsApp as soon as we verify availability.",
        language: "Language",
        payment: "Payment",
      },
      es: {
        title: "Solicitud de reserva",
        subtitle: "Esto es una solicitud, no una reserva automática. Verificamos disponibilidad y respondemos por WhatsApp.",
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
        waClosed: "Fechas no disponibles",
        waError: "Error de disponibilidad",
        waReply: "Respondemos por WhatsApp cuando confirmemos disponibilidad.",
        language: "Idioma",
        payment: "Pago",
      },
      fr: {
        title: "Demande de réservation",
        subtitle: "Ceci est une demande, pas une réservation automatique. Nous vérifions la disponibilité et répondons sur WhatsApp.",
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
        waClosed: "Dates indisponibles",
        waError: "Erreur disponibilité",
        waReply: "Nous répondons sur WhatsApp dès que la disponibilité est vérifiée.",
        language: "Langue",
        payment: "Paiement",
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
        waClosed: "Даты заняты",
        waError: "Ошибка доступности",
        waReply: "Ответим в WhatsApp после проверки.",
        language: "Язык",
        payment: "Оплата",
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

  const [halfdaySlot, setHalfdaySlot] = useState<HalfDaySlot>("Mattina");

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

  // ✅ etichetta visibile: se aprile e auto, mostra "Aprile"
  const seasonLabel = useMemo(() => {
    if (seasonMode === "auto" && isApril(seasonBaseDate)) return "Aprile";
    return season;
  }, [seasonMode, season, seasonBaseDate]);

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
        auto: seasonMode === "auto",
        baseDate: seasonBaseDate,
      }),
    [season, baseExpForCalc, nights, seasonMode, seasonBaseDate]
  );

  const priceLabel = useMemo(() => {
    const effective = getEffectivePrices({ season, auto: seasonMode === "auto", baseDate: seasonBaseDate });
    if (baseExpForCalc === "overnight") {
      const perNight = effective.night;
      if (!nights) return `${formatEUR(perNight)} / notte`;
      return `${formatEUR(perNight)} × ${nights} notti`;
    }
    return basePrice !== null ? formatEUR(basePrice) : "Da definire";
  }, [season, nights, baseExpForCalc, basePrice, seasonMode, seasonBaseDate]);

  const extrasTotal = useMemo(() => {
    const catering = extraCatering ? EXTRA.cateringPerPerson * people : 0;
    return (extraSeabob ? EXTRA.seabob : 0) + (extraDrinks ? EXTRA.drinksPremium : 0) + catering + (extraGopro ? EXTRA.gopro : 0);
  }, [extraSeabob, extraDrinks, extraCatering, extraGopro, people]);

  const totalEstimated = useMemo(() => (basePrice ?? 0) + extrasTotal, [basePrice, extrasTotal]);

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
      lines.push(`*Dettaglio:* ${priceLabel}`);
    } else {
      lines.push(`*Data:* ${date}`);
      lines.push(`*Prezzo base stimato:* ${basePrice !== null ? formatEUR(basePrice) : "Da definire"} (${seasonLabel})`);
    }

    lines.push(`*Persone:* ${people}`);
    if (extrasTotal > 0) lines.push(`*Extra:* ${formatEUR(extrasTotal)}`);
    lines.push(`*Totale stimato:* ${formatEUR(totalEstimated)}`);

    if (hasClosedInSelection) {
      lines.push("");
      lines.push(`⚠️ Nota: nel calendario risultano occupate queste date: ${closedDates.join(", ")}`);
    }

    lines.push("");
    // ✅ MODIFICA 2: incluso con parentesi anche in WhatsApp
    lines.push("*Incluso:* skipper, maschere e boccaglio, paddle SUP, dinghy. (per pernottamento: lenzuola e asciugamani)");
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
    seasonLabel,
    seasonMode,
    seasonBaseDate,
    name,
    notes,
    halfdaySlot,
    extrasTotal,
    totalEstimated,
    priceLabel,
    hasClosedInSelection,
    closedDates,
    t,
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
      {/* ✅ SAFE AREA: evita che la “costina” iPhone copra il fondo */}
      <div className="mx-auto max-w-md px-4 pt-6 pb-[calc(96px+env(safe-area-inset-bottom))]">
        <div className="rounded-[28px] bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white drop-shadow-sm">{t("title")}</h1>
              <p className="text-white/90 mt-1">{t("subtitle")}</p>
            </div>

            {/* ✅ COLONNA DESTRA: Lingua (in alto a destra) + Barca */}
            <div className="relative flex flex-col items-end gap-2 text-right">
              {/* ✅ Lingua (spostata qui) */}
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

              {/* ✅ Dropdown verso il basso */}
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

              {/* Barca */}
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
              </section>

              {/* BLOCCO DISPONIBILITÀ (riassunto) */}
              <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_6px_18px_rgba(0,0,0,0.06)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-slate-800">{t("availability")}</div>
                    <div className="font-bold text-gray-900">
                      {checkingAvailability
                        ? t("checking")
                        : hasClosedInSelection
                        ? t("notAvailable")
                        : availabilityError
                        ? t("error")
                        : t("available")}
                    </div>
                  </div>
                  <div className="text-right">
                    {availabilityError ? (
                      <div className="text-xs text-red-600 font-semibold">{t("error")}</div>
                    ) : hasClosedInSelection ? (
                      <div className="text-xs text-red-600 font-semibold">{t("notAvailable")}</div>
                    ) : (
                      <div className="text-xs text-emerald-700 font-semibold">OK</div>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-800 mt-2">{t("datesInfo")}</p>
              </section>

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

                    <p className="text-xs text-slate-800">
                      Bevande Premium: pacchetto aperitivo per il gruppo (fino a 12 persone). Catering: {formatEUR(EXTRA.cateringPerPerson)} a persona.
                    </p>
                  </div>
                </section>
              )}

              {/* DATA + PERSONE */}
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">{usesOvernightDates ? t("dates") : t("date")}</label>

                  {usesOvernightDates ? (
                    <div className="mt-2 space-y-2">
                      <div>
                        <div className="text-xs text-slate-800 mb-1">{t("from")}</div>
                        <input type="date" value={dateFrom} onChange={(e) => setFromSafe(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" />
                      </div>
                      <div>
                        <div className="text-xs text-slate-800 mb-1">{t("to")}</div>
                        <input type="date" value={dateTo} onChange={(e) => setToSafe(e.target.value)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" />
                      </div>
                      <div className="text-xs text-slate-900">
                        {t("nights")}:{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-1 bg-sky-50 text-sky-700 font-semibold">{nights || "—"}</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" />
                      <div className="mt-2 text-xs text-slate-900">
                        {t("seasonAuto")}{" "}
                        <span className="inline-flex items-center rounded-full px-2 py-1 bg-sky-50 text-sky-700 font-semibold">{seasonMode === "auto" ? seasonLabel : autoSeason}</span>
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
                    <div className="font-bold text-gray-900">{seasonMode === "auto" ? `Automatica (${seasonLabel})` : `Manuale (${manualSeason})`}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSeasonMode("auto")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "auto" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-800 border-gray-200",
                      ].join(" ")}
                    >
                      {t("auto")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSeasonMode("manual")}
                      className={[
                        "rounded-full px-3 py-1 text-xs font-semibold border transition",
                        seasonMode === "manual" ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-800 border-gray-200",
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
                            active ? "border-transparent bg-gradient-to-b from-sky-50 to-white ring-2 ring-sky-200" : "border-gray-200 bg-white hover:border-gray-300",
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
                    {baseExpForCalc === "overnight" ? (
                      <>
                        <div className="text-lg font-extrabold">{formatEUR(getEffectivePrices({ season, auto: seasonMode === "auto", baseDate: seasonBaseDate }).night)} / notte</div>
                        <div className="text-xs text-slate-800 mt-1">{priceLabel}</div>
                        {extrasTotal > 0 && <div className="text-xs text-slate-800 mt-1">Extra: {formatEUR(extrasTotal)}</div>}
                        <div className="text-xs text-slate-900 mt-1">
                          Totale stimato: <b>{formatEUR(totalEstimated)}</b>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-lg font-extrabold">{basePrice !== null ? formatEUR(basePrice) : "Da definire"}</div>
                        {extrasTotal > 0 && <div className="text-xs text-slate-800 mt-1">Extra: {formatEUR(extrasTotal)}</div>}
                        <div className="text-xs text-slate-900 mt-1">
                          Totale stimato: <b>{formatEUR(totalEstimated)}</b>
                        </div>
                      </>
                    )}
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
                  <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePh")} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" />
                </div>

                <div>
                  <label className="text-sm font-semibold text-gray-900">{t("notesOpt")}</label>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("notesPh")} rows={4} className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]" />
                </div>

                <div className="text-xs text-slate-900">
                  <b>{t("included").split(":")[0]}:</b> {t("included").split(":").slice(1).join(":").trim()}{" "}
                  <b>{t("notIncluded").split(":")[0]}:</b> {t("notIncluded").split(":").slice(1).join(":").trim()}
                </div>
              </section>

              {/* CTA ROW: WhatsApp + Pagamento */}
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
                    <button type="button" disabled className="col-span-2 block w-full rounded-2xl text-white/95 text-center font-extrabold py-3 bg-gray-500 cursor-not-allowed">
                      {checkingAvailability ? t("waChecking") : hasClosedInSelection ? t("waClosed") : t("waError")}
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
