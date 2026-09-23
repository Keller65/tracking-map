"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";
import { Crosshair } from "@phosphor-icons/react";
import { useSocketIO } from "@/lib/hooks/useSocketIO";
import { useDevicePositions } from "@/lib/hooks/useDevicePositions";
import { useDeviceRoute } from "@/lib/hooks/useDeviceRoute";
import {
  createGeovalla,
  getGeovallas,
  type GeovallaFeature,
} from "@/lib/geovallas-api";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DeviceMarker } from "./device-marker";
import { DeviceListPanel } from "./DeviceListPanel";
import { DeviceDetailsPanel } from "./DeviceDetailsPanel";
import type { Device, DeviceMarkerRef } from "@/types/tracking";

const MAP_STYLE = "mapbox://styles/mapbox/streets-v11";

const TRAIL_COLOR = "#3b82f6";
const ROUTE_COLOR = "#3b82f6";
const ROUTE_SOURCE = "device-route";
const GEO_COLOR = "#8b5cf6";
const DRAFT_SOURCE = "geovalla-draft";
const DRAFT_LINE_ID = "geovalla-draft-line";
const DRAFT_FILL_ID = "geovalla-draft-fill";
const DRAFT_POINTS_ID = "geovalla-draft-points";

type LiveUpdate = {
  id: string;
  name?: string;
  position: [number, number];
  speedKmh: number;
  timestamp: number;
  battery: number;
};

