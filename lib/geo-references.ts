type CircleReference = {
  id: string;
  name: string;
  type: "circle";
  center: [number, number]; // [lng, lat]
  radiusM: number;
};

type PolygonReference = {
  id: string;
  name: string;
  type: "polygon";
  vertices: [number, number][]; // [lng, lat][]
};

export type GeoReference = CircleReference | PolygonReference;

const GEO_STORAGE_KEY = "geo:references";

export const circleRing = (
  center: [number, number],
  radiusM: number,
  steps = 64
): [number, number][] => {
  const [lng, lat] = center;
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos(latRad));
  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lng + dLng * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }
  return coords;
};

export const geoFeature = (g: GeoReference): GeoJSON.Feature<GeoJSON.Polygon> => ({
  type: "Feature",
  properties: { id: g.id, name: g.name },
  geometry: {
    type: "Polygon",
    coordinates: [
      g.type === "polygon"
        ? [...g.vertices, g.vertices[0]]
        : circleRing(g.center, g.radiusM),
    ],
  },
});

// Migrate older entries that predate the `type` field (all circles).
const normalizeReference = (raw: Record<string, unknown>): GeoReference | null => {
  if (raw && raw.type === "polygon" && Array.isArray(raw.vertices)) {
    return raw as unknown as PolygonReference;
  }
  if (raw && Array.isArray(raw.center)) {
    return { ...(raw as unknown as CircleReference), type: "circle" };
  }
  return null;
};

export const readGeoReferences = (): GeoReference[] => {
  try {
    const raw = localStorage.getItem(GEO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map(normalizeReference).filter(Boolean) as GeoReference[];
  } catch {
    return [];
  }
};