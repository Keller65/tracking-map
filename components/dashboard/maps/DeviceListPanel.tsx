"use client";

import {
  ArrowsClockwiseIcon,
  BatteryFull,
  Car,
  EyeIcon,
  EyeSlashIcon,
  MagnifyingGlass,
  MapPin,
  MapTrifoldIcon,
} from "@phosphor-icons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { fmtBattery, fmtTime } from "@/lib/format";
import type { Device } from "@/types/tracking";

type DeviceListPanelProps = {
  devices: Device[];
  wsConnected: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  searchQuery: string;
  onSearchQueryChange: (v: string) => void;
  selectedDeviceId: string | null;
  onDeviceClick: (id: string) => void;
  showGeofences: boolean;
  geofenceCount: number;
  onToggleGeofences: () => void;
};

export function DeviceListPanel({
  devices,
  wsConnected,
  refreshing,
  onRefresh,
  searchQuery,
  onSearchQueryChange,
  selectedDeviceId,
  onDeviceClick,
  showGeofences,
  geofenceCount,
  onToggleGeofences,
}: DeviceListPanelProps) {
  return (
    <div
      className="absolute top-4 left-4 z-10 flex flex-col gap-3"
      style={{ width: 320, zIndex: 10 }}
    >
      <Card className="bg-background/95 backdrop-blur-sm shadow-xl">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between mb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
              <Car className="h-4 w-4" />
              Dispositivos
            </CardTitle>
            <div className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                  wsConnected
                    ? "bg-green-500/15 text-green-600"
                    : "bg-red-500/15 text-red-500"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    wsConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
                  }`}
                />
                {wsConnected ? "En vivo" : "Conectando…"}
              </span>
              <Button
                onClick={onRefresh}
                variant="outline"
                size="icon"
                className="h-6 w-6 text-muted-foreground"
                disabled={refreshing}
                aria-label="Refrescar posiciones"
                title="Refrescar posiciones"
              >
                <ArrowsClockwiseIcon
                  className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </div>

          <InputGroup className="w-full">
            <InputGroupInput
              placeholder="Buscar dispositivo..."
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="text-sm"
            />
            <InputGroupAddon>
              <MagnifyingGlass className="h-4 w-4" />
            </InputGroupAddon>
          </InputGroup>
        </CardHeader>

        {devices.length > 0 && (
          <CardContent className="pt-0 pb-3">
            <p className="text-xs text-muted-foreground mb-2">
              {devices.length} dispositivo
              {devices.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
              {devices.map((device) => {
                const isSelected = selectedDeviceId === device.id;
                return (
                  <button
                    key={device.id}
                    onClick={() => onDeviceClick(device.id)}
                    className={`w-full text-left p-2.5 rounded-lg transition-all duration-150 ${
                      isSelected
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
                          className={`w-2 h-2 rounded-full ${
                            device.isOnline
                              ? "bg-green-500"
                              : "bg-gray-400 dark:bg-dark-text-muted"
                          }`}
                        />
                      </div>
                    </div>
                    <div
                      className={`text-xs mt-0.5 ${
                        isSelected
                          ? "text-white/70"
                          : "text-muted-foreground"
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

        {devices.length === 0 && (
          <CardContent className="pb-4 pt-1 text-center">
            <p className="text-xs text-muted-foreground">
              {wsConnected
                ? "Esperando dispositivos…"
                : "Conectando al servidor…"}
            </p>
          </CardContent>
        )}

        <CardContent className="pt-0 pb-3">
          <Button
            onClick={onToggleGeofences}
            variant={showGeofences ? "default" : "outline"}
            size="sm"
            className="w-full text-xs"
          >
            <MapTrifoldIcon className="h-3.5 w-3.5" />
            {showGeofences
              ? "Ocultar geo-referencias"
              : "Mostrar geo-referencias"}
            {showGeofences ? (
              <EyeSlashIcon className="h-3.5 w-3.5 ml-auto" />
            ) : (
              <EyeIcon className="h-3.5 w-3.5 ml-auto" />
            )}
          </Button>
          {showGeofences && geofenceCount === 0 && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              No hay geo-referencias guardadas.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}