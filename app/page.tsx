"use client";

import React, { useEffect, useMemo, useState, useRef } from "react";
import { Sunrise, Sunset, Anchor, Moon } from "lucide-react";

type Lang = "es" | "en" | "it" | "fr" | "de" | "ru";
type ExperienceId = "half_am" | "half_pm" | "day" | "sunset" | "overnight";
type Interval = [number, number]; // minuti [start,end)
type BusyMap = Record<string, Interval[]>;

type AvailabilityResponse = {
  ok: boolean;
  tz?: string;
  closed: string[];
  busy: BusyMap;
  v?: number;
  error?: string;
};

type StripeResponse = {
  ok: boolean;
  url?: string;
  error?: string;
};

/* =========================
   CONFIG (NO SPAGHETTI)
   ========================= */

// ✅ 10 foto in /public
const HERO_IMAGES: string[] = [
  "/boats/Lagoon-38/01.jpg",
  "/boats/Lagoon-38/02.jpg",
  "/boats/Lagoon-38/03.jpg",
  "/boats/Lagoon-38/04.jpg",
  "/boats/Lagoon-38/05.jpg",
  "/boats/Lagoon-38/06.jpg",
  "/boats/Lagoon-38/07.jpg",
  "/boats/Lagoon-38/08.jpg",
  "/boats/Lagoon-38/09.jpg",
  "/boats/Lagoon-38/10.jpg",
];

const TZ = "Europe/Madrid";

// Orari definitivi
const SLOT: Record<ExperienceId, Interval | null> = {
  half_am: [10 * 60, 14 * 60], // 10:00–14:00
  half_pm: [14 * 60 + 30, 18 * 60 + 30], // 14:30–18:30
  day: [10 * 60, 18 * 60], // 10:00–18:00
  sunset: [19 * 60, 21 * 60 + 30], // 19:00–21:30 (2h30)
  overnight: null, // multi-day
};

/* =========================
   PREZZI 2026 (UFFICIALI)
   ========================= */

type MonthKey = "04" | "05" | "06" | "07" | "08" | "09" | "10";
type PriceKind = "day" | "half" | "sunset" | "overnight_week";

const PRICES_2026: Record<PriceKind, Record<MonthKey, number>> = {
  day: { "04": 380, "05": 460, "06": 600, "07": 700, "08": 850, "09": 460, "10": 380 },
  half: { "04": 280, "05": 320, "06": 420, "07": 500, "08": 570, "09": 280, "10": 320 },
  sunset: { "04": 260, "05": 290, "06": 370, "07": 410, "08": 470, "09": 290, "10": 260 },
  overnight_week: { "04": 4500, "05": 5000, "06": 5500, "07": 6500, "08": 7500, "09": 6000, "10": 4500 },
};

// Overnight multi-day pricing (2-7 days)
const OVERNIGHT_MULTIDAY: Record<MonthKey, Record<number, number>> = {
  "04": { 7: 4500, 6: 3900, 5: 3300, 4: 2700, 3: 2100, 2: 1500 },
  "05": { 7: 5000, 6: 4300, 5: 3600, 4: 3000, 3: 2350, 2: 1650 },
  "06": { 7: 5500, 6: 4800, 5: 4100, 4: 3350, 3: 2600, 2: 1800 },
  "07": { 7: 6500, 6: 5700, 5: 4900, 4: 4000, 3: 3050, 2: 2100 },
  "08": { 7: 7500, 6: 6900, 5: 5900, 4: 4700, 3: 3600, 2: 2400 },
  "09": { 7: 6000, 6: 5400, 5: 4600, 4: 3700, 3: 2850, 2: 1950 },
  "10": { 7: 4500, 6: 3900, 5: 3300, 4: 2700, 3: 2100, 2: 1500 },
};

function monthKeyFromDateISO(date: string): MonthKey | null {
  if (!date) return null;

  // accetta SOLO YYYY-MM-DD
  const isoMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return null;

  const m = isoMatch[2];
  return (["04", "05", "06", "07", "08", "09", "10"].includes(m))
    ? (m as MonthKey)
    : null;
}


function priceForExperience2026(exp: ExperienceId, dateISO: string): number {
  const mk = monthKeyFromDateISO(dateISO);
  if (!mk) return 0;
  if (exp === "day") return PRICES_2026.day[mk];
  if (exp === "half_am" || exp === "half_pm") return PRICES_2026.half[mk];
  if (exp === "sunset") return PRICES_2026.sunset[mk];
  if (exp === "overnight") return PRICES_2026.overnight_week[mk];
  return 0;
}

/* =========================
   Regole fisse ufficiali
   ========================= */

const FIXED_RULES = {
  skipper_per_day: 170, // Overnight: 170€ AL GIORNO (moltiplica per giorni)
  fuel_halfday_day_sunset: 40, // Half/Day/Sunset: 40€ (da sommare)
  cleaning: 50, // sempre da sommare
  fuel_multiday_info_per_hour: 15, // Overnight: solo informativo (NON sommare)
};

// Extra ufficiali
const EXTRA_PRICES = {
  seabob: 650, // ciascuno
  catering_pp: 25, // a persona
  drinks_pack: 150, // totale (12 persone)
  towel: 15, // per asciugamano
};

const WHATSAPP_NUMBER = "393398864884";
const MAX_PEOPLE = 12;

/* =========================
   I18N (come tuo file)
   ========================= */

const I18N: Record<
  Lang,
  {
    brand?: string;
    seasonLabel?: string;
    per_week?: string;
    fixed_total_label?: string;
    multiday_footer_note?: string;
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

    extra_seabob: string;
    extra_catering: string;
    extra_drinks: string;
    extra_towel: string;

    free_sup: string;
    free_snorkel: string;
    free_dinghy: string;

    season_low: string;
    season_mid: string;
    season_high: string;

    summary: string;

    fuel_multiday_note_title: string;
    fuel_multiday_note_body: string;
    days: string;

    requestTitle: string;
    clientName: string;
    clientNamePh: string;
    clientNote: string;
    clientNotePh: string;

    photosTitle: string;
    photosHint: string;
    photoMissing: string;

    stripeError: string;
    stripeStarting: string;
  }
