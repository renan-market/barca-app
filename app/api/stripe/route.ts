import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
if (!STRIPE_SECRET_KEY) {
  console.error("Missing STRIPE_SECRET_KEY");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2024-06-20",
});

type ExperienceId = "half_am" | "half_pm" | "day" | "sunset" | "overnight";
type Season = "low" | "mid" | "high";

const TZ = "Europe/Madrid";
const MAX_PEOPLE = 12;

const SEASON_PRICES: Record<
  Season,
  { day: number; halfday: number; sunset: number; night: number }
> = {
  low: { day: 650, halfday: 450, sunset: 420, night: 350 },
  mid: { day: 850, halfday: 600, sunset: 520, night: 450 },
  high: { day: 1100, halfday: 780, sunset: 650, night: 600 },
};

const FIXED_RULES = {
  skipper_per_day: 170,
  fuel_halfday_day_sunset: 40,
  cleaning: 50,
};

const EXTRA_PRICES = {
  seabob: 650,
  catering_pp: 25,
  drinks_pack: 150,
  towel: 15,
};

function seasonFromDateISO(dateISO: string): Season {
  const m = Number(dateISO.slice(5, 7));
  if (m === 11 || m === 12 || m === 1 || m === 2 || m === 3) return "low";
  if (m === 4 || m === 5 || m === 10) return "mid";
  return "high";
}

function compareISO(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function daysBetweenISO(fromISO: string, toISO: string) {
  const a = new Date(`${fromISO}T00:00:00`);
  const b = new Date(`${toISO}T00:00:00`);
  const diff = b.getTime() - a.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(1, days || 0);
}

function calcTotals(input: {
  experience: ExperienceId;
  selectedDate: string;
  dateFrom: string;
  dateTo: string;
  people: number;
  extras: { seabobQty: number; towelQty: number; drinksPack: boolean; catering: boolean };
}) {
  const people = Math.max(1, Math.min(MAX_PEOPLE, Number(input.people || 1)));

  const season = seasonFromDateISO(input.selectedDate);
  const p = SEASON_PRICES[season];

  let base = 0;
  let nights = 0;
  let days = 1;

  if (input.experience === "day") base = p.day;
  else if (input.experience === "half_am" || input.experience === "half_pm") base = p.halfday;
  else if (input.experience === "sunset") base = p.sunset;
  else {
    // overnight
    nights = compareISO(input.dateTo, input.dateFrom) <= 0 ? 1 : daysBetweenISO(input.dateFrom, input.dateTo);
    days = compareISO(input.dateTo, input.dateFrom) <= 0 ? 1 : daysBetweenISO(input.dateFrom, input.dateTo);
    base = p.night * nights;
  }

  const skipper = input.experience === "overnight" ? FIXED_RULES.skipper_per_day * days : FIXED_RULES.skipper_per_day;
  const fuel = input.experience === "overnight" ? 0 : FIXED_RULES.fuel_halfday_day_sunset;
  const cleaning = FIXED_RULES.cleaning;
  const fixed = skipper + fuel + cleaning;

  const seabob = Math.max(0, Number(input.extras.seabobQty || 0)) * EXTRA_PRICES.seabob;
  const towel = Math.max(0, Number(input.extras.towelQty || 0)) * EXTRA_PRICES.towel;
  const drinks = input.extras.drinksPack ? EXTRA_PRICES.drinks_pack : 0;
  const catering = input.extras.catering ? people * EXTRA_PRICES.catering_pp : 0;

  const extras = seabob + towel + drinks + catering;

  return {
    season,
    people,
    nights,
    days,
    base,
    fixed,
    extras,
    total: base + fixed + extras,
  };
}

export async function POST(req: Request) {
  try {
    if (!STRIPE_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Missing STRIPE_SECRET_KEY" }, { status: 500 });
    }

    const origin =
      req.headers.get("origin") ||
      "https://barca-app.vercel.app";

    const body = await req.json();

    const experience: ExperienceId = body.experience;
    const selectedDate: string = body.selectedDate;
    const dateFrom: string = body.dateFrom;
    const dateTo: string = body.dateTo;
    const people: number = Number(body.people || 1);

    const clientName: string = String(body.clientName || "").slice(0, 100);
    const clientNote: string = String(body.clientNote || "").slice(0, 500);

    const extras = {
      seabobQty: Number(body.extras?.seabobQty || 0),
      towelQty: Number(body.extras?.towelQty || 0),
      drinksPack: !!body.extras?.drinksPack,
      catering: !!body.extras?.catering,
    };

    // ✅ calcolo server-side (anti-manomissione)
    const totals = calcTotals({
      experience,
      selectedDate,
      dateFrom,
      dateTo,
      people,
      extras,
    });

    const amountCents = Math.round(totals.total * 100);

    // success/cancel sulla HOME (no nuove pagine)
    const successUrl = `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/?stripe=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: successUrl,
      cancel_url: cancelUrl,
      payment_method_types: ["card"],
      locale: "it",

      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: amountCents,
            product_data: {
              name: "BluHorizonte Booking",
              description: `${experience} • ${selectedDate} • ${TZ}`,
            },
          },
        },
      ],

      metadata: {
        experience,
        selectedDate,
        dateFrom,
        dateTo,
        people: String(totals.people),
        season: totals.season,
        nights: String(totals.nights),
        days: String(totals.days),
        clientName,
        clientNote,

        seabobQty: String(extras.seabobQty),
        towelQty: String(extras.towelQty),
        drinksPack: String(extras.drinksPack),
        catering: String(extras.catering),
      },
    });

    return NextResponse.json({ ok: true, url: session.url }, { status: 200 });
  } catch (err: any) {
    const msg = typeof err?.message === "string" ? err.message : "Unknown Stripe error";
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
