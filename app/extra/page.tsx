"use client";

import { useMemo, useState } from "react";

const WHATSAPP_NUMBER = "393398864884"; // senza + e senza spazi

const BOAT = {
  name: "Lagoon 380",
  location: "Ibiza",
};

type ExtraKey =
  | "skipper"
  | "hostess"
  | "catering"
  | "sup"
  | "seabob"
  | "transfer"
  | "drone"
  | "decor"
  | "porto"
  | "orario";

const EXTRAS: { key: ExtraKey; label: string; hint: string }[] = [
  { key: "skipper", label: "Skipper", hint: "Skipper professionista" },
  { key: "hostess", label: "Hostess", hint: "Servizio hostess a bordo" },
  { key: "catering", label: "Catering", hint: "Pranzo / tapas / bevande" },
  { key: "sup", label: "SUP", hint: "Stand Up Paddle" },
  { key: "seabob", label: "Seabob", hint: "Seabob / water toys" },
  { key: "transfer", label: "Transfer", hint: "Trasferimento / taxi" },
  { key: "drone", label: "Foto/Drone", hint: "Foto professionali / drone" },
  { key: "decor", label: "Decorazioni", hint: "Proposal / compleanno" },
  { key: "porto", label: "Porto diverso", hint: "Imbarco/sbarco diverso" },
  { key: "orario", label: "Orario diverso", hint: "Orari speciali (early/late)" },
];

function toISODateInputValue(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function ExtraPage() {
  const today = useMemo(() => new Date(), []);
  const [date, setDate] = useState<string>(() => toISODateInputValue(today));
  const [people, setPeople] = useState<number>(4);
  const [name, setName] = useState<string>("");
  const [message, setMessage] = useState<string>("");

  const [selectedExtras, setSelectedExtras] = useState<Record<ExtraKey, boolean>>(() => {
    const init: any = {};
    EXTRAS.forEach((e) => (init[e.key] = false));
    return init;
  });

  const selectedList = useMemo(() => {
    return EXTRAS.filter((e) => selectedExtras[e.key]).map((e) => e.label);
  }, [selectedExtras]);

  const whatsappText = useMemo(() => {
    const lines: string[] = [];
    lines.push(`Ciao! Vorrei una *richiesta personalizzata* per ${BOAT.name} (${BOAT.location}).`);
    lines.push("");
    lines.push(`*Data:* ${date}`);
    lines.push(`*Persone:* ${people}`);

    if (selectedList.length) {
      lines.push(`*Extra richiesti:* ${selectedList.join(", ")}`);
    } else {
      lines.push(`*Extra richiesti:* (da definire)`);
    }

    if (name.trim()) lines.push(`*Nome:* ${name.trim()}`);
    if (message.trim()) lines.push(`*Dettagli:* ${message.trim()}`);

    lines.push("");
    lines.push("Grazie! 🙏");

    return encodeURIComponent(lines.join("\n"));
  }, [date, people, selectedList, name, message]);

  const whatsappLink = `https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappText}`;

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-500 via-cyan-500 to-indigo-700">
      <div className="mx-auto max-w-md px-4 pt-6 pb-24">
        <div className="rounded-[28px] bg-white/15 backdrop-blur-md border border-white/25 shadow-[0_20px_60px_rgba(0,0,0,0.18)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-white drop-shadow-sm">Extra & Richiesta su misura</h1>
              <p className="text-white/85 mt-1">
                Seleziona gli extra e inviaci la richiesta su WhatsApp. Ti rispondiamo con disponibilità e preventivo.
              </p>
            </div>
            <a
              href="/prenota"
              className="shrink-0 rounded-full bg-white/80 text-gray-900 px-3 py-2 text-xs font-bold border border-white/60"
            >
              ← Prenota
            </a>
          </div>

          <div className="mt-5 rounded-[28px] bg-white/95 border border-white shadow-[0_10px_30px_rgba(0,0,0,0.12)] overflow-hidden">
            <div className="h-2 bg-gradient-to-r from-sky-400 via-cyan-300 to-indigo-400" />

            <div className="p-5 space-y-5">
              <section className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold text-gray-900">Data</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
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

              <section>
                <h2 className="text-sm font-semibold text-gray-900 mb-2">Seleziona extra</h2>
                <div className="grid grid-cols-2 gap-3">
                  {EXTRAS.map((ex) => {
                    const active = selectedExtras[ex.key];
                    return (
                      <button
                        key={ex.key}
                        type="button"
                        onClick={() => setSelectedExtras((prev) => ({ ...prev, [ex.key]: !prev[ex.key] }))}
                        className={[
                          "text-left rounded-2xl border p-3 transition",
                          "shadow-[0_6px_16px_rgba(0,0,0,0.06)]",
                          active
                            ? "border-transparent ring-2 ring-sky-200 bg-gradient-to-b from-white to-sky-50"
                            : "border-gray-200 bg-white hover:border-gray-300",
                        ].join(" ")}
                      >
                        <div className="font-semibold">{ex.label}</div>
                        <div className="text-xs text-gray-600 mt-1">{ex.hint}</div>
                        <div className="mt-2 text-[11px] font-bold">
                          {active ? (
                            <span className="inline-flex rounded-full px-2 py-1 bg-emerald-100 text-emerald-700">Selezionato</span>
                          ) : (
                            <span className="inline-flex rounded-full px-2 py-1 bg-gray-100 text-gray-700">Tocca per selezionare</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

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
                  <label className="text-sm font-semibold text-gray-900">Dettagli (opzionale)</label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Descrivi cosa vuoi: itinerario, orari, porto, evento, catering…"
                    rows={5}
                    className="mt-2 w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-400 shadow-[inset_0_2px_6px_rgba(0,0,0,0.06)]"
                  />
                </div>
              </section>

              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="block w-full rounded-2xl text-white text-center font-extrabold py-3 shadow-[0_14px_30px_rgba(16,185,129,0.35)] active:scale-[0.99] transition bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                Invia richiesta su WhatsApp
              </a>

              <p className="text-xs text-gray-500 text-center">Ti rispondiamo su WhatsApp con disponibilità e preventivo.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
