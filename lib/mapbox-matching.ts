export type LngLat = [number, number];

const MAPBOX_PROFILE = "driving";
const MAX_COORDS = 95;
const SNAP_RADIUS_M = 50;

async function matchChunk(
  points: LngLat[],
  token: string,
): Promise<LngLat[]> {
  const coords = points
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(";");
  const radiuses = points.map(() => SNAP_RADIUS_M).join(";");

  const url =
    `https://api.mapbox.com/matching/v5/mapbox/${MAPBOX_PROFILE}/${coords}` +
    `?geometries=geojson&overview=full&tidy=true&radiuses=${radiuses}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body?.message ?? "";
    } catch {
      // respuesta sin JSON: se usa solo el código HTTP
    }
    throw new Error(
      `Mapbox Map Matching HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  const data = await res.json();
  const matchings = data?.matchings;
  if (!Array.isArray(matchings) || matchings.length === 0) {
    throw new Error("Mapbox no devolvió coincidencias para el trazado.");
  }

  const out: LngLat[] = [];
  for (const matching of matchings) {
    const coordinates = matching?.geometry?.coordinates;
    if (!Array.isArray(coordinates)) continue;
    for (const point of coordinates) out.push([point[0], point[1]]);
  }

  if (out.length < 2) {
    throw new Error("La coincidencia de Mapbox es demasiado corta.");
  }
  return out;
}

async function matchLine(line: LngLat[], token: string): Promise<LngLat[]> {
  if (line.length < 2) return line;
  if (line.length <= MAX_COORDS) return matchChunk(line, token);

  // La API acepta hasta 100 coordenadas; se trocea solapando 1 punto.
  const out: LngLat[] = [];
  for (let i = 0; i < line.length; i += MAX_COORDS - 1) {
    const chunk = line.slice(i, i + MAX_COORDS);
    if (chunk.length < 2) break;
    const matched = await matchChunk(chunk, token);
    out.push(...(out.length > 0 ? matched.slice(1) : matched));
  }
  return out;
}

export async function matchLinesToRoads(
  lines: LngLat[][],
  token: string,
): Promise<LngLat[][]> {
  const result: LngLat[][] = [];
  for (const line of lines) {
    result.push(await matchLine(line, token));
  }
  return result;
}
