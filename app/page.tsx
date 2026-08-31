"use client";

import { Map, MapControls } from "@/components/ui/map";

export default function Home() {
  return (
    <div className="h-dvh w-full">
      <Map
        viewport={{ center: [-99.1332, 19.4326], zoom: 10 }}
        theme="light"
      >
        <MapControls
          position="bottom-right"
          showZoom
          showCompass
          showLocate
          showFullscreen
        />
      </Map>
    </div>
  );
}
