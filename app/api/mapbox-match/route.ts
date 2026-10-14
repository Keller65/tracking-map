import { NextRequest } from "next/server";
import { matchLinesToRoads, type LngLat } from "@/lib/mapbox-matching";

export async function POST(request: NextRequest) {
  const token =
    process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token) {
    return Response.json(
      { error: "Falta el token de Mapbox (MAPBOX_TOKEN)." },
      { status: 500 },
    );
  }

  let lines: LngLat[][];
  try {
    const body = await request.json();
    lines = Array.isArray(body?.lines) ? body.lines : [];
    if (!lines.some((l) => Array.isArray(l) && l.length >= 2)) {
      return Response.json(
        { error: "Se necesita al menos una línea con 2 puntos." },
        { status: 400 },
      );
    }
  } catch {
    return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
  }

  try {
    const { onRoad, offRoad } = await matchLinesToRoads(lines, token);
    return Response.json({ onRoad, offRoad });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error de map-matching.";
    return Response.json({ error: message }, { status: 502 });
  }
}
