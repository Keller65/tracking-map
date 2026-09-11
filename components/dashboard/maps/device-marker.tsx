"use client";

import React from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TruckIcon } from "@phosphor-icons/react";

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
  const getBgColor = () => {
    if (!isOnline) return "bg-gray-400 dark:bg-gray-400";
    if (isActive) return "bg-brand-primary";
    return "bg-brand-primary";
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <div
            className={`relative size-12 p-2 ${getBgColor()} rounded-full flex items-center justify-center cursor-pointer transition-all hover:scale-110 text-white`}
            data-heading-arrow
            style={{ transform: `rotate(${heading}deg)` }}
          />
        }
      >
        <TruckIcon size={24} weight="fill" />
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