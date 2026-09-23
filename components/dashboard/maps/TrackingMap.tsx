"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { toast } from "sonner";
import { useSocketIO } from "@/lib/hooks/useSocketIO";
import { useDevicePositions } from "@/lib/hooks/useDevicePositions";
import { useDeviceRoute } from "@/lib/hooks/useDeviceRoute";
import {
  geoFeature,
  readGeoReferences,
  type GeoReference,
} from "@/lib/geo-references";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DeviceMarker } from "./device-marker";
import { DeviceListPanel } from "./DeviceListPanel";
import { DeviceDetailsPanel } from "./DeviceDetailsPanel";
import type { Device, DeviceMarkerRef } from "@/types/tracking";

const MAP_STYLE = "mapbox://styles/mapbox/streets-v11";

const TRAIL_COLOR = "#3b82f6";
const ROUTE_COLOR = "#3b82f6";
const ROUTE_SOURCE = "device-route";
const STOPS_SOURCE = "device-stops";
const STOPS_COLOR = "#8b5cf6";
const GEO_COLOR = "#8b5cf6";

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
  const [showGeofences, setShowGeofences] = useState(false);
  const [geofences, setGeofences] = useState<GeoReference[]>([]);
  const [showStops, setShowStops] = useState(true);

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
        root.unmount();
      });
      markersRef.current.clear();

      map.remove();
      resizeObserver.disconnect();
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
      } catch {}
    };

    if (!showGeofences || geofences.length === 0) {
      removeLayers();
      return;
    }

    const data: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: geofences.map(geoFeature),
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
  }, [showGeofences, geofences, mapReady]);

  // ── Dibujar / quitar la ruta y paradas en el mapa ────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const removeRoute = () => {
      try {
        if (map.getLayer(ROUTE_SOURCE)) map.removeLayer(ROUTE_SOURCE);
        if (map.getLayer(STOPS_SOURCE)) map.removeLayer(STOPS_SOURCE);
        if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);
        if (map.getSource(STOPS_SOURCE)) map.removeSource(STOPS_SOURCE);
      } catch {}
    };

    const removeStops = () => {
      try {
        if (map.getLayer(STOPS_SOURCE)) map.removeLayer(STOPS_SOURCE);
        if (map.getSource(STOPS_SOURCE)) map.removeSource(STOPS_SOURCE);
      } catch {}
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
    const stopsData: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: route.stops.map((s) => ({
        type: "Feature",
        properties: { inicio: s.inicio, fin: s.fin, duracionMin: s.duracionMin },
        geometry: { type: "Point", coordinates: s.position },
      })),
    };

    const upsert = (
      sourceId: string,
      layerId: string,
      data: GeoJSON.FeatureCollection,
      layerType: "line" | "circle",
      paint: Record<string, unknown>,
    ) => {
      const existing = map.getSource(sourceId) as
        | mapboxgl.GeoJSONSource
        | undefined;
      if (existing) {
        existing.setData(data);
      } else {
        map.addSource(sourceId, { type: "geojson", data });
        map.addLayer(
          layerType === "line"
            ? { id: layerId, type: "line", source: sourceId, paint }
            : { id: layerId, type: "circle", source: sourceId, paint },
        );
      }
    };

    upsert(ROUTE_SOURCE, ROUTE_SOURCE, lineData, "line", {
      "line-color": ROUTE_COLOR,
      "line-width": 4,
      "line-opacity": 0.85,
    });

    if (showStops && route.stops.length > 0) {
      upsert(STOPS_SOURCE, STOPS_SOURCE, stopsData, "circle", {
        "circle-color": STOPS_COLOR,
        "circle-radius": 5,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      });
    } else {
      removeStops();
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
  }, [route, showStops, mapReady]);

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
    <div className="relative flex-1" style={{ width: "100%", height: "100%" }}>
      <DeviceListPanel
        devices={deviceList}
        wsConnected={wsConnected}
        refreshing={refreshing}
        onRefresh={refresh}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        selectedDeviceId={selectedDeviceId}
        onDeviceClick={handleDeviceClick}
        showGeofences={showGeofences}
        geofenceCount={geofences.length}
        onToggleGeofences={handleToggleGeofences}
        showStops={showStops}
        onToggleStops={() => setShowStops((v) => !v)}
      />

      {selectedDevice && (
        <DeviceDetailsPanel
          device={selectedDevice}
          wsConnected={wsConnected}
          selectedIsLive={selectedIsLive}
          route={route}
          routeLoading={routeLoading}
          routeError={routeError}
          range={range}
          onRangeChange={setRange}
          showStops={showStops}
          onClose={handleClosePanel}
          onFlyTo={handleFlyTo}
        />
      )}

      {/* ── Map ─────────────────────────────────────────── */}
      <div
        ref={mapContainer}
        className="absolute inset-0"
        style={{ width: "100%", height: "100%", zIndex: 0 }}
      />
    </div>
  );
}