import { NextResponse } from "next/server";
import Stripe from "stripe";

export const runtime = "nodejs";

type StripeOk = { ok: true; url: string };
type StripeErr = { ok: false; error: string };

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      return NextResponse.json<StripeErr>(
        { ok: false, error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    const stripe = new Stripe(stripeKey);

    const body = await req.json();

    const amountEuro = Number(body.amount ?? 0);
    const unitAmount = Math.round(amountEuro * 100);

    if (!unitAmount || unitAmount < 50) {
      return NextResponse.json<StripeErr>(
        { ok: false, error: "Invalid amount: minimum is €0.50" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: { name: "BluHorizonte Booking" },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: "http://localhost:3000?success=1",
      cancel_url: "http://localhost:3000?cancel=1",
      metadata: {
        experience: String(body.experience ?? ""),
        selectedDate: String(body.selectedDate ?? ""),
        dateFrom: String(body.dateFrom ?? ""),
        dateTo: String(body.dateTo ?? ""),
        people: String(body.people ?? ""),
        clientName: String(body.clientName ?? ""),
        clientNote: String(body.clientNote ?? ""),
      },
    });

    return NextResponse.json<StripeOk>({ ok: true, url: session.url! });
  } catch (err: any) {
    return NextResponse.json<StripeErr>(
      { ok: false, error: err?.message || "Stripe error" },
      { status: 500 }
    );
  }
}
