import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rutakon.com";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Rutakon — ¿Qué montañas salen en tu foto?",
    template: "%s · Rutakon",
  },
  description:
    "Sube una foto de montaña y descubre qué cimas aparecen: nombre, altitud y distancia de cada pico, usando el GPS y la orientación de la cámara de la propia foto.",
  openGraph: {
    title: "Rutakon — ¿Qué montañas salen en tu foto?",
    description:
      "Etiqueta automáticamente los picos de tus fotos de montaña con datos de OpenStreetMap y verificación con IA.",
    url: appUrl,
    siteName: "Rutakon",
    locale: "es_ES",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f5132",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
