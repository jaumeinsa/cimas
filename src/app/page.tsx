import PeakIdentifier from "@/components/PeakIdentifier";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream px-3 pb-10">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto max-w-4xl px-2 py-3">
          <span className="font-display text-2xl font-semibold text-pine">Rutakon</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl pt-6">
        <section className="mb-5 text-center">
          <h1 className="font-display text-2xl font-semibold text-pine sm:text-4xl">
            ¿Qué montañas salen en tu foto?
          </h1>
          <p className="mt-2 text-ink-muted">Sube la foto y te lo decimos.</p>
        </section>

        <PeakIdentifier />

        <p className="mx-auto mt-10 max-w-2xl text-center text-xs text-ink-muted">
          Tu foto no sale del móvil, salvo si usas la IA. Datos de cimas: ©{" "}
          <a href="https://www.openstreetmap.org" className="underline" rel="noreferrer" target="_blank">
            OpenStreetMap
          </a>{" "}
          · Altitud: Open-Meteo.
        </p>
      </div>
    </main>
  );
}