> = {
  it: {
    brand: "Blu Horizonte",
    seasonLabel: "Stagione:",
    per_week: "/settimana",
    fixed_total_label: "Totale spese fisse",
    multiday_footer_note: "Nota: per multi-day il carburante è solo informativo (15€/ora motori) e non è incluso nel totale.",
    langLabel: "Italiano",
    title: "Lagoon 38S2 · Ibiza",
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
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Pacchetto bevande (12 persone)",
    extra_towel: "Teli mare",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Maschera + tubo snorkeling",
    free_dinghy: "Dinghy",
    season_low: "Bassa",
    season_mid: "Media",
    season_high: "Alta",
    summary: "Riepilogo",
    fuel_multiday_note_title: "Nota carburante (Multi-day)",
    fuel_multiday_note_body:
      "Carburante motori: {x} / ora (solo informativo – NON incluso nel totale).",
    days: "Giorni",
    requestTitle: "Richiesta cliente",
    clientName: "Nome cliente",
    clientNamePh: "Es. Marco Rossi",
    clientNote: "Commento / Domanda",
    clientNotePh: "Es. punto d’incontro, richieste, ecc…",
    photosTitle: "Foto",
    photosHint:
      "Se non vedi le foto: controlla che esistano davvero in /public con gli stessi nomi.",
    photoMissing: "Foto non trovata",
    stripeError: "Pagamento non disponibile: ",
    stripeStarting: "Apro Stripe…",
  },
  es: {
    brand: "Blu Horizonte",
    seasonLabel: "Temporada:",
    per_week: "/semana",
    fixed_total_label: "Total costes fijos",
    multiday_footer_note: "Nota: en multi-día el combustible es solo informativo (15€/hora motores) y no está incluido en el total.",
    langLabel: "Español",
    title: "Lagoon 38S2 · Ibiza",
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
    exp_day: "Day Charter",
    exp_sunset: "Sunset",
    exp_overnight: "Pernocta",
    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-day (rango)",
    fixed_skipper: "Skipper",
    fixed_fuel: "Combustible",
    fixed_cleaning: "Limpieza",
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Pack bebidas (12 personas)",
    extra_towel: "Toallas",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Máscara + tubo snorkel",
    free_dinghy: "Dinghy",
    season_low: "Baja",
    season_mid: "Media",
    season_high: "Alta",
    summary: "Resumen",
    fuel_multiday_note_title: "Nota combustible (Multi-day)",
    fuel_multiday_note_body:
      "Combustible motores: {x} / hora (solo informativo – NO incluido en el total).",
    days: "Días",
    requestTitle: "Solicitud del cliente",
    clientName: "Nombre del cliente",
    clientNamePh: "Ej. Marco Rossi",
    clientNote: "Comentario / Pregunta",
    clientNotePh: "Ej. punto de encuentro, dudas, etc…",
    photosTitle: "Fotos",
    photosHint:
      "Si no ves las fotos: revisa que existan en /public con los mismos nombres.",
    photoMissing: "Foto no encontrada",
    stripeError: "Pago no disponible: ",
    stripeStarting: "Abriendo Stripe…",
  },
  en: {
    brand: "Blu Horizonte",
    seasonLabel: "Season:",
    per_week: "/week",
    fixed_total_label: "Total fixed costs",
    multiday_footer_note: "Note: for multi-day engine fuel is informational (15€/hour) and is NOT included in the total.",
    langLabel: "English",
    title: "Lagoon 38S2 · Ibiza",
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
    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Drinks pack (12 people)",
    extra_towel: "Beach towels",
    free_sup: "SUP / Paddle board",
    free_snorkel: "Mask + snorkel tube",
    free_dinghy: "Dinghy",
    season_low: "Low",
    season_mid: "Mid",
    season_high: "High",
    summary: "Summary",
    fuel_multiday_note_title: "Fuel note (Multi-day)",
    fuel_multiday_note_body:
      "Engine fuel: {x} / hour (informational only – NOT included in total).",
    days: "Days",
    requestTitle: "Customer request",
    clientName: "Customer name",
    clientNamePh: "e.g. Marco Rossi",
    clientNote: "Comment / Question",
    clientNotePh: "e.g. meeting point, questions, etc…",
    photosTitle: "Photos",
    photosHint:
      "If you don’t see photos: verify they exist in /public with the same names.",
    photoMissing: "Photo missing",
    stripeError: "Payment unavailable: ",
    stripeStarting: "Opening Stripe…",
  },
  fr: {
    brand: "Blu Horizonte",
    seasonLabel: "Saison:",
    per_week: "/semaine",
    fixed_total_label: "Total des coûts fixes",
    multiday_footer_note: "Remarque : pour les séjours multi-jours, le carburant moteur est à titre indicatif (15€/heure) et n'est PAS inclus dans le total.",
    langLabel: "Français",
    title: "Lagoon 38S2 · Ibiza",
    subtitle: "Expériences privées à bord d'un catamaran",
    selectDate: "Sélectionnez une date",
    loading: "Chargement…",
    available: "Disponible",
    notAvailable: "Indisponible",
    experiences: "Expériences",
    fixedCosts: "Coûts fixes (obligatoires)",
    extras: "Extras (optionnels)",
    includedFree: "Inclus gratuitement",
    total: "Total",
    bookWhatsapp: "Réserver sur WhatsApp",
    payNow: "Payer maintenant",
    people: "Personnes",
    nights: "Nuits",
    dateFrom: "De",
    dateTo: "À",

    exp_half_am: "Demi-journée (Matin)",
    exp_half_pm: "Demi-journée (Après-midi)",
    exp_day: "Day Charter",
    exp_sunset: "Coucher de soleil",
    exp_overnight: "Nuitée",

    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Multi-jours (plage de dates)",

    fixed_skipper: "Skipper",
    fixed_fuel: "Carburant",
    fixed_cleaning: "Nettoyage",

    extra_seabob: "SeaBob",
    extra_catering: "Restauration",
    extra_drinks: "Pack boissons (12 personnes)",
    extra_towel: "Serviettes de plage",

    free_sup: "SUP / Paddle",
    free_snorkel: "Masque + tuba",
    free_dinghy: "Annexe",

    season_low: "Basse",
    season_mid: "Moyenne",
    season_high: "Haute",

    summary: "Récapitulatif",

    fuel_multiday_note_title: "Note carburant (Multi-jours)",
    fuel_multiday_note_body: "Carburant moteur : {x} / heure (à titre indicatif – NON inclus dans le total).",
    days: "Jours",

    requestTitle: "Demande client",
    clientName: "Nom du client",
    clientNamePh: "Ex. Marco Rossi",
    clientNote: "Commentaire / Question",
    clientNotePh: "Ex. point de rencontre, demandes, etc…",

    photosTitle: "Photos",
    photosHint: "Si vous ne voyez pas les photos : vérifiez qu'elles existent dans /public avec les mêmes noms.",
    photoMissing: "Photo manquante",

    stripeError: "Paiement indisponible : ",
    stripeStarting: "Ouverture de Stripe…",
  },
  de: {
    brand: "Blu Horizonte",
    seasonLabel: "Saison:",
    per_week: "/Woche",
    fixed_total_label: "Gesamte feste Kosten",
    multiday_footer_note: "Hinweis: Bei Mehrtagesfahrten dient der Motor-Kraftstoff als Richtwert (15€/Stunde) und ist NICHT im Gesamtpreis enthalten.",
    langLabel: "Deutsch",
    title: "Lagoon 38S2 · Ibiza",
    subtitle: "Private Katamaran-Erlebnisse",
    selectDate: "Datum wählen",
    loading: "Lädt…",
    available: "Verfügbar",
    notAvailable: "Nicht verfügbar",
    experiences: "Erlebnisse",
    fixedCosts: "Fixkosten (verpflichtend)",
    extras: "Extras (optional)",
    includedFree: "Inklusive",
    total: "Gesamt",
    bookWhatsapp: "Per WhatsApp buchen",
    payNow: "Jetzt bezahlen",
    people: "Personen",
    nights: "Nächte",
    dateFrom: "Von",
    dateTo: "Bis",

    exp_half_am: "Halber Tag (Vormittag)",
    exp_half_pm: "Halber Tag (Nachmittag)",
    exp_day: "Day Charter",
    exp_sunset: "Sunset",
    exp_overnight: "Übernachtung",

    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Mehrere Tage (Datumsbereich)",

    fixed_skipper: "Skipper",
    fixed_fuel: "Treibstoff",
    fixed_cleaning: "Reinigung",

    extra_seabob: "SeaBob",
    extra_catering: "Catering",
    extra_drinks: "Getränkepaket (12 Personen)",
    extra_towel: "Strandtücher",

    free_sup: "SUP / Stand-up-Paddle",
    free_snorkel: "Maske + Schnorchel",
    free_dinghy: "Beiboot",

    season_low: "Niedrig",
    season_mid: "Mittel",
    season_high: "Hoch",

    summary: "Zusammenfassung",

    fuel_multiday_note_title: "Kraftstoff-Hinweis (Mehrere Tage)",
    fuel_multiday_note_body: "Motor-Kraftstoff: {x} / Stunde (nur zur Information – NICHT im Gesamtpreis enthalten).",
    days: "Tage",

    requestTitle: "Kundenanfrage",
    clientName: "Kundenname",
    clientNamePh: "z. B. Marco Rossi",
    clientNote: "Kommentar / Frage",
    clientNotePh: "z. B. Treffpunkt, Anfragen, etc…",

    photosTitle: "Fotos",
    photosHint: "Wenn Sie die Fotos nicht sehen: prüfen Sie, ob sie im Ordner /public mit denselben Namen vorhanden sind.",
    photoMissing: "Foto fehlt",

    stripeError: "Zahlung nicht verfügbar: ",
    stripeStarting: "Stripe wird geöffnet…",
  },
  ru: {
    brand: "Blu Horizonte",
    seasonLabel: "Сезон:",
    per_week: "/неделя",
    fixed_total_label: "Итого фиксированные расходы",
    multiday_footer_note: "Примечание: для многодневных поездок топливо для двигателей указано ориентировочно (15€/ч) и НЕ включено в общую сумму.",
    langLabel: "Русский",
    title: "Lagoon 38S2 · Ibiza",
    subtitle: "Частные прогулки на катамаране",
    selectDate: "Выберите дату",
    loading: "Загрузка…",
    available: "Доступно",
    notAvailable: "Недоступно",
    experiences: "Программы",
    fixedCosts: "Фиксированные расходы (обязательно)",
    extras: "Опции (по желанию)",
    includedFree: "Включено бесплатно",
    total: "Итого",
    bookWhatsapp: "Забронировать через WhatsApp",
    payNow: "Оплатить сейчас",
    people: "Человек",
    nights: "Ночи",
    dateFrom: "От",
    dateTo: "До",

    exp_half_am: "Полдня (утро)",
    exp_half_pm: "Полдня (вечер)",
    exp_day: "Дневной чартер",
    exp_sunset: "Закат",
    exp_overnight: "Ночёвка",

    half_am_sub: "10:00 – 14:00",
    half_pm_sub: "14:30 – 18:30",
    day_sub: "10:00 – 18:00",
    sunset_sub: "19:00 – 21:30",
    overnight_sub: "Несколько дней (диапазон дат)",

    fixed_skipper: "Скиппер",
    fixed_fuel: "Топливо",
    fixed_cleaning: "Уборка",

    extra_seabob: "SeaBob",
    extra_catering: "Кейтеринг",
    extra_drinks: "Набор напитков (12 человек)",
    extra_towel: "Пляжные полотенца",

    free_sup: "SUP / Паддлборд",
    free_snorkel: "Маска + трубка для снорклинга",
    free_dinghy: "Лодка",

    season_low: "Низкий",
    season_mid: "Средний",
    season_high: "Высокий",

    summary: "Итог",

    fuel_multiday_note_title: "Примечание по топливу (многодневные)",
    fuel_multiday_note_body: "Топливо для двигателей: {x} / час (только для информации – НЕ включено в итог).",
    days: "Дни",

    requestTitle: "Запрос клиента",
    clientName: "Имя клиента",
    clientNamePh: "напр. Marco Rossi",
    clientNote: "Комментарий / Вопрос",
    clientNotePh: "напр. место встречи, пожелания и т. п.",

    photosTitle: "Фотографии",
    photosHint: "Если вы не видите фотографии: проверьте, что они есть в папке /public с теми же именами.",
    photoMissing: "Фото не найдено",

    stripeError: "Платёж недоступен: ",
    stripeStarting: "Открываю Stripe…",
  },
};

