"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { SignIn, SignOut, Clock, MapPin, Spinner, ClockCounterClockwise } from "@phosphor-icons/react"
import { toast } from "sonner"

interface CheckInOutRecord {
  type: "check-in" | "check-out"
  timestamp: string
  location?: { lat: number; lng: number }
}

const STORAGE_KEY = "check-in-out-data"

function getStoredData() {
  if (typeof window === "undefined") return null
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

function saveStoredData(data: unknown) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}



export default function CheckInOutBanner() {
  const [isCheckedIn, setIsCheckedIn] = useState(() => {
    const stored = getStoredData()
    return stored?.isCheckedIn ?? false
  })
  const [checkInTime, setCheckInTime] = useState<Date | null>(() => {
    const stored = getStoredData()
    return stored?.checkInTime ? new Date(stored.checkInTime) : null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [confirmAction, setConfirmAction] = useState<"check-in" | "check-out">("check-in")
  const [elapsedTime, setElapsedTime] = useState("00:00:00")
  const [history, setHistory] = useState<CheckInOutRecord[]>(() => {
    const stored = getStoredData()
    return stored?.history ?? []
  })
  const [showHistory, setShowHistory] = useState(false)

  useEffect(() => {
    if (!isCheckedIn || !checkInTime) return

    const updateElapsed = () => {
      const now = new Date()
      const diff = now.getTime() - checkInTime.getTime()
      const hours = Math.floor(diff / 3600000)
      const minutes = Math.floor((diff % 3600000) / 60000)
      const seconds = Math.floor((diff % 60000) / 1000)
      setElapsedTime(
        `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      )
    }

    updateElapsed()
    const interval = setInterval(updateElapsed, 1000)
    return () => clearInterval(interval)
  }, [isCheckedIn, checkInTime])

  const getCurrentLocation = useCallback((): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalización no soportada"))
        return
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      })
    })
  }, [])

  const processCheckInOut = async (type: "check-in" | "check-out") => {
    setIsLoading(true)

    let location: { lat: number; lng: number } | undefined

    try {
      const position = await getCurrentLocation()
      location = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      }
    } catch {
      toast.warning("Sin ubicación", {
        description: "No se pudo obtener tu ubicación. El check-in/out se registrará sin geolocalización.",
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 800))

    const now = new Date()
    const record: CheckInOutRecord = { type, timestamp: now.toISOString(), location }

    const newHistory = [...history, record].slice(-10)

    if (type === "check-in") {
      setIsCheckedIn(true)
      setCheckInTime(now)
      saveStoredData({ isCheckedIn: true, checkInTime: now.toISOString(), history: newHistory })
      toast.success("Check-in registrado", {
        description: `Entrada: ${now.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}`,
      })
    } else {
      setIsCheckedIn(false)
      setCheckInTime(null)
      saveStoredData({ isCheckedIn: false, checkInTime: null, history: newHistory })
      toast.success("Check-out registrado", {
        description: `Salida: ${now.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}`,
      })
    }

    setHistory(newHistory)
    setIsLoading(false)
  }

  const handleActionClick = (type: "check-in" | "check-out") => {
    setConfirmAction(type)
    setShowConfirmDialog(true)
  }

  const confirmCheckInOut = () => {
    setShowConfirmDialog(false)
    processCheckInOut(confirmAction)
  }

  const todayHistory = history.filter((record) => {
    const recordDate = new Date(record.timestamp).toDateString()
    return recordDate === new Date().toDateString()
  })

  return (
    <>
      {isCheckedIn ? (
        <Card className="bg-linear-to-r from-amber-50 to-orange-50 dark:from-amber-400/10 dark:to-orange-400/10 border-amber-200 dark:border-amber-400/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-400/20">
                  <Clock size={20} className="text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">En jornada activa</p>
                    {todayHistory.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-amber-600 hover:text-amber-800"
                      >
                        <ClockCounterClockwise size={12} />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-amber-600 dark:text-amber-400/80">
                    Check-in: {checkInTime?.toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <p className="text-xs font-mono text-amber-700 dark:text-amber-400 mt-0.5">{elapsedTime}</p>
                </div>
              </div>
              <Button
                onClick={() => handleActionClick("check-out")}
                variant="outline"
                disabled={isLoading}
                className="border-amber-300 dark:border-amber-400/20 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-400/10"
              >
                {isLoading ? (
                  <Spinner size={16} className="mr-2 animate-spin" />
                ) : (
                  <SignOut size={16} className="mr-2" />
                )}
                Check-out
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-400/10 dark:to-teal-400/10 border-emerald-200 dark:border-emerald-400/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-400/20">
                  <MapPin size={20} className="text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">Iniciar Jornada</p>
                    {todayHistory.length > 0 && (
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setShowHistory(!showHistory)}
                        className="text-emerald-600 hover:text-emerald-800"
                      >
                        <ClockCounterClockwise size={12} />
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400/80">Realiza tu check-in para comenzar</p>
                </div>
              </div>
              <Button
                onClick={() => handleActionClick("check-in")}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isLoading ? (
                  <Spinner size={16} className="mr-2 animate-spin" />
                ) : (
                  <SignIn size={16} className="mr-2" />
                )}
                Check-in
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showHistory && todayHistory.length > 0 && (
        <Card className="border-gray-200 dark:border-dark-raised">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-dark-text-secondary uppercase tracking-wider">Historial de hoy</p>
              <Button variant="ghost" size="icon-xs" onClick={() => setShowHistory(false)} className="text-gray-400 dark:text-dark-text-muted">
                ×
              </Button>
            </div>
            <div className="space-y-2">
              {todayHistory.map((record, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    {record.type === "check-in" ? (
                      <SignIn size={12} className="text-emerald-500" />
                    ) : (
                      <SignOut size={12} className="text-amber-500" />
                    )}
                    <span className="text-gray-600 dark:text-dark-text-secondary">{record.type === "check-in" ? "Entrada" : "Salida"}</span>
                  </div>
                  <span className="text-gray-500 dark:text-dark-text-secondary font-mono">
                    {new Date(record.timestamp).toLocaleTimeString("es-HN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === "check-in" ? "Confirmar Check-in" : "Confirmar Check-out"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === "check-in"
                ? "¿Estás seguro de que deseas iniciar tu jornada laboral? Se registrará tu ubicación y hora de entrada."
                : "¿Estás seguro de que deseas finalizar tu jornada laboral? Se registrará tu hora de salida."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCheckInOut} disabled={isLoading} className="bg-emerald-600 hover:bg-emerald-700">
              {isLoading ? (
                <>
                  <Spinner size={16} className="mr-2 animate-spin" />
                  Procesando...
                </>
              ) : confirmAction === "check-in" ? (
                "Iniciar Jornada"
              ) : (
                "Finalizar Jornada"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
