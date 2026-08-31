import { NextRequest } from "next/server";
import { matchTrace, type TracePoint } from "@/lib/valhalla";

export async function POST(request: NextRequest) {
  let points: TracePoint[];
  try {
    const body = await request.json();
    points = Array.isArray(body?.shape) ? body.shape : body?.points;
    if (!Array.isArray(points) || points.length < 2) {
      return Response.json(
        { error: "Se necesitan al menos 2 puntos {lat, lon}." },
        { status: 400 },
      );
    }
  } catch {
    return Response.json(
      { error: "Cuerpo JSON inválido." },
      { status: 400 },
    );
  }

  try {
    const coordinates = await matchTrace(points);
    return Response.json({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates,
      },
      properties: { pointCount: points.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error de map-matching.";
    return Response.json({ error: message }, { status: 502 });
  }
}
