import type { Metadata, Viewport } from "next";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://rutakon.com";

// Logo "cresta" de Rutakon: línea de cumbres en tinta con la cima naranja.
const CRESTA_ICON =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20viewBox='0%200%2024%2024'%20fill='none'%3E%3Cpath%20d='M2%2019%20L7.5%209%20L11%2014%20L16%204.5%20L22%2019'%20stroke='%2326221A'%20stroke-width='2.5'%20stroke-linecap='round'%20stroke-linejoin='round'/%3E%3Ccircle%20cx='16'%20cy='4.5'%20r='2'%20fill='%23D4551A'/%3E%3C/svg%3E";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: "Rutakon — ¿Qué montañas salen en tu foto?",
    template: "%s · Rutakon",
  },
  description:
    "Sube una foto de montaña y descubre qué cimas aparecen: nombre, altitud y distancia de cada pico.",
  icons: { icon: CRESTA_ICON },
  openGraph: {
    title: "Rutakon — ¿Qué montañas salen en tu foto?",
    description:
      "Etiqueta automáticamente los picos de tus fotos de montaña.",
    url: appUrl,
    siteName: "Rutakon",
    locale: "es_ES",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#26221a",
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
