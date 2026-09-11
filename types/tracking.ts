import type { Marker } from 'mapbox-gl';

export type TrailPoint = {
  position: [number, number];
  timestamp: number;
  speed: number;
  cumDistKm: number;
}

export type Device = {
  id: string;
  name: string;
  position: [number, number];
  speed: number;
  lastUpdate: string;
  timestamp: number;
  trail: [number, number][];
  trailPoints: TrailPoint[];
  totalDistance: number;
  isMoving: boolean;
  batteryLevel: number;
  isOnline: boolean;
}

export type DeviceMarkerRef = {
  marker: mapboxgl.Marker;
  currentPosition: [number, number];
  targetPosition: [number, number];
}

export type GpsLastDevice = {
  id: number;
  slpCode: string;
  slpName: string;
  androidId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number;
  heading: number;
  activity: string;
  batteryLevel: number;
  batteryState: string;
  isMocked: boolean;
  isMoving: boolean;
  gpsTimestamp: string;
  lastSeenAt: string;
  isOnline: boolean;
}

export type GpsHistoryPoint = {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number;
  speed: number;
  heading: number;
  gpsTimestamp: string;
}