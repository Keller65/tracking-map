'use client'

import { useEffect, useRef } from 'react'
import { useSocketIOStore } from '@/lib/store/store.socketio'

export function useSocketIO(url: string) {
  const isConnected = useSocketIOStore((state) => state.isConnected)
  const lastMessages = useSocketIOStore((state) => state.lastMessages)
  const liveDeviceIds = useSocketIOStore((state) => state.liveDeviceIds)
  const connectedQueue = useSocketIOStore((state) => state.connectedQueue)
  const clearConnects = useSocketIOStore((state) => state.clearConnects)
  const disconnectedQueue = useSocketIOStore((state) => state.disconnectedQueue)
  const clearDisconnects = useSocketIOStore((state) => state.clearDisconnects)
  const connectRef = useRef(useSocketIOStore.getState().connect)
  const disconnectRef = useRef(useSocketIOStore.getState().disconnect)
  const hasConnected = useRef(false)

  useEffect(() => {
    if (!hasConnected.current) {
      hasConnected.current = true
      connectRef.current(url)
    }
    
    return () => {
      disconnectRef.current()
      hasConnected.current = false
    }
  }, [url])

  return { isConnected, lastMessages, liveDeviceIds, connectedQueue, clearConnects, disconnectedQueue, clearDisconnects }
}