import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AnalyzeApiResponse } from "@/lib/peaks/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  image: z.string().min(100).max(8_000_000),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  candidates: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        x: z.number().min(0).max(1),
        y: z.number().min(-0.5).max(1.5),
        distanceKm: z.number().min(0),
        ele: z.number().nullable(),
      }),
    )
    .min(1)
    .max(40),
});

// Esquema de la respuesta estructurada que exigimos al modelo.
const outputSchema = {
  type: "object",
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          visible: { type: "boolean" },
          confidence: { type: "number" },
          x: { type: ["number", "null"] },
          y: { type: ["number", "null"] },
        },
        required: ["name", "visible", "confidence", "x", "y"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["results", "notes"],
  additionalProperties: false,
} as const;

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "El análisis con IA no está configurado (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const candidateList = body.candidates
    .map(
      (c) =>
        `- "${c.name}": posición prevista x=${c.x.toFixed(3)}, y=${c.y.toFixed(3)}, ` +
        `distancia ${c.distanceKm.toFixed(1)} km` +
        (c.ele != null ? `, altitud ${Math.round(c.ele)} m` : ""),
    )
    .join("\n");

  const client = new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { format: { type: "json_schema", schema: outputSchema } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: body.mediaType, data: body.image },
            },
            {
              type: "text",
              text:
                `Esta foto de paisaje se tomó desde una posición GPS conocida. A partir de la ` +
                `orientación de la cámara hemos proyectado dónde deberían aparecer estas cimas ` +
                `(x: 0 = borde izquierdo, 1 = borde derecho; y: 0 = borde superior, 1 = borde inferior):\n\n` +
                `${candidateList}\n\n` +
                `Las posiciones previstas vienen de sensores. El error dominante es de brújula: ` +
                `desplaza TODAS las candidatas horizontalmente casi el mismo offset, así que la ` +
                `separación horizontal RELATIVA entre candidatas sí es fiable. Estrategia: deduce ` +
                `primero ese desplazamiento global comparando el patrón completo de candidatas con ` +
                `las cumbres reales de la foto, y luego asigna cada candidata a una cumbre DISTINTA ` +
                `manteniendo su orden y su espaciado relativo. Nunca muevas una candidata suelta a ` +
                `la cumbre llamativa de al lado: si el espaciado no encaja, esa cumbre es de otra ` +
                `candidata (o de ninguna). Para cada candidata, dime si realmente ` +
                `se distingue una montaña o pico en la foto cerca de su posición prevista (visible) ` +
                `y con qué confianza (0 a 1). Una candidata no es visible si en esa zona hay cielo, ` +
                `nubes, niebla, edificios o vegetación que la tapa, o si la foto no llega a cubrir ` +
                `esa dirección. Sé estricto: si no distingues con claridad la silueta de una ` +
                `cima en esa zona, marca visible=false; es peor etiquetar algo que no se ve que ` +
                `omitir una etiqueta. Cuando visible sea true, devuelve SIEMPRE x e y corregidas ` +
                `apuntando con precisión al punto exacto más alto de esa cima en la imagen (el ` +
                `vértice de su silueta contra el cielo o el relieve de detrás); no repitas la ` +
                `posición prevista si la cumbre real está algo desplazada. Respeta el orden ` +
                `relativo izquierda-derecha de las candidatas y no asignes dos candidatas al mismo ` +
                `punto. En "notes" resume en una frase qué se ve en la foto.`,
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "El modelo no pudo analizar esta imagen." },
        { status: 422 },
      );
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Respuesta vacía del modelo." }, { status: 502 });
    }

    const parsed = JSON.parse(textBlock.text) as AnalyzeApiResponse;
    return NextResponse.json(parsed);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: "Clave de API de Anthropic inválida." }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json(
        { error: "Límite de peticiones alcanzado, prueba en un minuto." },
        { status: 429 },
      );
    }
    console.error("[peaks/analyze] error:", err);
    return NextResponse.json({ error: "Error analizando la imagen." }, { status: 502 });
  }
}
