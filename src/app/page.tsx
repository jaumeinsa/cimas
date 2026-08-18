import PeakIdentifier from "@/components/PeakIdentifier";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-cream px-4 pb-14">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl items-baseline justify-between px-1 py-4">
          <span className="font-display text-2xl font-semibold text-pine">Rutakon</span>
          <span className="text-sm text-ink-muted">Tus montañas, con nombre</span>
        </div>
      </header>

      <div className="mx-auto max-w-4xl pt-10">
        <section className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold text-pine sm:text-4xl">
            ¿Qué montañas salen en tu foto?
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-ink-muted">
            Haz una foto con el móvil (o sube una ya hecha) y te decimos qué cimas aparecen,
            con su nombre, altitud y distancia. Usamos el GPS y la orientación de la cámara
            guardados en la foto, el catálogo de picos de OpenStreetMap y, si quieres,
            verificación con IA.
          </p>
        </section>

        <PeakIdentifier />

        <section className="mx-auto mt-12 max-w-2xl text-sm text-ink-muted">
          <h2 className="mb-2 font-display text-lg font-semibold text-pine">Cómo funciona</h2>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              La foto original guarda la posición GPS, la dirección hacia la que apuntaba la
              cámara y la focal del objetivo (metadatos EXIF). Si el navegador los elimina al
              subirla, puedes usar tu ubicación actual, la brújula del móvil o ajustar a mano.
            </li>
            <li>
              Consultamos las cimas catalogadas en OpenStreetMap en un radio de 60 km y
              calculamos el rumbo, la distancia y el ángulo de elevación de cada una desde tu
              posición, descontando la curvatura terrestre.
            </li>
            <li>
              Proyectamos sobre la foto las cimas que caen dentro del encuadre y descartamos
              las que quedan tapadas por picos más cercanos. Arrastra la imagen para afinar la
              alineación.
            </li>
            <li>
              Con «Verificar con IA» el modelo mira la foto y descarta las cimas que realmente
              no se ven (nubes, niebla, obstáculos) y afina la posición de las etiquetas.
            </li>
          </ol>
          <p className="mt-4">
            Datos de cimas: © colaboradores de{" "}
            <a
              href="https://www.openstreetmap.org"
              className="text-pine underline"
              rel="noreferrer"
              target="_blank"
            >
              OpenStreetMap
            </a>
            . Altitud del terreno: Open-Meteo. La foto solo sale de tu dispositivo si usas la
            verificación con IA.
          </p>
        </section>
      </div>
    </main>
  );
}