/* =========================
   UTILS
   ========================= */

function euro(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function todayInTz(tz: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// Safe ISO: ritorna YYYY-MM-DD nel fuso orario specificato senza shift UTC
function safeISO(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// ✅ se oggi è fuori Apr–Ott → default al prossimo 01 Aprile (così vedi i prezzi giusti subito)
function defaultBookingDateISO(tz: string) {
  const today = todayInTz(tz); // YYYY-MM-DD
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  if (m >= 4 && m <= 10) return today;
  if (m < 4) return `${y}-04-01`;
  return `${y + 1}-04-01`;
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

function daysBetweenISO(fromISO: string, toISO: string) {
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  const diff = b.getTime() - a.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, days || 0);
}

/* =========================
   (Solo label estetica)
   ========================= */

type Season = "low" | "mid" | "high";
function seasonFromDateISO(dateISO: string): Season {
  const m = Number(dateISO.slice(5, 7)); // 1..12
  // Regole finali:
  // low: Apr, May, Oct
  // mid: Jun, Sep
  // high: Jul, Aug
  if (m === 4 || m === 5 || m === 10) return "low";
  if (m === 6 || m === 9) return "mid";
  return "high";
}



/* =========================
   UI COMPONENTS (stessa UI)
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
   MAIN (HOME)
   ========================= */

export default function Page() {
  const [lang, setLang] = useState<Lang>("it");
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langButtonRef = useRef<HTMLButtonElement | null>(null);
  const langMenuRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (!langMenuOpen) return;

      const path = (e.composedPath?.() ?? []) as EventTarget[];

      const inBtn =
        !!langButtonRef.current && path.includes(langButtonRef.current);
      const inMenu =
        !!langMenuRef.current && path.includes(langMenuRef.current);

      if (!inBtn && !inMenu) setLangMenuOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLangMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [langMenuOpen]);


  const t = I18N[lang] ?? I18N.it;

  // customer fields
  const [clientName, setClientName] = useState<string>("");
  const [clientNote, setClientNote] = useState<string>("");

  // hero slider
  const [heroIdx, setHeroIdx] = useState(0);
  const [broken, setBroken] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const id = window.setInterval(() => {
      setHeroIdx((x) => (x + 1) % HERO_IMAGES.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  // date / range
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    defaultBookingDateISO(TZ)
  );
  const [dateFrom, setDateFrom] = useState<string>(() => defaultBookingDateISO(TZ));
  const [dateTo, setDateTo] = useState<string>(() => defaultBookingDateISO(TZ));

  // experience
  const [experience, setExperience] = useState<ExperienceId>("half_am");

  // people (max 12) — stable numeric state + free-typing string for mobile input
  const [people, setPeople] = useState<number>(1);
  const [peopleInput, setPeopleInput] = useState<string>(String(people));

  // keep peopleInput in sync when people changes programmatically
  useEffect(() => {
    setPeopleInput(String(people));
  }, [people]);

  // Auto-update dateTo when overnight is selected and dateFrom changes
  useEffect(() => {
    if (experience !== "overnight") return;
    if (!dateFrom) return;

    // Assicura che dateTo sia almeno 2 giorni dopo dateFrom
    if (!dateTo || compareISO(dateTo, dateFrom) < 0) {
      // Imposta dateTo a dateFrom + 2 giorni (minimo per overnight)
      const fromDate = new Date(dateFrom + "T00:00:00");
      fromDate.setDate(fromDate.getDate() + 2);
      const newDateTo = safeISO(fromDate, TZ);
      setDateTo(newDateTo);
    } else {
      // Verifica che il range sia almeno 2 giorni
      const days = daysBetweenISO(dateFrom, dateTo);
      if (days < 2) {
        const fromDate = new Date(dateFrom + "T00:00:00");
        fromDate.setDate(fromDate.getDate() + 2);
        const newDateTo = safeISO(fromDate, TZ);
        setDateTo(newDateTo);
      }
    }
  }, [experience, dateFrom, dateTo]);

  // Sync date when switching experience
  useEffect(() => {
    if (experience === "overnight") {
      if (!dateFrom) {
        setDateFrom(selectedDate);
      }
      if (!dateTo) {
        const fromDate = new Date((dateFrom || selectedDate) + "T00:00:00");
        fromDate.setDate(fromDate.getDate() + 2);
        setDateTo(safeISO(fromDate, TZ));
      }
    } else {
      if (dateFrom) {
        setSelectedDate(dateFrom);
      }
    }
  }, [experience]);

  // extras
  const [seabobQty, setSeabobQty] = useState<number>(0);
  const [towelQty, setTowelQty] = useState<number>(0);
  const [drinksPack, setDrinksPack] = useState<boolean>(false);
  const [catering, setCatering] = useState<boolean>(false);

  // availability
  const [api, setApi] = useState<AvailabilityResponse | null>(null);
  const [loadingAvail, setLoadingAvail] = useState(false);

  // stripe
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState<string>("");

  // season (solo label)
  const season = useMemo(
  () => seasonFromDateISO(experience === "overnight" ? (dateFrom || selectedDate) : selectedDate),
  [experience, dateFrom, selectedDate]
);

  const seasonLabel = useMemo(() => {
    if (season === "low") return t.season_low;
    if (season === "mid") return t.season_mid;
    return t.season_high;
  }, [season, t]);

  // overnight days
  const overnightDays = useMemo(() => {
    if (experience !== "overnight") return 1;
    if (compareISO(dateTo, dateFrom) <= 0) return 1;
    return daysBetweenISO(dateFrom, dateTo);
  }, [experience, dateFrom, dateTo]);

  // ✅ base price (PREZZI 2026)
  const basePrice = useMemo(() => {
    if (experience !== "overnight") {
      return priceForExperience2026(experience, selectedDate);
    }

    // Overnight: use multi-day pricing table (2-7 days) from dateFrom/dateTo range
    // Return 0 if dates are not both selected
    if (!dateFrom || !dateTo) return 0;
    
    const mk = monthKeyFromDateISO(dateFrom);
    if (!mk) return 0;

    // Calculate actual days from range (not from selector)
    const actualDays = daysBetweenISO(dateFrom, dateTo);
    if (actualDays < 1) return 0;
    
    // Clamp to 2-7 days for pricing table
    const duration = Math.max(2, Math.min(7, actualDays));
    return OVERNIGHT_MULTIDAY[mk]?.[duration] || 0;
  }, [experience, selectedDate, dateFrom, dateTo]);

  // fixed items (official rules)
  const fixedItems = useMemo(() => {
    // For overnight, calculate actual days from range
    let overnightActualDays = 0;
    if (experience === "overnight" && dateFrom && dateTo) {
      const days = daysBetweenISO(dateFrom, dateTo);
      overnightActualDays = Math.max(2, Math.min(7, days));
    }

    const skipper =
      experience === "overnight"
        ? FIXED_RULES.skipper_per_day * overnightActualDays
        : FIXED_RULES.skipper_per_day;

    const fuel =
      experience === "overnight" ? 0 : FIXED_RULES.fuel_halfday_day_sunset;

    const cleaning = FIXED_RULES.cleaning;

    return [
      { id: "skipper", label: t.fixed_skipper, price: skipper },
      {
        id: "fuel",
        label: t.fixed_fuel,
        price: fuel,
        hidden: experience === "overnight",
      },
      { id: "cleaning", label: t.fixed_cleaning, price: cleaning },
    ].filter((x) => !(x as any).hidden);
  }, [experience, dateFrom, dateTo, t.fixed_skipper, t.fixed_fuel, t.fixed_cleaning]);

  const fixedTotal = useMemo(
    () => fixedItems.reduce((sum, x) => sum + (x.price || 0), 0),
    [fixedItems]
  );

  const extrasTotal = useMemo(() => {
    const seabob = seabobQty * EXTRA_PRICES.seabob;
    const towel = towelQty * EXTRA_PRICES.towel;
    const drinks = drinksPack ? EXTRA_PRICES.drinks_pack : 0;
    const cat = catering ? people * EXTRA_PRICES.catering_pp : 0;
    return seabob + towel + drinks + cat;
  }, [seabobQty, towelQty, drinksPack, catering, people]);

  const grandTotal = useMemo(
    () => basePrice + fixedTotal + extrasTotal,
    [basePrice, fixedTotal, extrasTotal]
  );

  // availability fetch (fetch closed[] and busy for the relevant date(s))
  useEffect(() => {
    let alive = true;

    async function load() {
      setLoadingAvail(true);
      try {
        // For overnight we need the full range (dateFrom..dateTo) to detect closed days;
        // otherwise fetch the single selectedDate for slot experiences.
        const fromParam =
          experience === "overnight" && dateFrom ? encodeURIComponent(dateFrom) : encodeURIComponent(selectedDate);
        const toParam =
          experience === "overnight" && dateFrom
            ? encodeURIComponent(dateTo && compareISO(dateTo, dateFrom) >= 0 ? dateTo : dateFrom)
            : encodeURIComponent(selectedDate);

        const res = await fetch(`/api/availability?from=${fromParam}&to=${toParam}`, { cache: "no-store" });
        const data = (await res.json()) as AvailabilityResponse;
        if (alive) setApi(data);
      } catch {
        if (alive) setApi({ ok: true, closed: [], busy: {}, v: 0 });
      } finally {
        if (alive) setLoadingAvail(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, [selectedDate, experience, dateFrom, dateTo]);

  // A) Definisci UNA SOLA data di riferimento per availability
  const activeDateISO = useMemo(
    () => (experience === "overnight" ? (dateFrom || selectedDate) : selectedDate),
    [experience, dateFrom, selectedDate]
  );

  const { closedSet, intervals } = useMemo(() => {
    const closedSet = new Set(api?.closed ?? []);
    const raw = api?.busy?.[activeDateISO] ?? [];
    const intervals: Interval[] = raw.map((it) => [it[0], it[1]]);
    
    console.log("CALENDAR DEBUG", {
      experience,
      selectedDate,
      dateFrom,
      dateTo,
      activeDateISO,
      closed: [...closedSet],
    });

    return { closedSet, intervals };
  }, [api, activeDateISO, experience, selectedDate, dateFrom, dateTo]);

  const isClosedAllDay = useMemo(
    () => closedSet.has(activeDateISO),
    [closedSet, activeDateISO]
  );

  const availability = useMemo(() => {

  const slot = SLOT;

  const isValidMonth = !!monthKeyFromDateISO(activeDateISO);
  const isDayClosed = closedSet.has(activeDateISO);
  const allDayBlocked = intervals.some(([s, e]) => (s <= 0 && e >= 24 * 60) || (s <= 0 && e >= 1440));

  const dayBlocked =
    !isValidMonth || isDayClosed || allDayBlocked || (slot.day ? isSlotBlocked(intervals, slot.day) : false);

  const halfAMBlocked =
    !isValidMonth || isDayClosed || allDayBlocked || (slot.half_am ? isSlotBlocked(intervals, slot.half_am) : false);

  const halfPMBlocked =
    !isValidMonth || isDayClosed || allDayBlocked || (slot.half_pm ? isSlotBlocked(intervals, slot.half_pm) : false);

  const sunsetBlocked =
    !isValidMonth || isDayClosed || allDayBlocked || (slot.sunset ? isSlotBlocked(intervals, slot.sunset) : false);

  // Overnight: bloccato se activeDateISO chiuso O fuori stagione O range contiene giorni chiusi
  let overnightBlocked = isDayClosed || !isValidMonth;

  if (!overnightBlocked) {
    const overnightBasePrice = priceForExperience2026("overnight", dateFrom || activeDateISO);
    if (!overnightBasePrice) {
      overnightBlocked = true;
    } else {
      try {
        if (dateFrom) {
          const start = new Date(dateFrom + "T00:00:00");
          const end =
            dateTo && compareISO(dateTo, dateFrom) >= 0
              ? new Date(dateTo + "T00:00:00")
              : start;

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const iso = safeISO(d, TZ);
            if (closedSet.has(iso)) {
              overnightBlocked = true;
              break;
            }
          }
        }
      } catch {
        overnightBlocked = true;
      }
    }
  }

  return {
    dayBlocked,
    halfAMBlocked,
    halfPMBlocked,
    sunsetBlocked,
    overnightBlocked,
  };
}, [intervals, closedSet, dateFrom, dateTo, activeDateISO]);




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

  const experienceStyles: Record<ExperienceId, { base: string; normal: string; selected: string; icon: string }> = {
    half_am: {
      base: "w-full border rounded-2xl",
      normal: "bg-white border-slate-200 text-slate-900",
      selected: "bg-blue-200 border-blue-500 text-blue-900 ring-blue-200 ring-2 shadow-md",
      icon: "text-blue-700",
    },
    half_pm: {
      base: "w-full border rounded-2xl",
      normal: "bg-white border-slate-200 text-slate-900",
      selected: "bg-blue-200 border-blue-500 text-blue-900 ring-blue-200 ring-2 shadow-md",
      icon: "text-blue-700",
    },
    day: {
      base: "w-full border rounded-2xl",
      normal: "bg-white border-slate-200 text-slate-900",
      selected: "bg-rose-200 border-rose-400 text-rose-900 ring-rose-200 ring-2 shadow-md",
      icon: "text-rose-700",
    },
    sunset: {
      base: "w-full border rounded-2xl",
      normal: "bg-white border-slate-200 text-slate-900",
      selected: "bg-amber-200 border-amber-400 text-amber-900 ring-amber-200 ring-2 shadow-md",
      icon: "text-amber-700",
    },
    overnight: {
      base: "w-full border rounded-2xl",
      normal: "bg-white border-slate-200 text-slate-900",
      selected: "bg-green-200 border-green-400 text-green-900 ring-green-200 ring-2 shadow-md",
      icon: "text-green-700",
    },
  };

  const expIcon: Record<ExperienceId, React.ComponentType<any>> = {
    half_am: Sunrise,
    half_pm: Sunset,
    day: Anchor,
    sunset: Sunset,
    overnight: Moon,
  };

  const selectedIntervalLabel = useMemo(() => {
    const it = SLOT[experience];
    if (experience === "overnight") {
      const nights =
        compareISO(dateTo, dateFrom) <= 0 ? 1 : daysBetweenISO(dateFrom, dateTo);
      return `${dateFrom} → ${dateTo} • ${t.nights}: ${nights} • ${t.days}: ${overnightDays}`;
    }
    if (!it) return "";
    return `${selectedDate} • ${formatInterval(it)} (${TZ})`;
  }, [experience, selectedDate, dateFrom, dateTo, t.nights, t.days, overnightDays]);

  // Summary for WhatsApp + Stripe metadata
  const summaryText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`${t.title}`);
    lines.push(`${t.summary}:`);

    if (clientName.trim()) lines.push(`• ${t.clientName}: ${clientName.trim()}`);
    if (clientNote.trim()) lines.push(`• ${t.clientNote}: ${clientNote.trim()}`);

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

    lines.push(`• Base: ${euro(basePrice)}`);
    lines.push(`• ${t.fixedCosts}: ${euro(fixedTotal)}`);
    lines.push(`• ${t.extras}: ${euro(extrasTotal)}`);
    lines.push(`• ${t.total}: ${euro(grandTotal)}`);

    return lines.join("\n");
  }, [
    t,
    clientName,
    clientNote,
    experience,
    selectedIntervalLabel,
    people,
    basePrice,
    fixedTotal,
    extrasTotal,
    grandTotal,
  ]);

  const whatsappHref = useMemo(() => {
    const encoded = encodeURIComponent(summaryText);
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`;
  }, [summaryText]);

  // ✅ canPay stabile + motivo
  const blockedReason = useMemo(() => {
    if (payLoading) return "Pagamento in corso…";
    if (people < 1 || people > MAX_PEOPLE) return "Numero persone non valido";
    if (!(grandTotal > 0)) return "Totale non valido";

    // Prezzi solo Apr–Ott
    if (experience === "overnight") {
      if (!monthKeyFromDateISO(dateFrom)) return "Prezzi Overnight disponibili solo Apr–Ott";
    } else {
      if (!monthKeyFromDateISO(selectedDate)) return "Prezzi disponibili solo Apr–Ott";
    }

    if (experience === "overnight") {
      if (!dateFrom || !dateTo) return "Seleziona date valide";
      if (compareISO(dateTo, dateFrom) < 0) return "Intervallo date non valido";
      return "";
    }

    if (!selectedDate || selectedDate.length !== 10) return "Seleziona una data valida";

    if (experience === "half_am" && availability.halfAMBlocked) return "Mezza giornata mattina non disponibile";
    if (experience === "half_pm" && availability.halfPMBlocked) return "Mezza giornata pomeriggio non disponibile";
    if (experience === "day" && availability.dayBlocked) return "Day charter non disponibile";
    if (experience === "sunset" && availability.sunsetBlocked) return "Sunset non disponibile";

    return "";
  }, [
    payLoading,
    people,
    grandTotal,
    experience,
    selectedDate,
    dateFrom,
    dateTo,
    availability.halfAMBlocked,
    availability.halfPMBlocked,
    availability.dayBlocked,
    availability.sunsetBlocked,
  ]);

  const canPay = blockedReason === "";

  async function handlePay() {
    setPayError("");
    setPayLoading(true);
    try {
      const payload = {
        experience,
        selectedDate,
        dateFrom,
        dateTo,
        people: Math.max(1, Math.min(MAX_PEOPLE, people)),
        amount: grandTotal,
        extras: {
          seabobQty,
          towelQty,
          drinksPack,
          catering,
        },
        clientName: clientName.trim(),
        clientNote: clientNote.trim(),
        summaryText,
      };

      const res = await fetch("/api/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as StripeResponse;

      if (!data.ok || !data.url) {
        throw new Error(data.error || "Stripe error");
      }

      window.location.href = data.url;
    } catch (e: any) {
      setPayError(String(e?.message || e));
    } finally {
      setPayLoading(false);
    }
  }

  // ✅ CLICK SEMPRE (anche se canPay false)
  const onPayClick = async () => {
    console.log("CLICK PAY", {
      canPay,
      blockedReason,
      experience,
      selectedDate,
      dateFrom,
      dateTo,
      people,
      grandTotal,
    });

    if (!canPay) {
      setPayError(blockedReason || "Pagamento non disponibile");
      return;
    }

    await handlePay();
  };

  const currentHero = HERO_IMAGES[heroIdx] || HERO_IMAGES[0];
  const currentBroken = broken[heroIdx];

  return (
    <main className="w-full max-w-full overflow-x-hidden min-h-[100dvh] md:min-h-screen bg-gradient-to-b from-sky-600 via-sky-500 to-sky-200">
      {/* HERO */}
      <section className="relative">


        <div className="relative h-[420px] sm:h-[520px] overflow-hidden bg-slate-900">
                   {!currentBroken ? (
            <img
              src={currentHero}
              alt="hero"
              className="h-full w-full object-cover pointer-events-none select-none"
              loading="eager"
              decoding="async"
              onError={() => setBroken((m) => ({ ...m, [heroIdx]: true }))}
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-white/90 font-extrabold pointer-events-none select-none">
              {t.photoMissing}: {currentHero}
            </div>
          )}

          <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-black/55 via-black/30 to-black/10" />

                    <div className="absolute left-0 right-0 top-0 z-[9999] px-4 pt-4 pointer-events-auto">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
              <div className="rounded-2xl bg-white/15 px-4 py-2 text-sm font-extrabold text-white backdrop-blur border border-white/20">
                {t.brand}
              </div>

              <div className="relative pointer-events-auto">
                <button
                  ref={langButtonRef}
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setLangMenuOpen((s) => !s);
                  }}
                  aria-haspopup="true"
                  aria-expanded={langMenuOpen}
                  className="bg-transparent text-white font-extrabold outline-none flex items-center gap-2 px-3 py-2 pointer-events-auto cursor-pointer"

                >
                  {lang === "es"
                    ? "🇪🇸"
                    : lang === "en"
                    ? "🇬🇧"
                    : lang === "it"
                    ? "🇮🇹"
                    : lang === "fr"
                    ? "🇫🇷"
                    : lang === "de"
                    ? "🇩🇪"
                    : "🇷🇺"}
                  <span className="hidden sm:inline">
                    {I18N[lang]?.langLabel ?? lang}
                  </span>
                </button>

                {langMenuOpen && (
                  <div
                    ref={langMenuRef}
                    className="absolute right-0 mt-2 w-44 rounded-xl bg-white text-slate-900 shadow-lg border border-slate-200 pointer-events-auto"
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 cursor-pointer"

                      onClick={() => {
                        setLang("es");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇪🇸 Español
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setLang("en");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇬🇧 English
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setLang("it");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇮🇹 Italiano
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setLang("fr");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇫🇷 Français
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setLang("de");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇩🇪 Deutsch
                    </button>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      onClick={() => {
                        setLang("ru");
                        setLangMenuOpen(false);
                      }}
                    >
                      🇷🇺 Русский
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>



                    <div className="absolute inset-0 z-10 flex items-end px-4 pb-8 pointer-events-none">
            <div className="mx-auto w-full max-w-6xl pointer-events-none">

              <div className="max-w-3xl">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.55)]">
                  {t.title}
                </h1>
                <p className="mt-2 text-lg sm:text-xl font-bold text-white/90 drop-shadow-[0_2px_14px_rgba(0,0,0,0.55)]">
                  {t.subtitle}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-extrabold text-white backdrop-blur border border-white/20">
                  {t.seasonLabel} {seasonLabel}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <div className="flex gap-2">
                  {HERO_IMAGES.map((src, i) => (
                    <button
                      key={src + i}
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

              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {HERO_IMAGES.map((src, i) => {
                  const isB = !!broken[i];
                  return (
                    <button
                      key={src + "-thumb-" + i}
                      type="button"
                      onClick={() => setHeroIdx(i)}
                      className={[
                        "h-12 w-16 shrink-0 rounded-xl overflow-hidden border",
                        i === heroIdx ? "border-white" : "border-white/30",
                      ].join(" ")}
                      title={src}
                    >
                      {!isB ? (
                        <img
                          src={src}
                          alt={`thumb-${i}`}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          onError={() => setBroken((m) => ({ ...m, [i]: true }))}
                        />
                      ) : (
                        <div className="h-full w-full bg-black/40 text-white text-[10px] font-extrabold flex items-center justify-center px-1">
                          {t.photoMissing}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CONTENT */}
      <section className="px-4 py-8 sm:py-10">
        <div className="mx-auto max-w-6xl grid gap-5 lg:grid-cols-3">
          {/* LEFT */}
          <div className="lg:col-span-2 grid gap-5">
            <Card
              title={t.selectDate}
              right={
                <div className="text-sm font-extrabold text-slate-700">
                  {loadingAvail ? t.loading : "✓"}
                </div>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {experience !== "overnight" ? (
                  <>
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
                  </>
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

                <label className={experience === "overnight" ? "block sm:col-span-2" : "block"}>
                  <div className="text-xs font-extrabold text-slate-600 mb-1">
                    {t.people} (max {MAX_PEOPLE})
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={1}
                    max={MAX_PEOPLE}
                    value={peopleInput}
                    onChange={(e) => {
                      const v = e.currentTarget.value;
                      // Allow empty while the user clears the field, or only digits (no immediate clamping)
                      if (v === "" || /^\d{0,2}$/.test(v)) {
                        setPeopleInput(v);
                      }
                    }}
                    onBlur={() => {
                      let n = parseInt(peopleInput, 10);
                      if (Number.isNaN(n) || n < 1) n = 1;
                      if (n > MAX_PEOPLE) n = MAX_PEOPLE;
                      setPeople(n);
                      setPeopleInput(String(n));
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        let n = parseInt(peopleInput, 10);
                        if (Number.isNaN(n) || n < 1) n = 1;
                        if (n > MAX_PEOPLE) n = MAX_PEOPLE;
                        setPeople(n);
                        setPeopleInput(String(n));
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none"
                  />
                </label>
              </div>

              {experience !== "overnight" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Pill ok={!availability.halfAMBlocked} label={`${t.exp_half_am} ${t.half_am_sub}`} />
                  <Pill ok={!availability.halfPMBlocked} label={`${t.exp_half_pm} ${t.half_pm_sub}`} />
                  <Pill ok={!availability.dayBlocked} label={`${t.exp_day} ${t.day_sub}`} />
                  <Pill ok={!availability.sunsetBlocked} label={`${t.exp_sunset} ${t.sunset_sub}`} />
                </div>
              )}
            </Card>

            <Card title={t.experiences}>
              <div className="grid gap-4 sm:grid-cols-2">
                {expDefs.map((exp) => {
                  let price = 0;
                  let overnightDaysDisplay = 0;
                  
                  if (exp.id === "overnight") {
                    const mk = monthKeyFromDateISO(dateFrom || activeDateISO);
                    if (mk) {
                      let daysRange = 2;
                      if (dateFrom && dateTo && compareISO(dateTo, dateFrom) > 0) {
                        daysRange = daysBetweenISO(dateFrom, dateTo);
                      }
                      const daysClamped = Math.max(2, Math.min(7, daysRange));
                      price = OVERNIGHT_MULTIDAY[mk]?.[daysClamped] || 0;
                      overnightDaysDisplay = daysClamped;
                    }
                  } else {
                    price = priceForExperience2026(exp.id, selectedDate);
                  }

                  const isSelected = experience === exp.id;
                  const disabled = exp.blocked;

                  const styles = experienceStyles[exp.id];
                  const Icon = expIcon[exp.id];

                  const baseClass = styles.base + " transition-all duration-200 relative";
                  const normalClass = styles.normal;
                  const selectedClass = styles.selected;

                  return (
                    <button
                      key={exp.id}
                      type="button"
                      onClick={() => {
                        if (exp.blocked) return;
                        setExperience(exp.id);
                      }}
                      disabled={disabled}
                      aria-disabled={disabled}
                      className={`${baseClass} ${isSelected ? selectedClass : normalClass} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:shadow-lg"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="shrink-0 flex items-center justify-center">
                            <Icon className={["h-9 w-9", styles.icon, isSelected ? "" : ""].join(" ")} />
                          </div>
                          <div className="min-w-0">
                            <div className={"text-lg font-black truncate"}>{exp.title}</div>
                            <div className={"mt-1 text-sm font-extrabold truncate"}>{exp.sub}</div>
                            <div className={"mt-2 text-xs font-extrabold"}>{disabled ? t.notAvailable : t.available}</div>
                          </div>
                        </div>

                        <div className="text-right min-w-0 flex-shrink-0 pr-12 md:pr-0">
                          <div className="text-xs font-extrabold">{t.dateFrom}</div>

                          {exp.id === "overnight" ? (
                            <div className="text-right">
                              <div className="text-lg font-black leading-tight break-words">{euro(price)}</div>
                              <div className="text-xs font-extrabold">
                                {overnightDaysDisplay} {t.days}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xl font-black">{euro(price)}</div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                <div className="rounded-2xl border px-5 py-5 bg-violet-100 border-violet-200 text-violet-900">
                  <div className="text-lg font-black">Incluso nel pernottamento (gratis)</div>
                  <ul className="mt-2 text-sm font-extrabold list-disc pl-5 space-y-1">
                    <li>Lenzuola</li>
                    <li>Asciugamani</li>
                    <li>Maschere + boccagli</li>
                    <li>SUP / Paddle</li>
                    <li>Dinghy</li>
                  </ul>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-sky-50 px-4 py-3">
                <div className="text-xs font-extrabold text-slate-600">{t.summary}</div>
                <div className="mt-1 text-sm font-black text-slate-900">{selectedIntervalLabel}</div>
              </div>
            </Card>

            <Card title={t.requestTitle}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <div className="text-xs font-extrabold text-slate-600 mb-1">
                    {t.clientNote}
                  </div>
                  <textarea
                    placeholder={"Allergie, preferenze, richieste speciali..."}
                    value={clientNote}
                    onChange={(e) => setClientNote(e.currentTarget.value)}
                    className="w-full min-h-[160px] rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-extrabold text-slate-900 outline-none resize-vertical"
                  />
                </label>
              </div>
            </Card>
          </div>

          {/* RIGHT */}
          <div className="grid gap-5">
            <Card title={t.fixedCosts}>
              <div className="space-y-3">
                {fixedItems.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3"
                  >
                    <div className="text-sm font-extrabold text-slate-800">{c.label}</div>
                    <div className="text-sm font-black text-slate-900">{euro(c.price || 0)}</div>
                  </div>
                ))}

                {experience === "overnight" && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                    <div className="text-sm font-black text-slate-900">{t.fuel_multiday_note_title}</div>
                    <div className="mt-1 text-xs font-extrabold text-slate-700">
                      {t.fuel_multiday_note_body.replace(
                        "{x}",
                        euro(FIXED_RULES.fuel_multiday_info_per_hour)
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-sky-100 bg-sky-50 px-4 py-3">
                  <div className="text-sm font-extrabold text-slate-800">{t.fixed_total_label}</div>
                  <div className="text-sm font-black text-slate-900">{euro(fixedTotal)}</div>
                </div>
              </div>
            </Card>

            <Card title={t.extras}>
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">{t.extra_seabob}</div>
                      <div className="text-xs font-extrabold text-slate-600">
                        {euro(EXTRA_PRICES.seabob)} / cad.
                      </div>
                    </div>
                    <Qty value={seabobQty} onChange={setSeabobQty} />
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black text-slate-900">{t.extra_towel}</div>
                      <div className="text-xs font-extrabold text-slate-600">
                        {euro(EXTRA_PRICES.towel)} / telo
                      </div>
                    </div>
                    <Qty value={towelQty} onChange={setTowelQty} />
                  </div>
                </div>

                <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-black text-slate-900">{t.extra_drinks}</div>
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

                <label className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-black text-slate-900">{t.extra_catering}</div>
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
                  <div className="text-sm font-extrabold text-slate-800">Totale extra</div>
                  <div className="text-sm font-black text-slate-900">{euro(extrasTotal)}</div>
                </div>

                <div className="rounded-xl border px-4 py-4 bg-violet-100 border-violet-200 text-violet-900">
                  <div className="text-sm font-black">{t.includedFree}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full bg-violet-200 border border-violet-300 px-3 py-1 text-xs font-extrabold text-violet-900">
                      ✅ {t.free_sup}
                    </span>
                    <span className="rounded-full bg-violet-200 border border-violet-300 px-3 py-1 text-xs font-extrabold text-violet-900">
                      ✅ {t.free_snorkel}
                    </span>
                    <span className="rounded-full bg-violet-200 border border-violet-300 px-3 py-1 text-xs font-extrabold text-violet-900">
                      ✅ {t.free_dinghy}
                    </span>
                  </div>
                </div>
              </div>
            </Card>

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
                  <div className="text-xs font-extrabold text-slate-600">{t.summary}</div>
                  <pre className="mt-2 whitespace-pre-wrap text-xs font-extrabold text-slate-800 leading-relaxed">
                    {summaryText}
                  </pre>
                </div>

                {payError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-extrabold text-red-700">
                    {t.stripeError}
                    {payError}
                  </div>
                ) : null}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <a
                    href={whatsappHref}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-2xl bg-green-500 hover:bg-green-600 text-white border border-white/20 px-4 py-4 text-center font-black shadow-[0_14px_36px_rgba(0,0,0,0.18)] transition"
                  >
                    {t.bookWhatsapp}
                  </a>

                  <button
                    type="button"
                    onClick={onPayClick}
                    disabled={payLoading} // ✅ solo per evitare doppio click
                    className={[
                      "rounded-2xl px-4 py-4 text-center font-black shadow-[0_14px_36px_rgba(0,0,0,0.18)] transition",
                      !canPay || payLoading
                        ? "bg-slate-400 text-white/90 cursor-not-allowed"
                        : "bg-sky-700 text-white cursor-pointer hover:shadow-[0_18px_44px_rgba(0,0,0,0.22)]",

                    ].join(" ")}
                    aria-disabled={!canPay || payLoading}
                    title={!canPay ? blockedReason : ""}
                  >
                    {payLoading ? t.stripeStarting : t.payNow}
                  </button>
                </div>

                <div className="mt-3 text-xs font-extrabold text-white/90 bg-black/20 border border-white/20 rounded-xl px-4 py-3">
                  {t.multiday_footer_note}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <footer className="px-4 pb-10">
        <div className="mx-auto max-w-6xl text-center text-xs font-extrabold text-white/90">
          © {t.brand} · {TZ}
        </div>
      </footer>
    </main>
  );
}

