"use client";
import {
  Clock,
  MapPin,
  Path,
  Timer,
} from "@phosphor-icons/react";
interface VendorInfoPanelProps {
  kmRecorridos: number;
  checkIn: string;
  checkOut: string;
  tiempoTotal: string;
}
export function VendorInfoPanel({
  kmRecorridos,
  checkIn,
  checkOut,
  tiempoTotal,
}: VendorInfoPanelProps) {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-raised p-4 w-[90vw] max-w-150">
      <div className="grid grid-cols-4 gap-4">
        <div className="flex flex-col items-center text-center">
          <Path size={24} className="text-blue-500 mb-1" />
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
            Km Recorridos
          </span>
          <span className="text-lg font-semibold">{kmRecorridos} km</span>
        </div>
        <div className="flex flex-col items-center text-center">
          <MapPin size={24} className="text-green-500 mb-1" />
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
            Check In
          </span>
          <span className="text-lg font-semibold">{checkIn}</span>
        </div>
        <div className="flex flex-col items-center text-center">
          <MapPin size={24} className="text-red-500 mb-1" />
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
            Check Out
          </span>
          <span className="text-lg font-semibold">{checkOut}</span>
        </div>
        <div className="flex flex-col items-center text-center">
          <Timer size={24} className="text-purple-500 mb-1" />
          <span className="text-xs text-gray-500 dark:text-dark-text-secondary uppercase tracking-wide">
            Tiempo Total
          </span>
          <span className="text-lg font-semibold">{tiempoTotal}</span>
        </div>
      </div>
    </div>
  );
}