export type LngLat = [number, number];

export type RouteSegments = {
  /** Tramos ajustados a una calle (línea sólida). */
  onRoad: LngLat[][];
  /** Tramos fuera de vía / terreno privado (línea punteada). */
  offRoad: LngLat[][];
};

const MAPBOX_PROFILE = "driving";
const MAX_COORDS = 95;
// Radio de búsqueda amplio para que el request no falle cuando hay
// puntos alejados de la vía; la clasificación se hace por `distance`.
const SNAP_RADIUS_M = 500;
// Distancia (m) del punto crudo al ajustado por encima de la cual se
// considera que el punto está fuera de vía (terreno privado).
const OFFROAD_THRESHOLD_M = 35;

/** Error de la API de Map Matching que conserva el código HTTP/`code`. */
class MapboxMatchError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "MapboxMatchError";
    this.status = status;
    this.code = code;
  }
}

function nearestIndex(coords: number[][], target: number[]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < coords.length; i += 1) {
    const dx = coords[i][0] - target[0];
    const dy = coords[i][1] - target[1];
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Corta la geometría de la calle para el tramo [from, to] de tracepoints. */
function sliceOnRoad(
  tracepoints: Array<Record<string, unknown> | null>,
  matchings: Array<Record<string, unknown>>,
  from: number,
  to: number,
): LngLat[] {
  const out: LngLat[] = [];
  let k = from;
  while (k <= to) {
    const tp = tracepoints[k];
    if (!tp) {
      k += 1;
      continue;
    }
    const mi = Number(tp.matchings_index);
    const geom = matchings[mi]?.geometry as
      | { coordinates?: number[][] }
      | undefined;
    const coords = geom?.coordinates;
    if (!Array.isArray(coords)) {
      k += 1;
      continue;
    }
    let j = k;
    while (
      j + 1 <= to &&
      tracepoints[j + 1] &&
      Number(tracepoints[j + 1]!.matchings_index) === mi
    ) {
      j += 1;
    }
    const a = nearestIndex(coords, tracepoints[k]!.location as number[]);
    const b = nearestIndex(coords, tracepoints[j]!.location as number[]);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let c = lo; c <= hi; c += 1) {
      out.push([coords[c][0], coords[c][1]]);
    }
    k = j + 1;
  }
  return out;
}

async function matchChunk(
  points: LngLat[],
  token: string,
): Promise<RouteSegments> {
  const coords = points
    .map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`)
    .join(";");
  const radiuses = points.map(() => SNAP_RADIUS_M).join(";");

  const url =
    `https://api.mapbox.com/matching/v5/mapbox/${MAPBOX_PROFILE}/${coords}` +
    `?geometries=geojson&overview=full&radiuses=${radiuses}` +
    `&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    let detail = "";
    let code: string | undefined;
    try {
      const body = await res.json();
      detail = body?.message ?? "";
      code = body?.code;
    } catch {
      // respuesta sin JSON: se usa solo el código HTTP
    }
    throw new MapboxMatchError(
      `Mapbox Map Matching HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
      res.status,
      code,
    );
  }

  const data = await res.json();
  const matchings: Array<Record<string, unknown>> = Array.isArray(
    data?.matchings,
  )
    ? data.matchings
    : [];
  const tracepoints: Array<Record<string, unknown> | null> = Array.isArray(
    data?.tracepoints,
  )
    ? data.tracepoints
    : [];

  const onRoad: LngLat[][] = [];
  const offRoad: LngLat[][] = [];

  // Sin alineación fiable punto a punto: todo el chunk cuenta como calle.
  if (tracepoints.length !== points.length) {
    for (const matching of matchings) {
      const geom = matching?.geometry as
        | { coordinates?: number[][] }
        | undefined;
      const c = geom?.coordinates;
      if (Array.isArray(c) && c.length >= 2) {
        onRoad.push(c.map((p) => [p[0], p[1]] as LngLat));
      }
    }
    return { onRoad, offRoad };
  }

  const isOff = tracepoints.map(
    (tp) => tp != null && Number(tp.distance) > OFFROAD_THRESHOLD_M,
  );

  let i = 0;
  while (i < points.length) {
    if (isOff[i]) {
      const start = i;
      while (i < points.length && isOff[i]) i += 1;
      const end = i;
      // Se incluyen los vecinos en vía para conectar con la línea sólida.
      const run: LngLat[] = [];
      if (start > 0) run.push(points[start - 1]);
      for (let k = start; k < end; k += 1) run.push(points[k]);
      if (end < points.length) run.push(points[end]);
      if (run.length >= 2) offRoad.push(run);
    } else {
      const start = i;
      while (i < points.length && !isOff[i]) i += 1;
      const end = i;
      const seg = sliceOnRoad(tracepoints, matchings, start, end - 1);
      if (seg.length >= 2) onRoad.push(seg);
    }
  }

  return { onRoad, offRoad };
}

async function matchLine(
  line: LngLat[],
  token: string,
): Promise<RouteSegments> {
  if (line.length < 2) return { onRoad: [], offRoad: [line] };
  if (line.length <= MAX_COORDS) {
    try {
      return await matchChunk(line, token);
    } catch (err) {
      // Toda la línea sin vía cerca: se considera fuera de vía.
      if (
        err instanceof MapboxMatchError &&
        (err.status === 422 || err.code === "NoSegment")
      ) {
        return { onRoad: [], offRoad: [line] };
      }
      throw err;
    }
  }

  // La API acepta hasta 100 coordenadas; se trocea solapando 1 punto.
  const onRoad: LngLat[][] = [];
  const offRoad: LngLat[][] = [];
  for (let i = 0; i < line.length; i += MAX_COORDS - 1) {
    const chunk = line.slice(i, i + MAX_COORDS);
    if (chunk.length < 2) break;
    try {
      const seg = await matchChunk(chunk, token);
      onRoad.push(...seg.onRoad);
      offRoad.push(...seg.offRoad);
    } catch (err) {
      // Puntos sin vía cerca (NoSegment/InvalidInput): el tramo completo
      // se considera fuera de vía y se dibuja con los puntos crudos.
      if (
        err instanceof MapboxMatchError &&
        (err.status === 422 || err.code === "NoSegment")
      ) {
        offRoad.push(chunk);
        continue;
      }
      throw err;
    }
  }
  return { onRoad, offRoad };
}

export async function matchLinesToRoads(
  lines: LngLat[][],
  token: string,
): Promise<RouteSegments> {
  const onRoad: LngLat[][] = [];
  const offRoad: LngLat[][] = [];
  for (const line of lines) {
    const seg = await matchLine(line, token);
    onRoad.push(...seg.onRoad);
    offRoad.push(...seg.offRoad);
  }
  return { onRoad, offRoad };
}
