import PeakIdentifier from "@/components/PeakIdentifier";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream px-3 pb-10">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-2 py-3">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M2 19 L7.5 9 L11 14 L16 4.5 L22 19"
              stroke="#26221a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="16" cy="4.5" r="2" fill="#d4551a" />
          </svg>
          <span className="font-display text-lg tracking-wide text-ink">RUTAKON</span>
          <nav className="ml-auto flex items-center gap-4 font-cap text-base font-semibold tracking-wide">
            <span className="text-ink">FOTOS</span>
            <a href="https://rutas.rutakon.com" className="text-accent hover:text-accent-dark">
              RUTAS →
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl pt-6">
        <section className="mb-5 text-center">
          <h1 className="font-display text-2xl uppercase leading-tight text-ink sm:text-4xl">
            ¿Qué montañas salen
            <br />
            <span className="text-accent">en tu foto?</span>
          </h1>
          <p className="mt-3 text-ink-muted">Sube la foto y te lo decimos.</p>
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
