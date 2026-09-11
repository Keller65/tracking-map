import { create } from 'zustand'
import { io, Socket } from 'socket.io-client'

interface LocationMessage {
  deviceId: string
  deviceName: string
  latitude: number
  longitude: number
  speed?: number
  timestamp?: string
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

    socket.on('location', (data: LocationMessage) => {
      pendingUpdates.push(data)

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