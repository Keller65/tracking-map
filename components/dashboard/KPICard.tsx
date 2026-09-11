"use client"

import { ArrowDown, ArrowUp, TrendUp } from "@phosphor-icons/react"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import axios from "axios"
import { Card, CardContent, CardHeader } from "@/components/ui/card"

// Definición de tipos
interface VentasData {
  title: string
  Ventas: number
  currency: string
  Cobros: number
  delta: number
  deltaType: "up" | "down"
  deltaLabel: string
  mesVentas: string
  mesCobros: string
}

interface KpiApiResponse {
  ventas: VentasData
}

export default function KPICardApi() {
  const { data: session } = useSession()
  const salesPersonCode = session?.user?.salesPersonCode ?? null
  const fullName = session?.user?.fullName ?? null
  const token = session?.user?.token ?? null
  const [data, setData] = useState<KpiApiResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      if (!salesPersonCode || !token) return

      try {
        setLoading(true)
        // Usamos el Proxy definido en next.config.ts para evitar CORS
        const response = await axios.get<KpiApiResponse>(
          `/api-proxy/api/Kpi/sales-vs-collections/${salesPersonCode}`,
          {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        )
        setData(response.data)
      } catch (error) {
        console.error("Error cargando KPI:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [salesPersonCode, token])

  // Estado de carga (Loading skeleton)
  if (loading || !data || !data.ventas) {
    return (
      <Card>
        <CardHeader className="pb-2 space-y-3">
          <div className="h-6 w-3/4 bg-gray-200 dark:bg-dark-raised rounded-full" />
          <div className="h-6 w-1/2 bg-gray-200 dark:bg-dark-raised rounded-full" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-full bg-gray-200 dark:bg-dark-raised rounded-full" />
          <div className="h-4 w-5/6 bg-gray-200 dark:bg-dark-raised rounded-full" />
        </CardContent>
      </Card>
    )
  }

  const { ventas } = data
  const isDeltaUp = ventas.deltaType === "up"
  const deltaColor = isDeltaUp ? "text-green-500" : "text-red-500"
  const DeltaIcon = isDeltaUp ? ArrowUp : ArrowDown

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <TrendUp size={20} className="text-gray-500 dark:text-dark-text-secondary" />
          <p className="text-sm font-semibold text-gray-500 dark:text-dark-text-secondary">
            Ventas vs Cobros
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="absolute top-4 right-4">
          <div className={`p-1 rounded-full ${isDeltaUp ? 'bg-green-50 dark:bg-green-400/10' : 'bg-red-50 dark:bg-red-400/10'}`}>
            <DeltaIcon size={24} className={deltaColor} />
          </div>
        </div>
        <p className={`text-sm font-semibold ${deltaColor}`}>
          Ventas: {ventas.Ventas.toLocaleString()} {ventas.currency}
        </p>
        <h3 className="text-xl font-bold text-gray-800 dark:text-dark-text-primary">
          {fullName || "Usuario"}
        </h3>
        
        <div className="flex justify-between items-end">
          <div>
            <p className="text-xs text-gray-500 dark:text-dark-text-secondary font-medium uppercase tracking-wide mb-1">
              {ventas.mesVentas} - {ventas.mesCobros}
            </p>
            <p className="text-2xl font-bold text-gray-900 dark:text-dark-text-primary">
              {ventas.Ventas.toLocaleString()} {ventas.currency}
            </p>
          </div>

          <div className="text-right">
            <p className={`text-lg font-bold flex items-center justify-end gap-1 ${deltaColor}`}>
              {isDeltaUp ? "+" : ""}{ventas.delta}%
            </p>
            <p className={`text-sm font-medium ${deltaColor} opacity-80`}>
              Cobrado: {ventas.Cobros.toLocaleString()} {ventas.currency}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}