// Tolerates the common WS payload shapes (camelCase / lowercase variants).
const normalizeMessage = (
  msg: Record<string, unknown>
): LiveUpdate | null => {
  const lng = Number(msg.longitude ?? msg.lng ?? msg.lon ?? NaN);
  const lat = Number(msg.latitude ?? msg.lat ?? NaN);
  const id = String(
    msg.deviceId ?? msg.deviceID ?? msg.device_id ?? msg.id ?? msg.androidId ?? ""
  );
  if (!id || !Number.isFinite(lng) || !Number.isFinite(lat)) return null;

  const rawTs = new Date(String(msg.timestamp ?? "")).getTime();
  const timestamp = Number.isFinite(rawTs) ? rawTs : Date.now();
  const speed = Number(msg.speed ?? 0);
  const battery = Number(msg.battery ?? msg.batteryLevel ?? 0);

  return {
    id,
    name: typeof msg.deviceName === "string" ? msg.deviceName : undefined,
    position: [lng, lat],
    speedKmh: (Number.isFinite(speed) ? speed : 0) * 3.6,
    timestamp,
    battery: Number.isFinite(battery) ? battery : 0,
  };
};

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export function TrackingMap() {
  // ── State ──────────────────────────────────────────────────
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [showGeovallas, setShowGeovallas] = useState(false);
  const [geovallasLoading, setGeovallasLoading] = useState(false);
  const [geovallas, setGeovallas] = useState<GeovallaFeature[]>([]);

  // ── Dibujo de geovallas ─────────────────────────────────
  const [drawing, setDrawing] = useState(false);
  const [drawVertices, setDrawVertices] = useState<[number, number][]>([]);
  const [drawName, setDrawName] = useState("");
  const [drawTipo, setDrawTipo] = useState("");
  const [drawSaving, setDrawSaving] = useState(false);
  const drawListenerRef = useRef<((e: mapboxgl.MapMouseEvent) => void) | null>(
    null,
  );

  const { devices, setDevices, refreshing, refresh } = useDevicePositions();
  const {
    route,
    routeLoading,
    routeError,
    range,
    setRange,
  } = useDeviceRoute(selectedDeviceId);

  // WebSocket for realtime tracking
  const wsHost =
    (typeof window !== "undefined" &&
      localStorage.getItem("settings:wsUrl")) ||
    process.env.NEXT_PUBLIC_WS_HOST ||
    "http://localhost:5050";
  const {
    isConnected: wsConnected,
    lastMessages,
    liveDeviceIds,
    connectedQueue,
    clearConnects,
    disconnectedQueue,
    clearDisconnects,
  } = useSocketIO(wsHost);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<
    Map<string, DeviceMarkerRef & { root: Root }>
  >(new Map());

  const animFrameRef = useRef<number | null>(null);

  // ── Smooth animation for marker movement in live mode ──────
  const animateRef = useRef<() => void>(null);
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
      map.resize();
      setMapReady(true);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapContainer.current);

    map.on("style.load", () => {
      map.setFog({
        color: "rgb(186, 210, 235)", // Lower atmosphere
        "high-color": "rgb(36, 92, 223)", // Upper atmosphere
        "horizon-blend": 0.02, // Atmosphere thickness (default 0.2 at low zooms)
        "space-color": "rgb(11, 11, 25)", // Background color
        "star-intensity": 0.6, // Background star brightness (default 0.35 at low zooms)
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
        queueMicrotask(() => root.unmount());
      });
      markersRef.current.clear();

      map.remove();
      resizeObserver.disconnect();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // ── Toggle geovallas (fetch desde el backend) ─────────────
  const handleToggleGeovallas = useCallback(() => {
    setShowGeovallas((prev) => !prev);
  }, []);

  // ── Cargar geovallas al activar el overlay ────────────────
  useEffect(() => {
    if (!showGeovallas) return;

    let cancelled = false;
    setGeovallasLoading(true);
    getGeovallas()
      .then((fc) => {
        if (!cancelled) setGeovallas(fc.features);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las geovallas.",
        );
        setShowGeovallas(false);
      })
      .finally(() => {
        if (!cancelled) setGeovallasLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [showGeovallas]);

  // ── Dibujar / quitar geovallas en el mapa ─────────────────
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

    if (!showGeovallas || geovallas.length === 0) {
      removeLayers();
      return;
    }

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: geovallas,
    };

    const existing = map.getSource(sourceId) as
      | mapboxgl.GeoJSONSource
      | undefined;
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
  }, [showGeovallas, geovallas, mapReady]);

  // ── Dibujo de geovalla: listener de clicks en el mapa ─────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handler = (e: mapboxgl.MapMouseEvent) => {
      setDrawVertices((prev) => [...prev, [e.lngLat.lng, e.lngLat.lat]]);
    };
    drawListenerRef.current = handler;

    if (drawing) {
      map.on("click", handler);
      map.getCanvas().style.cursor = "crosshair";
    } else {
      map.off("click", handler);
      map.getCanvas().style.cursor = "";
    }

    return () => {
      if (handler === drawListenerRef.current) {
        map.off("click", handler);
        map.getCanvas().style.cursor = "";
        drawListenerRef.current = null;
      }
    };
  }, [drawing, mapReady]);

  // ── Dibujo de geovalla: preview de línea / polígono / vértices ─
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const removeDraft = () => {
      try {
        if (map.getLayer(DRAFT_FILL_ID)) map.removeLayer(DRAFT_FILL_ID);
        if (map.getLayer(DRAFT_LINE_ID)) map.removeLayer(DRAFT_LINE_ID);
        if (map.getLayer(DRAFT_POINTS_ID)) map.removeLayer(DRAFT_POINTS_ID);
        if (map.getSource(DRAFT_SOURCE)) map.removeSource(DRAFT_SOURCE);
      } catch { }
    };

    if (!drawing || drawVertices.length === 0) {
      removeDraft();
      return;
    }

    const closed = drawVertices.length >= 3;
    const ring: [number, number][] = closed
      ? [...drawVertices, drawVertices[0]]
      : drawVertices;

    const lineData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: ring },
        },
        ...(closed
          ? [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [ring],
              } satisfies GeoJSON.Polygon,
            } as GeoJSON.Feature,
          ]
          : []),
      ],
    };

    const pointsData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: drawVertices.map((v) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: v },
      })),
    };

    const existing = map.getSource(DRAFT_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (existing && map.getLayer(DRAFT_FILL_ID)) {
      existing.setData({
        type: "FeatureCollection",
        features: [...lineData.features, ...pointsData.features],
      } as GeoJSON.FeatureCollection);
    } else {
      map.addSource(DRAFT_SOURCE, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [...lineData.features, ...pointsData.features],
        } as GeoJSON.FeatureCollection,
      });
      map.addLayer({
        id: DRAFT_FILL_ID,
        type: "fill",
        source: DRAFT_SOURCE,
        paint: { "fill-color": GEO_COLOR, "fill-opacity": 0.15 },
      });
      map.addLayer({
        id: DRAFT_LINE_ID,
        type: "line",
        source: DRAFT_SOURCE,
        paint: {
          "line-color": GEO_COLOR,
          "line-width": 2,
          "line-dasharray": [2, 1],
        },
      });
      map.addLayer({
        id: DRAFT_POINTS_ID,
        type: "circle",
        source: DRAFT_SOURCE,
        paint: {
          "circle-color": "#ffffff",
          "circle-radius": 4,
          "circle-stroke-width": 2,
          "circle-stroke-color": GEO_COLOR,
        },
      });
    }

    return removeDraft;
  }, [drawing, drawVertices, mapReady]);

  // ── Dibujo de geovalla: acciones ──────────────────────────
  const startDrawing = useCallback(() => {
    setDrawVertices([]);
    setDrawName("");
    setDrawTipo("");
    setDrawing(true);
  }, []);

  const cancelDrawing = useCallback(() => {
    setDrawVertices([]);
    setDrawing(false);
  }, []);

  const undoVertex = useCallback(() => {
    setDrawVertices((prev) => prev.slice(0, -1));
  }, []);

  const saveGeovalla = useCallback(async () => {
    if (drawVertices.length < 3) {
      toast.error("Dibuja al menos 3 puntos para cerrar el polígono.");
      return;
    }
    setDrawSaving(true);
    try {
      await createGeovalla({
        type: "Feature",
        properties: {
          nombre: drawName.trim() || undefined,
          tipo: drawTipo.trim() || undefined,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[...drawVertices, drawVertices[0]]],
        },
      });
      toast.success("Geovalla creada");
      cancelDrawing();
      // Refrescar y mostrar las geovallas del backend
      setGeovallasLoading(true);
      try {
        const fc = await getGeovallas();
        setGeovallas(fc.features);
        setShowGeovallas(true);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "No se pudieron cargar las geovallas.",
        );
      } finally {
        setGeovallasLoading(false);
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo crear la geovalla.",
      );
    } finally {
      setDrawSaving(false);
    }
  }, [drawVertices, drawName, drawTipo, cancelDrawing]);

  // ── Dibujar / quitar la ruta en el mapa ──────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const removeRoute = () => {
      try {
        if (map.getLayer(ROUTE_SOURCE)) map.removeLayer(ROUTE_SOURCE);
        if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
      } catch { }
    };

    if (!route || route.lines.length === 0) {
      removeRoute();
      return;
    }

    const lineData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: route.lines.map((coords) => ({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: coords },
      })),
    };

    const existing = map.getSource(ROUTE_SOURCE) as
      | mapboxgl.GeoJSONSource
      | undefined;
    if (existing) {
      existing.setData(lineData);
    } else {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: lineData });
      map.addLayer({
        id: ROUTE_SOURCE,
        type: "line",
        source: ROUTE_SOURCE,
        paint: {
          "line-color": ROUTE_COLOR,
          "line-width": 4,
          "line-opacity": 0.85,
        },
      });
    }

    let minLng = Infinity,
      minLat = Infinity,
      maxLng = -Infinity,
      maxLat = -Infinity;
    for (const coords of route.lines) {
      for (const [lng, lat] of coords) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }
    if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) {
      removeRoute();
      return;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 1200, maxZoom: 16 },
    );

    return removeRoute;
  }, [route, mapReady]);

  // ── Draw / update markers on map ──────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    devices.forEach((device, deviceId) => {
      const existing = markersRef.current.get(deviceId);

      const renderMarker = (
        root: Root,
        position: [number, number],
      ) => {
        root.render(
          <TooltipProvider>
            <DeviceMarker
              deviceId={device.name}
              lat={position[1]}
              lng={position[0]}
              isActive={selectedDeviceId === device.id}
              isOnline={device.isOnline}
            />
          </TooltipProvider>,
        );
      };

      if (existing) {
        // Always set target position for smooth animation
        existing.targetPosition = device.position;
        // Re-render to update isActive state
        renderMarker(existing.root, existing.currentPosition);
      } else {
        // Create marker for new device
        const el = document.createElement("div");
        const root = createRoot(el);
        renderMarker(root, device.position);
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

    const liveUpdates: LiveUpdate[] = [];
    lastMessages.forEach((msg, deviceId) => {
      const live = normalizeMessage({
        ...(msg as unknown as Record<string, unknown>),
        deviceId: msg.deviceId || deviceId,
      });
      if (live) liveUpdates.push(live);
    });

    if (liveUpdates.length === 0) return;

    liveUpdates.forEach((u) => {
      const markerRef = markersRef.current.get(u.id);

      // Set target position for smooth animation
      if (markerRef) {
        markerRef.targetPosition = u.position;
      }
    });

    setDevices((prev) => {
      const next = new Map(prev);
      let changed = false;

      liveUpdates.forEach((u) => {
        const existing = next.get(u.id);

        if (!existing) {
          // Alta: dispositivo que llega por WS (no estaba previamente).
          next.set(u.id, {
            id: u.id,
            name: u.name || u.id,
            position: u.position,
            speed: u.speedKmh,
            lastUpdate: new Date(u.timestamp).toISOString(),
            timestamp: u.timestamp,
            trail: [u.position],
            trailPoints: [
              {
                position: u.position,
                timestamp: u.timestamp,
                speed: u.speedKmh,
                cumDistKm: 0,
              },
            ],
            totalDistance: 0,
            isMoving: u.speedKmh > 0,
            batteryLevel: u.battery,
            isOnline: true,
          });
          changed = true;
          return;
        }

        next.set(u.id, {
          ...existing,
          position: u.position,
          speed: u.speedKmh,
          timestamp: u.timestamp,
          lastUpdate: new Date(u.timestamp).toISOString(),
          isMoving: u.speedKmh > 0,
          batteryLevel: u.battery,
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
  const selectedIsLive =
    !!selectedDevice && wsConnected && liveDeviceIds.has(selectedDevice.id);

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
    [devices],
  );

  const handleClosePanel = useCallback(() => {
    setSelectedDeviceId(null);
  }, []);

  const handleFlyTo = useCallback(() => {
    if (!selectedDevice) return;
    mapRef.current?.flyTo({
      center: selectedDevice.position,
      zoom: 17,
      duration: 900,
    });
  }, [selectedDevice]);

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div
      className="relative flex-1 flex overflow-hidden"
      style={{ width: "100%", height: "100%" }}
    >
      <DeviceListPanel
        devices={deviceList}
        wsConnected={wsConnected}
        refreshing={refreshing}
        onRefresh={refresh}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedDeviceId={selectedDeviceId}
        onDeviceClick={handleDeviceClick}
        showGeovallas={showGeovallas}
        geovallasLoading={geovallasLoading}
        geovallaCount={geovallas.length}
        onToggleGeovallas={handleToggleGeovallas}
        geovallaDrawing={drawing}
        onCreateGeovalla={drawing ? cancelDrawing : startDrawing}
      />

      {/* ── Map ─────────────────────────────────────────── */}
      <div className="relative flex-1">
        <div
          ref={mapContainer}
          className="absolute inset-0"
          style={{ width: "100%", height: "100%", zIndex: 0 }}
        />

        {/* ── Panel de dibujo de geovalla (modal) ─────────── */}
        {drawing && (
          <div
            className="absolute bottom-4 left-1/2 w-[360px] -translate-x-1/2"
            style={{ zIndex: 50 }}
          >
            <Card className="bg-background/95 border-border shadow-xl backdrop-blur-sm">
              <CardContent className="space-y-3 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Haz clic en el mapa para agregar vértices del polígono (
                  {drawVertices.length} punto
                  {drawVertices.length !== 1 ? "s" : ""}).
                </p>
                {drawVertices.length >= 3 && (
                  <div className="space-y-2">
                    <Input
                      value={drawName}
                      onChange={(e) => setDrawName(e.target.value)}
                      maxLength={200}
                      placeholder="Nombre de la geovalla"
                      className="h-8 text-xs"
                    />
                    <Input
                      value={drawTipo}
                      onChange={(e) => setDrawTipo(e.target.value)}
                      maxLength={50}
                      placeholder="Tipo (ej. zona, sede)"
                      className="h-8 text-xs"
                    />
                    <Button
                      onClick={saveGeovalla}
                      disabled={drawSaving}
                      size="sm"
                      className="w-full"
                    >
                      {drawSaving ? "Creando…" : "Crear geovalla"}
                    </Button>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={undoVertex}
                    disabled={drawVertices.length === 0}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    Deshacer
                  </Button>
                  <Button
                    onClick={cancelDrawing}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* ── Columna dedicada: datos / detalles del tracking ── */}
      <aside
        className="relative shrink-0 border-l border-border bg-background z-10"
        style={{ width: 320 }}
      >
        {selectedDevice ? (
          <DeviceDetailsPanel
            device={selectedDevice}
            wsConnected={wsConnected}
            selectedIsLive={selectedIsLive}
            route={route}
            routeLoading={routeLoading}
            routeError={routeError}
            range={range}
            onRangeChange={setRange}
            onClose={handleClosePanel}
            onFlyTo={handleFlyTo}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
            <Crosshair className="h-6 w-6 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">
              No hay dispositivo seleccionado
            </p>
            <p className="text-xs text-muted-foreground/80">
              Elige un dispositivo para ver sus datos y el seguimiento en vivo.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}