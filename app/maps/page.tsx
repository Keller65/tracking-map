"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import axios from "axios";
import { useSocketIO } from "@/lib/hooks/useSocketIO";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { createRoot, Root } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { StatChip } from "@/components/dashboard/maps/StatChip";
import { DeviceMarker } from "@/components/dashboard/maps/device-marker";
import { Car, MapPin, Gauge, MagnifyingGlass, Crosshair, BatteryFull, CircleNotchIcon, CalendarIcon, MapPinIcon, MapTrifoldIcon, EyeIcon, EyeSlashIcon, } from "@phosphor-icons/react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Device, DeviceMarkerRef, GpsLastDevice, TrailPoint } from "@/types/tracking";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const TRAIL_MAX_POINTS = 15000;
const MAP_STYLE = "mapbox://styles/mapbox/streets-v11";

const TRAIL_COLOR = "#3b82f6";

const GEO_STORAGE_KEY = "geo:references";
const GEO_COLOR = "#8b5cf6";

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

type GeoReference = CircleReference | PolygonReference;

const circleRing = (
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

const geoFeature = (g: GeoReference): GeoJSON.Feature<GeoJSON.Polygon> => ({
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

const readGeoReferences = (): GeoReference[] => {
  try {
    const raw = localStorage.getItem(GEO_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Record<string, unknown>[];
    return parsed.map(normalizeReference).filter(Boolean) as GeoReference[];
  } catch {
    return [];
  }
};

const fmtBattery = (level: number): string =>
  `${level > 1 ? Math.round(level) : Math.round(level * 100)}%`;

const fmtTime = (v: string | number): string =>
  new Date(v).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

const fmtDateDisplay = (v: string): string =>
  format(parse(v, "yyyy-MM-dd", new Date()), "dd/MM/yy");

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

const MATCH_MAX_COORDS = 100;
const MATCH_SNAP_THRESHOLD_M = 30;
const MATCH_RADIUS_M = 30;

type HybridPoint = {
  position: [number, number];
  snapped: boolean;
};

const distM = (a: [number, number], b: [number, number]): number => {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

const mapMatchChunk = async (
  chunk: [number, number][]
): Promise<HybridPoint[] | null> => {
  if (chunk.length < 2) return null;
  const path = chunk.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const radiuses = chunk.map(() => MATCH_RADIUS_M).join(";");
  const url =
    `https://api.mapbox.com/matching/v5/mapbox/driving/${path}` +
    `?geometries=geojson&overview=full&tidy=false` +
    `&radiuses=${radiuses}&access_token=${mapboxgl.accessToken}`;

  try {
    const { data } = await axios.get(url, { timeout: 20_000 });
    if (data?.code !== "Ok" || !Array.isArray(data.tracepoints)) return null;

    return chunk.map((raw, i) => {
      const tp = data.tracepoints[i];
      if (!tp || !Array.isArray(tp.location)) {
        return { position: raw, snapped: false };
      }
      const snappedPos = tp.location as [number, number];
      const within = distM(raw, snappedPos) <= MATCH_SNAP_THRESHOLD_M;
      return within
        ? { position: snappedPos, snapped: true }
        : { position: raw, snapped: false };
    });
  } catch (err) {
    console.error("Map matching request failed", err);
    return null;
  }
};

const mapMatchTrail = async (
  coords: [number, number][]
): Promise<HybridPoint[]> => {
  if (coords.length < 2) {
    return coords.map((position) => ({ position, snapped: false }));
  }

  const matched: HybridPoint[] = [];
  for (let i = 0; i < coords.length; i += MATCH_MAX_COORDS - 1) {
    const chunk = coords.slice(i, i + MATCH_MAX_COORDS);
    // Fall back to raw points if the matcher couldn't resolve the chunk.
    const segment =
      (await mapMatchChunk(chunk)) ??
      chunk.map((position) => ({ position, snapped: false }));
    if (matched.length > 0) segment.shift(); // drop the overlapped point
    matched.push(...segment);
  }
  return matched.length >= 2
    ? matched
    : coords.map((position) => ({ position, snapped: false }));
};

const buildTrailFeatures = (
  hybrid: HybridPoint[]
): GeoJSON.FeatureCollection<GeoJSON.LineString> => ({
  type: "FeatureCollection",
  features: hybrid.slice(1).map((pt, i) => {
    const prev = hybrid[i];
    return {
      type: "Feature",
      properties: { offRoad: !prev.snapped || !pt.snapped },
      geometry: {
        type: "LineString",
        coordinates: [prev.position, pt.position],
      },
    };
  }),
});

export default function Page() {
  // Auth token comes from localStorage (no next-auth used in this project).
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    setToken(
      typeof window !== "undefined"
        ? window.localStorage.getItem("settings:token")
        : null
    );
  }, []);

  // ── State ──────────────────────────────────────────────────
  const [devices, setDevices] = useState<Map<string, Device>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<GeoReference[]>([]);

  // WebSocket for realtime tracking
  const wsHost = (typeof window !== "undefined" && localStorage.getItem("settings:wsUrl")) || process.env.NEXT_PUBLIC_WS_HOST || "http://localhost:5050";
  const { isConnected: wsConnected, lastMessages, liveDeviceIds, connectedQueue, clearConnects, disconnectedQueue, clearDisconnects } = useSocketIO(wsHost);

  // Date range for history query
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return format(d, "yyyy-MM-dd");
  });
  const [dateTo, setDateTo] = useState(() =>
    format(new Date(), "yyyy-MM-dd")
  );
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  const [timeFrom, setTimeFrom] = useState("00:00:00");
  const [timeTo, setTimeTo] = useState("23:59:59");

  const [scrubPct, setScrubPct] = useState(1);
  const [scrubPoint, setScrubPoint] = useState<TrailPoint | null>(null);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, DeviceMarkerRef & { root: Root }>>(new Map());
  const scrubMarkerRef = useRef<mapboxgl.Marker | null>(null);

  const trailLayersRef = useRef<Map<string, { sourceId: string; layerId: string; offRoadLayerId: string }>>(new Map());

  const trailCoordsRef = useRef<Map<string, [number, number][]>>(new Map());
  const hybridTrailRef = useRef<Map<string, HybridPoint[]>>(new Map());
  const [trailLoadingStatus, setTrailLoadingStatus] = useState<"idle" | "loading" | "done">("idle");

  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    const fetchDevices = async () => {
      try {
        const { data } = await axios.get<GpsLastDevice[]>(
          "/api-proxy/api/gps/realtime",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (cancelled) return;

        setDevices((prev) => {
          const next = new Map<string, Device>();
          for (const d of data) {
            if (!d.latitude || !d.longitude) continue;
            const pos: [number, number] = [d.longitude, d.latitude];
            const ts = new Date(d.gpsTimestamp).getTime();
            const existing = prev.get(d.androidId);
            const speedKmh = (d.speed ?? 0) * 3.6;

            next.set(d.androidId, {
              id: d.androidId,
              name: d.slpName || d.androidId,
              position: pos,
              speed: existing?.speed ?? speedKmh,
              lastUpdate: d.gpsTimestamp,
              timestamp: ts,
              trail: existing?.trail ?? [pos],
              trailPoints: existing?.trailPoints ?? [
                { position: pos, timestamp: ts, speed: speedKmh, cumDistKm: 0 },
              ],
              totalDistance: existing?.totalDistance ?? 0,
              isMoving: existing?.isMoving ?? d.isMoving ?? false,
              batteryLevel: d.batteryLevel,
              isOnline: d.isOnline,
            });
          }
          return next;
        });
      } catch (err) {
        console.error("Failed to fetch GPS devices", err);
      }
    };

    fetchDevices();
    const interval = setInterval(fetchDevices, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [token]);

  // ── Fetch trail from backend (already processed) ──────────
  const fetchHistory = useCallback(
    async (androidId: string) => {
      if (!token) return;
      setLoadingHistory(true);
      setHistoryError(null);
      try {
        const from = `${dateFrom}T${timeFrom}`;
        const to = `${dateTo}T${timeTo}`;

        const { data } = await axios.get<{
          androidId: string;
          geoJson: string;
        }>(
          `/api-proxy/api/gps/history-line/${androidId}`,
          {
            params: {
              from,
              to,
            },
            headers: { Authorization: `Bearer ${token}` },
            timeout: 60_000,
          }
        );

        if (!data?.geoJson) {
          setHistoryError("No se encontraron registros en el rango seleccionado.");
          setLoadingHistory(false);
          return;
        }

        // Parse GeoJSON string
        const geojson = JSON.parse(data.geoJson);
        if (geojson.type !== "LineString" || !geojson.coordinates) {
          throw new Error("Invalid GeoJSON format");
        }

        const rawCoords: [number, number][] = geojson.coordinates;
        if (rawCoords.length === 0) {
          setHistoryError("No se encontraron coordenadas en el rango seleccionado.");
          setLoadingHistory(false);
          return;
        }

        // Hybrid match: snap points near roads, keep raw points on private
        // terrain. Resolved positions feed the existing scrubber/bounds logic;
        // the per-point flags drive the road-vs-offroad styling.
        const hybrid = await mapMatchTrail(rawCoords);
        const coords = hybrid.map((h) => h.position);

        // Store trail coordinates + hybrid flags
        trailCoordsRef.current.set(androidId, coords);
        hybridTrailRef.current.set(androidId, hybrid);
        setTrailLoadingStatus("done");

        // Build minimal trail representation
        const trail = coords.slice(-TRAIL_MAX_POINTS);
        const trailPoints: TrailPoint[] = trail.map((pos, idx) => ({
          position: pos,
          timestamp: Date.now(),
          speed: 0,
          cumDistKm: idx,
        }));

        setDevices((prev) => {
          const next = new Map(prev);
          const existing = next.get(androidId);
          if (!existing) return prev;

          next.set(androidId, {
            ...existing,
            trail,
            trailPoints,
            totalDistance: trail.length,
          });
          return next;
        });

        // Fly map to trail bounds
        if (trail.length > 0) {
          const bounds = trail.reduce(
            (b, pos) => b.extend(pos),
            new mapboxgl.LngLatBounds(trail[0], trail[0])
          );
          mapRef.current?.fitBounds(bounds, { padding: 60, duration: 1000 });
        }
      } catch (err) {
        console.error("Failed to fetch GPS history line", err);
        setHistoryError("Error al cargar el historial. Intenta de nuevo.");
      } finally {
        setLoadingHistory(false);
      }
    },
    [token, dateFrom, dateTo, timeFrom, timeTo]
  );

  // ── Smooth animation for marker movement in live mode ──────
  const animateRef = useRef<() => void>(null)
  animateRef.current = () => {
    let hasMovement = false;

    markersRef.current.forEach((ref) => {
      const [cLng, cLat] = ref.currentPosition;
      const [tLng, tLat] = ref.targetPosition;
      const dLng = tLng - cLng;
      const dLat = tLat - cLat;

      if (Math.abs(dLng) > 1e-7 || Math.abs(dLat) > 1e-7) {
        const k = 0.08;
        const nLng = cLng + dLng * k;
        const nLat = cLat + dLat * k;

        ref.currentPosition = [nLng, nLat];
        ref.marker.setLngLat([nLng, nLat]);
        hasMovement = true;
      }
    });

    if (hasMovement) {
      animFrameRef.current = requestAnimationFrame(animateRef.current!);
    } else {
      animFrameRef.current = null;
    }
  };

  // ── Trigger animation for smooth marker movement ─
  useEffect(() => {
    if (devices.size > 0) {
      if (!animFrameRef.current) {
        animFrameRef.current = requestAnimationFrame(animateRef.current!);
      }
    }
  }, [devices]);

  // ── Initialize Mapbox ─────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainer.current,
      style: MAP_STYLE,
      center: [-88.0128225, 15.4312014],
      zoom: 12,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.on("load", () => {
      mapRef.current = map;
      setMapReady(true);
    });

    map.on('style.load', () => {
      map.setFog({
        color: 'rgb(186, 210, 235)', // Lower atmosphere
        'high-color': 'rgb(36, 92, 223)', // Upper atmosphere
        'horizon-blend': 0.02, // Atmosphere thickness (default 0.2 at low zooms)
        'space-color': 'rgb(11, 11, 25)', // Background color
        'star-intensity': 0.6 // Background star brightness (default 0.35 at low zoooms )
      });
    });

    return () => {
      // Cancel any pending animation frame
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }

      // Cleanup all marker roots before removing map
      markersRef.current.forEach(({ marker, root }) => {
        marker.remove();
        root.unmount();
      });
      markersRef.current.clear();

      if (scrubMarkerRef.current) {
        scrubMarkerRef.current.remove();
        scrubMarkerRef.current = null;
      }

      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Toggle geo-references overlay (read from localStorage) ─
  const handleToggleGeofences = useCallback(() => {
    setShowGeofences((prev) => {
      const next = !prev;
      if (next) setGeofences(readGeoReferences());
      return next;
    });
  }, []);

  // ── Draw / remove geo-reference circles ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const sourceId = "geo-refs-overlay";
    const fillId = "geo-refs-overlay-fill";
    const lineId = "geo-refs-overlay-line";

    const removeLayers = () => {
      try {
        if (map.getLayer(fillId)) map.removeLayer(fillId);
        if (map.getLayer(lineId)) map.removeLayer(lineId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch { }
    };

    if (!showGeofences || geofences.length === 0) {
      removeLayers();
      return;
    }

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: geofences.map(geoFeature),
    };

    const existing = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined;
    if (existing) {
      existing.setData(data);
    } else {
      map.addSource(sourceId, { type: "geojson", data });
      map.addLayer({
        id: fillId,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": GEO_COLOR, "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: lineId,
        type: "line",
        source: sourceId,
        paint: { "line-color": GEO_COLOR, "line-width": 2 },
      });
    }

    return removeLayers;
  }, [showGeofences, geofences, mapReady]);

  // ── Draw / update markers & colored trail on map ──────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    devices.forEach((device, deviceId) => {
      const existing = markersRef.current.get(deviceId);

      if (existing) {
        // Always set target position for smooth animation
        existing.targetPosition = device.position;

        // Re-render to update isActive state
        existing.root.render(
          <TooltipProvider>
            <DeviceMarker
              deviceId={device.name}
              lat={existing.currentPosition[1]}
              lng={existing.currentPosition[0]}
              isActive={selectedDeviceId === device.id}
              isOnline={device.isOnline}
            />
          </TooltipProvider>
        );
      } else {
        // Create marker for new device
        const el = document.createElement("div");
        const root = createRoot(el);
        root.render(
          <TooltipProvider>
            <DeviceMarker
              deviceId={device.name}
              lat={device.position[1]}
              lng={device.position[0]}
              isActive={selectedDeviceId === device.id}
              isOnline={device.isOnline}
            />
          </TooltipProvider>
        );
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(device.position)
          .addTo(mapRef.current!);
        markersRef.current.set(deviceId, {
          marker,
          root,
          currentPosition: device.position,
          targetPosition: device.position,
        });
      }

      const removeTrail = () => {
        const tracked = trailLayersRef.current.get(deviceId);
        if (!tracked) return;
        try {
          if (mapRef.current?.getLayer(tracked.layerId))
            mapRef.current.removeLayer(tracked.layerId);
          if (mapRef.current?.getLayer(tracked.offRoadLayerId))
            mapRef.current.removeLayer(tracked.offRoadLayerId);
          if (mapRef.current?.getSource(tracked.sourceId))
            mapRef.current.removeSource(tracked.sourceId);
        } catch { }
        trailLayersRef.current.delete(deviceId);
      };

      // ── Remove trail layers for non-selected devices ─────
      if (deviceId !== selectedDeviceId) {
        removeTrail();
        return;
      }

      // ── Trail for selected device only ─────────────────────
      const sourceId = `trail-source-${deviceId}`;
      const layerId = `trail-layer-${deviceId}`;
      const offRoadLayerId = `trail-offroad-layer-${deviceId}`;

      const tps = device.trailPoints;
      const drawCoords = trailCoordsRef.current.get(deviceId) ?? tps.map(tp => tp.position);

      if (drawCoords.length < 2) {
        removeTrail();
        return;
      }

      // Prefer the per-point hybrid data; fall back to an all-snapped track
      // (e.g. live trail without map matching) so the line still renders.
      const hybrid: HybridPoint[] =
        hybridTrailRef.current.get(deviceId) ??
        drawCoords.map((position) => ({ position, snapped: true }));
      const data = buildTrailFeatures(hybrid);

      const existingSource = mapRef.current?.getSource(sourceId) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (!existingSource) {
        mapRef.current?.addSource(sourceId, { type: "geojson", data });
        // Solid line for road-snapped stretches.
        mapRef.current?.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          filter: ["!", ["get", "offRoad"]],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": TRAIL_COLOR,
            "line-width": 5,
            "line-opacity": 0.85,
          },
        });
        // Dashed, dimmer line for raw off-road (private terrain) stretches.
        mapRef.current?.addLayer({
          id: offRoadLayerId,
          type: "line",
          source: sourceId,
          filter: ["get", "offRoad"],
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": TRAIL_COLOR,
            "line-width": 4,
            "line-opacity": 0.55,
            "line-dasharray": [1.5, 1.5],
          },
        });
        trailLayersRef.current.set(deviceId, { sourceId, layerId, offRoadLayerId });
      } else {
        existingSource.setData(data);
      }
    });
  }, [devices, selectedDeviceId, mapReady]);

  // ── Trail point indices for scrubber ────────────────────
  const trailIndices = useMemo(() => {
    if (!selectedDeviceId) return null;
    const trail = trailCoordsRef.current.get(selectedDeviceId);
    if (!trail || trail.length < 2) return null;
    return Array.from({ length: trail.length }, (_, i) => i);
  }, [selectedDeviceId, devices]);

  // ── Scrubber: draw ghost marker at position along trail ──
  useEffect(() => {
    if (!mapRef.current || !selectedDeviceId) return;
    const device = devices.get(selectedDeviceId);
    if (!device || device.trailPoints.length < 2) return;

    const trail = trailCoordsRef.current.get(selectedDeviceId);
    if (!trail || trail.length < 2) return;

    // Find point index based on scrubber percentage
    const targetIdx = Math.floor(scrubPct * (trail.length - 1));
    const pointIdx = Math.max(0, Math.min(targetIdx, trail.length - 1));
    const interp = trail[pointIdx];

    setScrubPoint({
      position: interp,
      timestamp: Date.now(),
      speed: 0,
      cumDistKm: pointIdx,
    });

    if (!scrubMarkerRef.current) {
      const el = document.createElement("div");
      el.style.cssText = `
        width:18px;height:18px;border-radius:50%;
        border:3px solid #fff;
        box-shadow:0 0 0 3px rgba(59,130,246,0.5);
        transition:background 0.2s;
      `;
      scrubMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat(interp)
        .addTo(mapRef.current!);
    } else {
      scrubMarkerRef.current.setLngLat(interp);
    }

    scrubMarkerRef.current.getElement().style.background = TRAIL_COLOR;
  }, [scrubPct, selectedDeviceId, devices]);

  // ── Remove ghost marker when device deselected ────────────
  useEffect(() => {
    if (!selectedDeviceId && scrubMarkerRef.current) {
      scrubMarkerRef.current.remove();
      scrubMarkerRef.current = null;
    }
  }, [selectedDeviceId]);

  // ── Process realtime WebSocket messages (always, for live tracking) ─────
  useEffect(() => {
    if (!lastMessages || lastMessages.size === 0) return;

    lastMessages.forEach((msg, deviceId) => {
      const newPos: [number, number] = [msg.longitude, msg.latitude];
      const markerRef = markersRef.current.get(deviceId);

      // Set target position for smooth animation
      if (markerRef) {
        markerRef.targetPosition = newPos;
      }
    });

    setDevices((prev) => {
      const next = new Map(prev);
      let changed = false;

      lastMessages.forEach((msg, deviceId) => {
        const existing = next.get(deviceId);

        const newPos: [number, number] = [msg.longitude, msg.latitude];
        const newTs = msg.timestamp ? new Date(msg.timestamp).getTime() : Date.now();
        const speedKmh = (msg.speed ?? 0) * 3.6;

        if (!existing) {
          // Alta: dispositivo que llega solo por WS (no estaba en el REST).
          next.set(deviceId, {
            id: deviceId,
            name: msg.deviceName || deviceId,
            position: newPos,
            speed: speedKmh,
            lastUpdate: new Date(newTs).toISOString(),
            timestamp: newTs,
            trail: [newPos],
            trailPoints: [{ position: newPos, timestamp: newTs, speed: speedKmh, cumDistKm: 0 }],
            totalDistance: 0,
            isMoving: speedKmh > 0,
            batteryLevel: 0,
            isOnline: true,
          });
          changed = true;
          return;
        }

        next.set(deviceId, {
          ...existing,
          position: newPos,
          speed: speedKmh,
          timestamp: newTs,
          lastUpdate: new Date(newTs).toISOString(),
          isMoving: speedKmh > 0,
        });
        changed = true;
      });

      return changed ? next : prev;
    });
  }, [lastMessages]);

  // ── Alta por WS: client:connected → toast ──────────────────────────
  useEffect(() => {
    if (connectedQueue.length === 0) return;

    connectedQueue.forEach((e) => {
      toast.success(`${e.deviceName || e.deviceId} se conectó`);
    });

    clearConnects();
  }, [connectedQueue, clearConnects]);

  // ── Baja por WS: client:disconnected → solo toast ──────────────────
  // No se elimina el device ni se cierra el panel: el vendedor sigue en el
  // mapa con su última posición conocida; el estado "vivo en WS" lo lleva
  // `liveDeviceIds` (store), que actualiza el StatChip a "Fuera de línea".
  useEffect(() => {
    if (disconnectedQueue.length === 0) return;

    disconnectedQueue.forEach((e) => {
      toast.error(`${e.deviceName || e.deviceId} se desconectó`, {
        description: e.reason ? `Motivo: ${e.reason}` : "Cliente fuera de línea",
      });
    });

    clearDisconnects();
  }, [disconnectedQueue, clearDisconnects]);

  // ── Timeline segments for the selected device ─────────────
  const timelineSegments = useMemo(() => {
    if (!selectedDeviceId) return [];
    const device = devices.get(selectedDeviceId);
    if (!device || device.trailPoints.length < 2) return [];

    const tps = device.trailPoints;
    const totalKm = tps[tps.length - 1].cumDistKm;
    if (totalKm === 0) return [];

    return tps.slice(1).map((tp, i) => {
      const prev = tps[i];
      const segKm = tp.cumDistKm - prev.cumDistKm;
      return {
        widthPct: (segKm / totalKm) * 100,
        color: TRAIL_COLOR,
        speed: tp.speed,
      };
    });
  }, [selectedDeviceId, devices]);

  // ── Derived values ────────────────────────────────────────
  const deviceList = Array.from(devices.values()).filter((d) => {
    const deviceName = String(d.name ?? d.id ?? "");
    return deviceName.toLowerCase().includes(searchQuery.toLowerCase());
  });
  const selectedDevice = selectedDeviceId
    ? devices.get(selectedDeviceId)
    : null;

  // ¿El device seleccionado está transmitiendo por el WS ahora mismo?
  const selectedIsLive = !!selectedDevice && wsConnected && liveDeviceIds.has(selectedDevice.id);

  const selectedTps = selectedDevice?.trailPoints ?? [];
  const tripDuration =
    selectedTps.length > 1
      ? selectedTps[selectedTps.length - 1].timestamp -
      selectedTps[0].timestamp
      : 0;

  // ── Handle device click ───────────────────────────────────
  const handleDeviceClick = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      setScrubPct(1);
      setHistoryError(null);
      setTrailLoadingStatus("idle");
      const device = devices.get(deviceId);
      if (device) {
        mapRef.current?.flyTo({
          center: device.position,
          zoom: 15,
          duration: 1200,
        });
      }
    },
    [devices]
  );

  const handleClosePanel = useCallback(() => {
    setSelectedDeviceId(null);
    setScrubPoint(null);
    setHistoryError(null);
    setTrailLoadingStatus("idle");
  }, []);

  const handleClearTrail = useCallback(() => {
    if (!selectedDeviceId) return;
    const tracked = trailLayersRef.current.get(selectedDeviceId);
    if (tracked) {
      try {
        if (mapRef.current?.getLayer(tracked.layerId))
          mapRef.current.removeLayer(tracked.layerId);
        if (mapRef.current?.getLayer(tracked.offRoadLayerId))
          mapRef.current.removeLayer(tracked.offRoadLayerId);
        if (mapRef.current?.getSource(tracked.sourceId))
          mapRef.current.removeSource(tracked.sourceId);
      } catch { }
      trailLayersRef.current.delete(selectedDeviceId);
    }
    trailCoordsRef.current.delete(selectedDeviceId);
    hybridTrailRef.current.delete(selectedDeviceId);
    setTrailLoadingStatus("idle");
    if (scrubMarkerRef.current) {
      scrubMarkerRef.current.remove();
      scrubMarkerRef.current = null;
    }
    setScrubPoint(null);
    setScrubPct(1);
    setDevices((prev) => {
      const next = new Map(prev);
      const existing = next.get(selectedDeviceId);
      if (!existing) return prev;
      next.set(selectedDeviceId, {
        ...existing,
        trail: [existing.position],
        trailPoints: [{ position: existing.position, timestamp: existing.timestamp, speed: existing.speed, cumDistKm: 0 }],
        totalDistance: 0,
      });
      return next;
    });
  }, [selectedDeviceId]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[92vh]">
      <div className="relative flex-1" style={{ width: "100%", height: "calc(100vh - 120px)" }}>
        {/* ── Left panel ──────────────────────────────────── */}
        <div
          className="absolute top-4 left-4 z-10 flex flex-col gap-3"
          style={{ width: 320, zIndex: 10 }}
        >
          {/* Search + device list */}
          <Card className="bg-background/95 backdrop-blur-sm shadow-xl">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                  <Car className="h-4 w-4" />
                  Dispositivos
                </CardTitle>
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${wsConnected ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-500"}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                  {wsConnected ? "En vivo" : "Conectando…"}
                </span>
              </div>

              <InputGroup className="w-full">
                <InputGroupInput
                  placeholder="Buscar dispositivo..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm"
                />
                <InputGroupAddon>
                  <MagnifyingGlass className="h-4 w-4" />
                </InputGroupAddon>
              </InputGroup>
            </CardHeader>

            {deviceList.length > 0 && (
              <CardContent className="pt-0 pb-3">
                <p className="text-xs text-muted-foreground mb-2">
                  {deviceList.length} dispositivo
                  {deviceList.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                  {deviceList.map((device) => {
                    const isSelected = selectedDeviceId === device.id;
                    return (
                      <button
                        key={device.id}
                        onClick={() => handleDeviceClick(device.id)}
                        className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${isSelected
                          ? "bg-brand-primary text-white shadow-md"
                          : "bg-muted/60 hover:bg-muted"
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-xs flex items-center gap-1.5">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {device.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs flex items-center gap-0.5 opacity-70">
                              <BatteryFull className="h-3 w-3" />
                              {fmtBattery(device.batteryLevel)}
                            </span>
                            <span
                              className={`w-2 h-2 rounded-full ${device.isOnline ? "bg-green-500" : "bg-gray-400 dark:bg-dark-text-muted"
                                }`}
                            />
                          </div>
                        </div>
                        <div
                          className={`text-xs mt-0.5 ${isSelected ? "text-white/70" : "text-muted-foreground"
                            }`}
                        >
                          {fmtTime(device.lastUpdate)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            )}

            {deviceList.length === 0 && (
              <CardContent className="pb-4 pt-1 text-center">
                <p className="text-xs text-muted-foreground">
                  {token ? "Cargando dispositivos…" : "Sin token configurado…"}
                </p>
              </CardContent>
            )}

            <CardContent className="pt-0 pb-3">
              <Button
                onClick={handleToggleGeofences}
                variant={showGeofences ? "default" : "outline"}
                size="sm"
                className="w-full text-xs"
              >
                <MapTrifoldIcon className="h-3.5 w-3.5" />
                {showGeofences ? "Ocultar geo-referencias" : "Mostrar geo-referencias"}
                {showGeofences ? (
                  <EyeSlashIcon className="h-3.5 w-3.5 ml-auto" />
                ) : (
                  <EyeIcon className="h-3.5 w-3.5 ml-auto" />
                )}
              </Button>
              {showGeofences && geofences.length === 0 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  No hay geo-referencias guardadas.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {selectedDevice && (
          <Card className="bg-background/95 backdrop-blur-sm shadow-xl absolute top-4 right-4 z-10 flex flex-col gap-3" style={{ width: 320 }}>
            <CardContent className="pt-3 pb-3 space-y-3">
              {/* Header */}
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  {loadingHistory ? (
                    <CircleNotchIcon className="h-4 w-4 animate-spin" />
                  ) : (
                    <Crosshair className="h-4 w-4" />
                  )}
                  {selectedDevice.name}
                </CardTitle>
                <button
                  onClick={handleClosePanel}
                  className="text-muted-foreground hover:text-foreground text-base leading-none rounded-full w-6 h-6 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Error message */}
              {historyError && (
                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border border-amber-200 dark:border-amber-400/20 rounded-lg px-3 py-2">
                  {historyError}
                </div>
              )}

              {/* Realtime connection status */}
              <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${wsConnected
                ? "bg-green-50 dark:bg-green-400/10 border-green-200 dark:border-green-400/20 text-green-600 dark:text-green-400"
                : "bg-red-50 dark:bg-red-400/10 border-red-200 dark:border-red-400/20 text-red-600 dark:text-red-400"
                }`}>
                <span className={`w-2 h-2 rounded-full ${wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />
                {wsConnected ? "Conectado — rastreando en vivo" : "Desconectado del servidor"}
              </div>

              {/* Stat chips */}
              <div className="grid grid-cols-2 gap-2">
                <StatChip
                  icon={<MapPinIcon className="h-3 w-3" />}
                  label="Última Hora"
                  value={`${format(new Date(selectedDevice.timestamp), "hh:mm:ss a")}`}
                  mono
                />
                <StatChip
                  icon={<CalendarIcon className="h-3 w-3" />}
                  label="Ultima Fecha"
                  value={`${format(new Date(selectedDevice.timestamp), "dd/MM/yyyy")}`}
                  mono
                />
                <StatChip
                  connected={selectedIsLive}
                  icon={
                    <span
                      className={`w-2 h-2 rounded-full ${selectedIsLive ? "bg-green-500 animate-pulse" : "bg-red-500"
                        }`}
                    />
                  }
                  label="WebSocket"
                  value={selectedIsLive ? "En línea" : "Fuera de línea"}
                  accent={selectedIsLive ? "#22c55e" : "#ef4444"}
                />
                <StatChip
                  icon={<Gauge className="h-3 w-3" />}
                  label="Velocidad"
                  value={`${selectedDevice.speed.toFixed(1)} km/h`}
                  accent={TRAIL_COLOR}
                />
              </div>

              {/* Date pickers */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Desde</p>
                  <Popover open={fromOpen} onOpenChange={setFromOpen}>
                    <PopoverTrigger
                      render={
                        <Button variant="outline" className="w-full" size="sm" />
                      }
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span className="text-xs truncate">{fmtDateDisplay(dateFrom)} {timeFrom.slice(0, 5)}</span>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        locale={es}
                        mode="single"
                        selected={parse(dateFrom, "yyyy-MM-dd", new Date())}
                        onSelect={(date) => {
                          if (date) setDateFrom(format(date, "yyyy-MM-dd"));
                        }}
                      />
                      <div className="border-t p-2">
                        <label className="text-xs font-medium text-muted-foreground">Hora</label>
                        <input
                          type="time"
                          step={1}
                          value={timeFrom}
                          onChange={(e) => setTimeFrom(e.target.value || "00:00:00")}
                          className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Hasta</p>
                  <Popover open={toOpen} onOpenChange={setToOpen}>
                    <PopoverTrigger
                      render={
                        <Button variant="outline" className="w-full" size="sm" />
                      }
                    >
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span className="text-xs truncate">{fmtDateDisplay(dateTo)} {timeTo.slice(0, 5)}</span>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        locale={es}
                        mode="single"
                        selected={parse(dateTo, "yyyy-MM-dd", new Date())}
                        onSelect={(date) => {
                          if (date) setDateTo(format(date, "yyyy-MM-dd"));
                        }}
                      />
                      <div className="border-t p-2">
                        <label className="text-xs font-medium text-muted-foreground">Hora</label>
                        <input
                          type="time"
                          step={1}
                          value={timeTo}
                          onChange={(e) => setTimeTo(e.target.value || "23:59:59")}
                          className="mt-1 w-full rounded-md border border-border bg-transparent px-2 py-1 text-xs"
                        />
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              {/* Load history button */}
              <div className="flex gap-2">
                <Button
                  onClick={() => fetchHistory(selectedDevice.id)}
                  disabled={loadingHistory}
                  variant={selectedDevice.trailPoints.length > 1 ? "outline" : "default"}
                  className="flex-1 text-xs"
                  size="sm"
                >
                  {loadingHistory ? (
                    <>
                      <CircleNotchIcon className="h-3.5 w-3.5 animate-spin" />
                      Cargando historial…
                    </>
                  ) : selectedDevice.trailPoints.length > 1 ? (
                    "Actualizar historial"
                  ) : (
                    "Cargar historial"
                  )}
                </Button>
                {selectedDevice.trailPoints.length > 1 && (
                  <Button
                    onClick={handleClearTrail}
                    variant="outline"
                    size="sm"
                    className="text-xs text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-400/10 border-red-200 dark:border-red-400/20"
                  >
                    Limpiar ruta
                  </Button>
                )}
              </div>

              {/* ── Timeline ──────────────────────────────── */}
              {timelineSegments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Línea de tiempo
                    </p>
                    {scrubPoint && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {fmtTime(scrubPoint.timestamp)}
                      </span>
                    )}
                  </div>

                  {/* Colored bar */}
                  <div className="relative">
                    <div
                      className="relative h-4 rounded-full overflow-hidden flex cursor-pointer"
                      style={{ background: "#1e293b" }}
                    >
                      {timelineSegments.map((seg, i) => (
                        <div
                          key={i}
                          style={{
                            width: `${seg.widthPct}%`,
                            background: seg.color,
                            opacity: 0.85,
                            minWidth: 1,
                          }}
                        />
                      ))}
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background: `linear-gradient(to right, transparent ${scrubPct * 100
                            }%, rgba(0,0,0,0.55) ${scrubPct * 100}%)`,
                        }}
                      />
                    </div>

                    {/* Thumb */}
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full border-2 border-white shadow-lg pointer-events-none transition-none"
                      style={{
                        left: `${scrubPct * 100}%`,
                        background: scrubPoint
                          ? TRAIL_COLOR
                          : "#3b82f6",
                        boxShadow: `0 0 0 3px ${scrubPoint
                          ? TRAIL_COLOR
                          : "#3b82f6"
                          }40`,
                      }}
                    />

                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.005}
                      value={scrubPct}
                      onChange={(e) =>
                        setScrubPct(parseFloat(e.target.value))
                      }
                      className="absolute inset-0 w-full opacity-0 cursor-grab active:cursor-grabbing"
                      style={{ height: "100%" }}
                    />
                  </div>

                  {/* Time labels row */}
                  {selectedTps.length > 1 && (
                    <div className="flex justify-between text-xs text-muted-foreground font-mono px-0.5">
                      <span>{fmtTime(selectedTps[0].timestamp)}</span>
                      <span>
                        {fmtTime(
                          selectedTps[Math.floor(selectedTps.length / 2)]
                            .timestamp
                        )}
                      </span>
                      <span>
                        {fmtTime(
                          selectedTps[selectedTps.length - 1].timestamp
                        )}
                      </span>
                    </div>
                  )}

                </div>
              )}

              {/* Fly to button */}
              <button
                onClick={() =>
                  mapRef.current?.flyTo({
                    center:
                      scrubPoint?.position ?? selectedDevice.position,
                    zoom: 17,
                    duration: 900,
                  })
                }
                className="w-full text-xs py-1.5 px-3 rounded-lg border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                Centrar en mapa
              </button>
            </CardContent>
          </Card>
        )}

        {/* ── Map ─────────────────────────────────────────── */}
        <div
          ref={mapContainer}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        />
      </div>
    </div>
  );
}