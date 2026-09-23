export type LonLat = [number, number];

export type GeovallaProperties = {
  id: number;
  nombre: string;
  descripcion?: string | null;
  tipo?: string | null;
  geojson: { type: "Polygon"; coordinates: LonLat[][] };
  activo: boolean;
  creado_por: unknown;
  creado_en: string;
  actualizado_en: string;
};

export type GeovallaFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  GeovallaProperties
>;

export type GeovallasResponse = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  GeovallaProperties
>;

export type GeovallaInput = {
  type: "Feature";
  properties?: {
    nombre?: string;
    name?: string;
    descripcion?: string;
    description?: string;
    tipo?: string;
    type?: string;
  };
  geometry: { type: "Polygon"; coordinates: LonLat[][] };
};

export type CreateGeovallaResponse = {
  ok: true;
  message: string;
  id: number;
};

export type GeovallasApiError = {
  ok: false;
  code?: string;
  errors?: string[];
  error?: string;
};

const BASE = "/api/geovallas";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => null)) as
    | (T | GeovallasApiError)
    | null;
  if (!res.ok) {
    const err = (body ?? {}) as GeovallasApiError;
    const message =
      err?.errors?.join(", ") ??
      err?.error ??
      `API ${res.status}: ${url}`;
    throw new Error(message);
  }
  return body as T;
}

export const getGeovallas = () => request<GeovallasResponse>(BASE);

export const getGeovalla = (id: number) =>
  request<GeovallaFeature>(`${BASE}/${id}`);

export const createGeovalla = (feature: GeovallaInput) =>
  request<CreateGeovallaResponse>(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(feature),
  });