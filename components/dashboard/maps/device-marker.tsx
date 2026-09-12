"use client";

import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface DeviceMarkerProps {
  deviceId: string;
  lat: number;
  lng: number;
  heading?: number;
  isActive?: boolean;
  isMuted?: boolean;
  isOnline?: boolean;
}

const DeviceMarkerComponent = React.memo(function DeviceMarker({ deviceId, lat, lng, heading = 0, isActive, isMuted, isOnline = true }: DeviceMarkerProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`relative size-12 flex items-center justify-center cursor-pointer transition-all hover:scale-110 ${!isOnline ? "opacity-50" : ""} ${isActive ? "drop-shadow-[0_0_6px_rgba(59,130,246,0.9)]" : ""}`}
            data-heading-arrow
            style={{ transform: `rotate(${heading}deg)` }}
          >
            <img
              src="/car_up.png"
              alt=""
              className="size-12 object-contain"
              draggable={false}
            />
          </div>
        }
      >
      </TooltipTrigger>
      <TooltipContent>
        <div className="font-semibold">{deviceId}</div>
        <div className="text-muted-foreground text-xs">
          Lat: {Number.isFinite(lat) ? lat.toFixed(4) : "—"}, Lng: {Number.isFinite(lng) ? lng.toFixed(4) : "—"}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

export { DeviceMarkerComponent as DeviceMarker };