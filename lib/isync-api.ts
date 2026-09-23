export type LonLat = [number, number];

export type PointProperties = {
  deviceId: string;
  deviceCode?: string;
  deviceName?: string;
  ts: string;
  receivedAt?: string;
  speed?: number;
  accuracy?: number;
  altitude?: number;
  heading?: number;
};

export type UltimasPosiciones = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: LonLat };
    properties: PointProperties;
  }>;
};

export type RecorridoProperties = {
  deviceId: string;
  tipo: "recorrido";
  km: number;
  duracionMin: number;
  inicio: string;
  fin: string;
  velocidadMax: number;
  velocidadPromedio: number;
  muestras: number;
};

export type RecorridoGeometry =
  | { type: "LineString"; coordinates: LonLat[] }
  | { type: "MultiLineString"; coordinates: LonLat[][] };

export type ParadaProperties = {
  deviceId: string;
  tipo: "parada";
  inicio: string;
  fin: string;
  duracionMin: number;
  muestras: number;
};

export type RutasResponse = {
  type: "FeatureCollection";
  features: Array<
    | {
        type: "Feature";
        geometry: RecorridoGeometry;
        properties: RecorridoProperties;
      }
    | {
        type: "Feature";
        geometry: { type: "Point"; coordinates: LonLat };
        properties: {
          deviceId: string;
          deviceName: string;
          tipo: "punto";
          ts: string;
          receivedAt: string;
          speed?: number;
          accuracy: number;
          heading?: number;
        };
      }
    | {
        type: "Feature";
        geometry: { type: "Point"; coordinates: LonLat };
        properties: ParadaProperties;
      }
  >;
};

export type Format = "geojson" | "polyline";

export type RutasParams = {
  desde?: string;
  hasta?: string;
  limit?: number;
  stopRadius?: number;
  format?: Format;
};

export type RubroProperties = {
  deviceId: string;
  deviceName?: string;
  muestras: number;
  polyline?: string;
};

export type UbicacionesResponse = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry?: RecorridoGeometry;
    properties: RubroProperties;
  }>;
};

export type DistanciaResponse = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry?: RecorridoGeometry;
    properties: RubroProperties & { km?: number };
  }>;
};

export type TiemposEstaticosResponse = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: { type: "Point"; coordinates: LonLat };
    properties: {
      deviceId: string;
      inicio: string;
      fin: string;
      duracionMin: number;
      muestras: number;
    };
  }>;
};

export const parseTiemposEstaticos = (
  fc: TiemposEstaticosResponse,
): RouteStop[] =>
  fc.features.map((f) => ({
    position: f.geometry.coordinates,
    inicio: f.properties.inicio,
    fin: f.properties.fin,
    duracionMin: f.properties.duracionMin,
  }));

export type RouteStop = {
  position: LonLat;
  inicio: string;
  fin: string;
  duracionMin: number;
};

export type RouteInfo = {
  lines: LonLat[][];
  km: number;
  duracionMin: number;
  velocidadMax: number;
  velocidadPromedio: number;
  inicio: string;
  fin: string;
  stops: RouteStop[];
};

export const parseRutas = (fc: RutasResponse): RouteInfo => {
  const line = fc.features.find((f) => f.properties.tipo === "recorrido");
  const stops = fc.features.filter((f) => f.properties.tipo === "parada");
  const geom = line?.geometry;
  const lines: LonLat[][] =
    geom?.type === "LineString"
      ? [geom.coordinates]
      : geom?.type === "MultiLineString"
        ? geom.coordinates
        : [];
  const rp = line?.properties.tipo === "recorrido" ? line.properties : null;

  return {
    lines,
    km: rp?.km ?? 0,
    duracionMin: rp?.duracionMin ?? 0,
    velocidadMax: rp?.velocidadMax ?? 0,
    velocidadPromedio: rp?.velocidadPromedio ?? 0,
    inicio: rp?.inicio ?? "",
    fin: rp?.fin ?? "",
    stops: stops
      .filter(
        (f): f is Extract<RutasResponse["features"][number], { properties: { tipo: "parada" } }> =>
          f.properties.tipo === "parada",
      )
      .map((f) => ({
        position: f.geometry.coordinates,
        inicio: f.properties.inicio,
        fin: f.properties.fin,
        duracionMin: f.properties.duracionMin,
      })),
  };
};

const BASE = process.env.NEXT_PUBLIC_ISYNC_API ?? "/isync-api";

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
  return (await res.json()) as T;
}

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== "",
  );
  if (entries.length === 0) return "";
  return `?${entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&")}`;
}

export const getUltimasPosiciones = () =>
  getJSON<UltimasPosiciones>("/ultimas-posiciones");

export const getRutas = (deviceId: string, params?: RutasParams) =>
  getJSON<RutasResponse>(
    `/rutas/${encodeURIComponent(deviceId)}${qs(params ?? {})}`,
  );

export const getUbicaciones = (
  deviceId: string,
  params?: { desde?: string; hasta?: string; limit?: number; format?: Format },
) => getJSON<UbicacionesResponse>(`/ubicaciones${qs({ deviceId, ...params })}`);

export const getDistancia = (
  deviceId: string,
  params?: { desde?: string; hasta?: string; format?: Format },
) => getJSON<DistanciaResponse>(`/distancia${qs({ deviceId, ...params })}`);

export const getTiemposEstaticos = (
  deviceId: string,
  params?: { desde?: string; hasta?: string; stopRadius?: number },
) =>
  getJSON<TiemposEstaticosResponse>(
    `/tiempos-estaticos${qs({ deviceId, ...params })}`,
  );
