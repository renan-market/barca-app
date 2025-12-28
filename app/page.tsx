import Link from "next/link";

const PRICES = {
  day: 0, // TODO: metti prezzo DAY
  halfday: 0, // TODO: metti prezzo MEZZA GIORNATA
  sunset: 0, // TODO: metti prezzo SUNSET
  night: 0, // TODO: metti prezzo NOTTE (per pernottamento)
};

function euro(n: number) {
  if (!n) return "€___";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

type CardProps = {
  title: string;
  subtitle: string;
  price: string;
};

function ExperienceCard({ title, subtitle, price }: CardProps) {
  return (
    <div
      className={[
        "group block rounded-2xl border border-gray-300 bg-white",
        "p-5 sm:p-6",
        "shadow-[0_10px_28px_rgba(0,0,0,0.08)]",
        "hover:shadow-[0_14px_34px_rgba(0,0,0,0.12)]",
        "active:scale-[0.99] transition",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {/* Titolo: molto leggibile su mobile */}
          <h2 className="text-xl sm:text-lg font-extrabold text-black leading-tight">
            {title}
          </h2>

          {/* Sottotitolo: niente più grigio slavato */}
          <p className="mt-1 text-base sm:text-sm font-semibold text-gray-900/90 leading-snug">
            {subtitle}
          </p>
        </div>

        {/* Prezzo: forte e chiaro */}
        <div className="shrink-0 text-right">
          <div className="text-xs font-bold text-gray-700">Da</div>
          <div className="text-lg sm:text-base font-extrabold text-black">
            {price}
          </div>
        </div>
      </div>

      {/* Piccola riga di “call to action” */}
      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-sm font-bold text-gray-900">
        Prenota / Richiedi su WhatsApp <span aria-hidden>›</span>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-white to-gray-50 text-gray-900 px-5 py-10">
      <div className="max-w-3xl mx-auto text-center">
        {/* Header più leggibile su mobile */}
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-black">
          Lagoon 380 · Ibiza
        </h1>
        <p className="mt-2 text-lg sm:text-base font-semibold text-gray-900/80">
          Esperienze private in catamarano
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          <Link href="/prenota" className="block">
            <ExperienceCard
              title="Day Charter"
              subtitle="10:00 – 18:00 (senza notte)"
              price={euro(PRICES.day)}
            />
          </Link>

          <Link href="/prenota" className="block">
            <ExperienceCard
              title="Mezza giornata"
              subtitle="4 ore (senza notte)"
              price={euro(PRICES.halfday)}
            />
          </Link>

          <Link href="/prenota" className="block">
            <ExperienceCard
              title="Sunset"
              subtitle="Tramonto (senza notte)"
              price={euro(PRICES.sunset)}
            />
          </Link>

          <Link href="/prenota" className="block">
            <ExperienceCard
              title="Pernottamento"
              subtitle="Multi-day (Date Da / A)"
              price={`${euro(PRICES.night)}/notte`}
            />
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_10px_26px_rgba(0,0,0,0.06)]">
          <p className="text-base font-semibold text-gray-900">
            Richiesta su WhatsApp
          </p>
          <p className="mt-1 text-sm font-medium text-gray-700">
            Non è una prenotazione automatica: verifichiamo disponibilità e ti
            rispondiamo.
          </p>
        </div>
      </div>
    </main>
  );
}
