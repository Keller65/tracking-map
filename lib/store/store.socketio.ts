import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

interface LocationMessage {
  deviceId: string
  deviceName: string
  latitude: number
  longitude: number
  speed?: number
  timestamp?: string | number
}

function normalizeLocationMessage(data: unknown): LocationMessage | null {
  if (!data || typeof data !== 'object') return null

  const payload = data as Record<string, unknown>
  const properties = payload.properties && typeof payload.properties === 'object'
    ? payload.properties as Record<string, unknown>
    : {}
  const geometry = payload.geometry && typeof payload.geometry === 'object'
    ? payload.geometry as Record<string, unknown>
    : {}
  const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : []
  const raw = properties._raw && typeof properties._raw === 'object'
    ? properties._raw as Record<string, unknown>
    : {}

  // Prioridad: _raw (fix del dispositivo) > coordenadas emitidas > top-level
  const longitude = Number(raw.longitude ?? payload.longitude ?? payload.lng ?? properties.longitude ?? coordinates[0])
  const latitude = Number(raw.latitude ?? payload.latitude ?? payload.lat ?? properties.latitude ?? coordinates[1])
  const deviceId = String(payload.deviceId ?? payload.deviceID ?? properties.deviceId ?? properties.deviceID ?? '')

  if (!deviceId || !Number.isFinite(longitude) || !Number.isFinite(latitude)) return null

  return {
    deviceId,
    deviceName: String(payload.deviceName ?? properties.deviceName ?? deviceId),
    latitude,
    longitude,
    speed: Number(payload.speed ?? properties.speed ?? 0),
    timestamp: payload.timestamp as string | number | undefined ?? properties.timestamp as string | number | undefined,
  }
}

interface ConnectionEvent {
  deviceId: string
  deviceName: string
  reason?: string
  at: number
}

interface SocketIOState {
  socket: Socket | null
  isConnected: boolean
  lastMessages: Map<string, LocationMessage>
  liveDeviceIds: Set<string>
  connectedQueue: ConnectionEvent[]
  disconnectedQueue: ConnectionEvent[]
  connect: (url: string) => void
  disconnect: () => void
  clearConnects: () => void
  clearDisconnects: () => void
}

let throttleTimeout: NodeJS.Timeout | null = null
let pendingUpdates: LocationMessage[] = []
let isConnecting = false

export const useSocketIOStore = create<SocketIOState>((set, get) => ({
  socket: null,
  isConnected: false,
  lastMessages: new Map(),
  liveDeviceIds: new Set(),
  connectedQueue: [],
  disconnectedQueue: [],

  connect: (url) => {
    if (isConnecting) return

    const { socket: existingSocket } = get()
    if (existingSocket?.connected) {
      return
    }

    isConnecting = true

    if (existingSocket) {
      existingSocket.disconnect()
    }

    const socket = io(url, {
      path: "/socket.io/",
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 5000,
    })

    socket.on('connect', () => {
      console.log('Socket.IO conectado')
      isConnecting = false
      set({ isConnected: true, socket })
    })

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO desconectado:', reason)
      set({ isConnected: false })
    })

    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message)
      isConnecting = false
    })

    socket.on('error', (error) => {
      console.error('Socket.IO error:', error)
    })

    socket.on('client:connected', (data: ConnectionEvent) => {
      // No trae lat/lng: el alta real ocurre con el primer evento `location`.
      console.log(`🟢 conectado: ${data.deviceName ?? data.deviceId}`)
      const live = new Set(get().liveDeviceIds)
      live.add(data.deviceId)
      set({ connectedQueue: [...get().connectedQueue, data], liveDeviceIds: live })
    })

    socket.on('client:disconnected', (data: ConnectionEvent) => {
      console.log(`🔴 desconectado: ${data.deviceName ?? data.deviceId} (${data.reason ?? 'sin motivo'})`)
      const live = new Set(get().liveDeviceIds)
      live.delete(data.deviceId)
      set({ disconnectedQueue: [...get().disconnectedQueue, data], liveDeviceIds: live })
    })

    socket.on('location', (data: unknown) => {
      const location = normalizeLocationMessage(data)
      if (!location) return

      pendingUpdates.push(location)

      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          if (pendingUpdates.length > 0) {
            const batch = new Map<string, LocationMessage>()

            for (let i = pendingUpdates.length - 1; i >= 0; i--) {
              const msg = pendingUpdates[i]
              batch.set(msg.deviceId, msg)
            }
            pendingUpdates = []

            // Un device que transmite ubicación está vivo en el WS
            const live = new Set(get().liveDeviceIds)
            let liveChanged = false
            batch.forEach((_, id) => {
              if (!live.has(id)) { live.add(id); liveChanged = true }
            })

            set(liveChanged ? { lastMessages: batch, liveDeviceIds: live } : { lastMessages: batch })
          }
          throttleTimeout = null
        }, 100)
      }
    })
  },

  disconnect: () => {
    const { socket } = get()
    if (socket) {
      socket.disconnect()
    }
    pendingUpdates = []
    if (throttleTimeout) {
      clearTimeout(throttleTimeout)
      throttleTimeout = null
    }
    set({ socket: null, isConnected: false, lastMessages: new Map(), liveDeviceIds: new Set(), connectedQueue: [], disconnectedQueue: [] })
  },

  clearConnects: () => set({ connectedQueue: [] }),
  clearDisconnects: () => set({ disconnectedQueue: [] }),
}))