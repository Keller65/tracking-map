"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSocketIO } from "@/lib/hooks/useSocketIO";
import { format } from "date-fns";
import { createRoot, Root } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StatChip } from "@/components/dashboard/maps/StatChip";
import { DeviceMarker } from "@/components/dashboard/maps/device-marker";
import { Car, MapPin, Gauge, MagnifyingGlass, Crosshair, BatteryFull, CalendarIcon, MapPinIcon, MapTrifoldIcon, EyeIcon, EyeSlashIcon, } from "@phosphor-icons/react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Device, DeviceMarkerRef } from "@/types/tracking";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default function Page() {
  // ── State ──────────────────────────────────────────────────
  const [devices, setDevices] = useState<Map<string, Device>>(new Map());
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<GeoReference[]>([]);

  // WebSocket for realtime tracking
  const wsHost = (typeof window !== "undefined" && localStorage.getItem("settings:wsUrl")) || process.env.NEXT_PUBLIC_WS_HOST || "http://localhost:5050";
  const { isConnected: wsConnected, lastMessages, liveDeviceIds, connectedQueue, clearConnects, disconnectedQueue, clearDisconnects } = useSocketIO(wsHost);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, DeviceMarkerRef & { root: Root }>>(new Map());

  const animFrameRef = useRef<number | null>(null);

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

  // ── Draw / update markers on map ──────────────────────────
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
    });
  }, [devices, selectedDeviceId, mapReady]);

  // ── Process realtime WebSocket messages ───────────────────
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
          // Alta: dispositivo que llega solo por WS (no estaba previamente).
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

  // ── Alta por WS: client:connected → toast ─────────────────
  useEffect(() => {
    if (connectedQueue.length === 0) return;

    connectedQueue.forEach((e) => {
      toast.success(`${e.deviceName || e.deviceId} se conectó`);
    });

    clearConnects();
  }, [connectedQueue, clearConnects]);

  // ── Baja por WS: client:disconnected → solo toast ─────────
  useEffect(() => {
    if (disconnectedQueue.length === 0) return;

    disconnectedQueue.forEach((e) => {
      toast.error(`${e.deviceName || e.deviceId} se desconectó`, {
        description: e.reason ? `Motivo: ${e.reason}` : "Cliente fuera de línea",
      });
    });

    clearDisconnects();
  }, [disconnectedQueue, clearDisconnects]);

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

  // ── Handle device click ───────────────────────────────────
  const handleDeviceClick = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
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
  }, []);

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
                  {wsConnected ? "Esperando dispositivos…" : "Conectando al servidor…"}
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
                  <Crosshair className="h-4 w-4" />
                  {selectedDevice.name}
                </CardTitle>
                <button
                  onClick={handleClosePanel}
                  className="text-muted-foreground hover:text-foreground text-base leading-none rounded-full w-6 h-6 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  ✕
                </button>
              </div>

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

              {/* Fly to button */}
              <button
                onClick={() =>
                  mapRef.current?.flyTo({
                    center: selectedDevice.position,
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