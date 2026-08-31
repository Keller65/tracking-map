export type TracePoint = {
  lat: number;
  lon: number;
  time?: number;
  type?: "break" | "via";
};

const VALHALLA_SERVERS = [
  "https://valhalla1.openstreetmap.de",
  "https://valhalla2.openstreetmap.de",
];

function decodePolyline(encoded: string, precision = 6): [number, number][] {
  const factor = 10 ** precision;
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lng / factor, lat / factor]);
  }

  return coordinates;
}

export async function matchTrace(
  points: TracePoint[],
): Promise<[number, number][]> {
  if (points.length < 2) {
    throw new Error("Se necesitan al menos 2 puntos para el map-matching.");
  }

  const shape: TracePoint[] = points.map((p) => ({
    lat: p.lat,
    lon: p.lon,
    ...(p.time !== undefined ? { time: p.time } : {}),
  }));
  // El primero y el último deben ser "break" para delimitar la ruta.
  shape[0].type = "break";
  shape[shape.length - 1].type = "break";

  const body = {
    shape,
    costing: "auto",
    shape_match: "map_snap",
    trace_options: {
      gps_accuracy: 25,
      search_radius: 100,
      turn_penalty_factor: 500,
    },
  };

  let lastError: unknown = null;
  for (const base of VALHALLA_SERVERS) {
    try {
      const res = await fetch(`${base}/trace_route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (!res.ok) {
        lastError = new Error(
          `Valhalla respondió HTTP ${res.status} en ${base}`,
        );
        continue;
      }

      const data = await res.json();
      const shapeEncoded =
        data?.trip?.legs?.[0]?.shape ??
        data?.trip?.legs?.[0]?.leg_shape;

      if (typeof shapeEncoded !== "string" || shapeEncoded.length === 0) {
        throw new Error("La respuesta de Valhalla no incluye una forma válida.");
      }

      return decodePolyline(shapeEncoded);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError ?? new Error("Fallo el map-matching en todos los servidores.");
}
