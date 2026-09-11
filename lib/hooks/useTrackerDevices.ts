"use client";

import { useEffect, useRef, useState } from "react";
import {
  LocationClient,
  ListDevicePositionsCommand,
  GetDevicePositionHistoryCommand,
} from "@aws-sdk/client-location";
import { withIdentityPoolId } from "@aws/amazon-location-utilities-auth-helper";

const REGION = "us-east-1";
const TRACKER = "isync-tracker";
const IDENTITY_POOL_ID = "us-east-1:ad30c23e-3557-4675-9089-6b628cf1a684";

type Device = {
  id: string;
  position: [number, number];
  speed?: number;
  history: [number, number][];
  timestamps?: Date[];
};

function getDate30DaysAgo(): Date {
  const date = new Date();
  date.setDate(date.getDate() - 30);
  return date;
}

export function useTrackerDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [, setLoaded] = useState(false);
  const clientRef = useRef<LocationClient | null>(null);

  async function getClient() {
    if (!clientRef.current) {
      const authHelper = await withIdentityPoolId(IDENTITY_POOL_ID);

      clientRef.current = new LocationClient({
        region: REGION,
        ...authHelper.getLocationClientConfig(),
      });
    }

    return clientRef.current;
  }

  async function fetchDevices() {
    try {
      const client = await getClient();

      const res = await client.send(
        new ListDevicePositionsCommand({
          TrackerName: TRACKER,
        })
      );

      const list = res.Entries || [];

      const updatedDevices: Device[] = [];

      for (const d of list) {
        if (!d.DeviceId || !d.Position) continue;

        const startTime = getDate30DaysAgo();
        let allPositions: [number, number][] = [];
        let allTimestamps: Date[] = [];
        let nextToken: string | undefined;

        do {
          const historyRes = await client.send(
            new GetDevicePositionHistoryCommand({
              TrackerName: TRACKER,
              DeviceId: d.DeviceId,
              MaxResults: 100,
              StartTimeInclusive: startTime,
              NextToken: nextToken,
            })
          );

          const positions = historyRes.DevicePositions || [];
          allPositions = [...allPositions, ...positions.map(p => p.Position as [number, number])];
          if (!allTimestamps) allTimestamps = [];
          allTimestamps = [...allTimestamps, ...positions.map(p => p.SampleTime).filter((t): t is Date => !!t)];
          nextToken = historyRes.NextToken;

        } while (nextToken);

        console.log(`📍 ${d.DeviceId}: ${allPositions.length} posiciones de los últimos 30 días`);

        updatedDevices.push({
          id: d.DeviceId,
          position: d.Position as [number, number],
          speed: d.SampleTime ? undefined : undefined,
          history: allPositions,
          timestamps: allTimestamps,
        });
      }

      console.log("📍 Total dispositivos:", updatedDevices.length);
      console.log("📍 Datos completos:", updatedDevices);
      setLoaded(true);
      
      setDevices(updatedDevices);
    } catch (err) {
      console.error("AWS error", err);
    }
  }

  useEffect(() => {
    fetchDevices();
  }, []);

  return devices;
}