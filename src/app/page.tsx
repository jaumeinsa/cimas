import PeakIdentifier from "@/components/PeakIdentifier";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-100 via-slate-50 to-white px-4 py-10">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
            ¿Qué montañas salen en mi foto? 🏔️
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Haz una foto con el móvil (o sube una ya hecha) y te decimos qué cimas aparecen,
            con su nombre, altitud y distancia. Usamos el GPS y la orientación de la cámara
            guardados en la foto, el catálogo de picos de OpenStreetMap y, si quieres,
            verificación con IA.
          </p>
        </header>

        <PeakIdentifier />

        <section className="mx-auto mt-12 max-w-2xl text-sm text-slate-500">
          <h2 className="mb-2 font-semibold text-slate-700">Cómo funciona</h2>
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
              Con «Verificar con IA» (API de Anthropic) el modelo mira la foto y descarta las
              cimas que realmente no se ven (nubes, niebla, obstáculos) y afina la posición de
              las etiquetas.
            </li>
          </ol>
          <p className="mt-4">
            Datos de cimas: © colaboradores de{" "}
            <a href="https://www.openstreetmap.org" className="underline" rel="noreferrer" target="_blank">
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
