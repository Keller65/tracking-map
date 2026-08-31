"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Map, MapControls, MapRoute, type MapRef } from "@/components/ui/map";
import { UploadPanel, parseLngLats } from "@/components/upload-panel";

export default function Home() {
  const mapRef = useRef<MapRef>(null);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fitRoute = useCallback((coordinates: [number, number][]) => {
    const map = mapRef.current;
    if (!map || coordinates.length === 0) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const [lng, lat] of coordinates) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: 60, duration: 800, maxZoom: 16 },
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/route.geojson")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const coords = data?.features?.[0]?.geometry?.coordinates as
          | [number, number][]
          | undefined;
        if (Array.isArray(coords) && coords.length >= 2) {
          setRoute(coords);
          setFileName("route.geojson");
          setTimeout(() => fitRoute(coords), 300);
        }
      })
      .catch(() => {
        // No hay GeoJSON estático; el mapa queda vacío hasta subir un CSV.
      });
    return () => {
      cancelled = true;
    };
  }, [fitRoute]);

  return (
    <div className="relative h-dvh w-full">
      <Map
        ref={mapRef}
        viewport={{ center: [-99.1332, 19.4326], zoom: 10 }}
        theme="light"
      >
        {route.length >= 2 && (
          <MapRoute coordinates={route} color="#4285F4" width={4} opacity={0.85} />
        )}
        <MapControls
          position="bottom-right"
          showZoom
          showCompass
          showLocate
          showFullscreen
        />
      </Map>

      <UploadPanel
        fileName={fileName}
        pointCount={route.length}
        onFile={(text, name) => {
          const { coordinates } = parseLngLats(text);
          if (coordinates.length < 2) {
            setError(
              "El CSV no tiene suficientes puntos válidos (columnas lat/lng).",
            );
            setRoute([]);
            setFileName(null);
            return;
          }
          setError(null);
          setFileName(name);
          setRoute(coordinates);
          setTimeout(() => fitRoute(coordinates), 300);
        }}
        onError={setError}
        onClear={() => {
          setRoute([]);
          setFileName(null);
          setError(null);
        }}
      />

      {error && (
        <div className="bg-destructive text-destructive-foreground absolute top-4 right-4 z-10 rounded-md px-4 py-2 text-sm shadow-lg">
          {error}
        </div>
      )}
    </div>
  );
}
