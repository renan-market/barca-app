import Link from "next/link";

const PRICES = {
  day: 0, // TODO: metti prezzo DAY
  halfday: 0, // TODO: metti prezzo MEZZA GIORNATA
  sunset: 0, // TODO: metti prezzo SUNSET
  night: 0, // TODO: metti prezzo NOTTE (per pernottamento)
};

function euro(n: number) {
  if (!n) return "€___";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n);
}

export default function Page() {
  return (
    <main className="min-h-screen bg-white text-gray-900 px-6 py-12">
      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-extrabold mb-3">Lagoon 380 · Ibiza</h1>
        <p className="text-gray-600 mb-8">Esperienze private in catamarano</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          <Link
            href="/prenota"
            className="group block border rounded-xl p-6 shadow-sm hover:shadow-lg transition-colors bg-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Day Charter</h2>
                <p className="text-sm text-gray-600">10:00 – 18:00 (senza notte)</p>
              </div>
              <div className="text-right text-gray-800 font-medium">Da {euro(PRICES.day)}</div>
            </div>
          </Link>

          <Link
            href="/prenota"
            className="group block border rounded-xl p-6 shadow-sm hover:shadow-lg transition-colors bg-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Mezza giornata</h2>
                <p className="text-sm text-gray-600">4 ore (senza notte)</p>
              </div>
              <div className="text-right text-gray-800 font-medium">Da {euro(PRICES.halfday)}</div>
            </div>
          </Link>

          <Link
            href="/prenota"
            className="group block border rounded-xl p-6 shadow-sm hover:shadow-lg transition-colors bg-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Sunset</h2>
                <p className="text-sm text-gray-600">Tramonto (senza notte)</p>
              </div>
              <div className="text-right text-gray-800 font-medium">Da {euro(PRICES.sunset)}</div>
            </div>
          </Link>

          <Link
            href="/prenota"
            className="group block border rounded-xl p-6 shadow-sm hover:shadow-lg transition-colors bg-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Pernottamento</h2>
                <p className="text-sm text-gray-600">Multi-day (Date Da / A)</p>
              </div>
              <div className="text-right text-gray-800 font-medium">Da {euro(PRICES.night)}/notte</div>
            </div>
          </Link>
        </div>

        <p className="text-sm text-gray-500">Richiesta su WhatsApp (non è prenotazione automatica)</p>
      </div>
    </main>
  );
}
