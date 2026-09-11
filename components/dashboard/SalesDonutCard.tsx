"use client"

import { useMemo, useEffect, useState, useRef } from "react"
import { Doughnut } from "react-chartjs-2"
import { Chart as ChartJS, ArcElement, Tooltip } from "chart.js"

import { SalesDonutTypes } from "@/types/dashboard"
import axios from "axios"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Target } from "@phosphor-icons/react"
import { useSession } from "next-auth/react"

ChartJS.register(ArcElement, Tooltip)

export default function SalesDonutCard() {
  const [data, setData] = useState<SalesDonutTypes | null>(null)
  const [loading, setLoading] = useState(true)
  const [goal, setGoal] = useState(20);
  const { data: session } = useSession()

  // Evitar doble fetch en desarrollo (Strict Mode)
  const calledRef = useRef(false)

  useEffect(() => {
    if (calledRef.current) return
    calledRef.current = true

    const fetchData = async () => {
      try {
        const response = await axios.get(`/api-proxy/api/Kpi/monthly/${session?.user.userId}`, {
          headers: {
            Authorization: `Bearer ${session?.user.token}`,
            'Content-Type': 'application/json',
          }
        })
        setData(response.data)
        console.log("KPI de ventas: ", response.data);
      } catch (error) {
        console.error("Error fetching donut data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Calcular porcentaje
  const percentage = useMemo(() => {
    if (!data?.total) return 0
    return Math.min((Number(data.total) / goal) * 100, 100)
  }, [data])

  // Datos para el Doughnut
  const chartData = useMemo(() => ({
    datasets: [
      {
        data: [Number(data?.total) || 0, Math.max(0, goal - (Number(data?.total) || 0))],
        backgroundColor: ["#ef4444", "#f3f3f3"],
        borderWidth: 0,
        cutout: "80%",
        radius: "90%",
      },
    ],
  }), [data])

  const options: any = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { enabled: false } },
    Tooltip: "Ventas Mensuales"
  }

  // Formatear fecha
  const lastUpdated = useMemo(() => {
    const now = new Date()
    const day = String(now.getDate()).padStart(2, "0")
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const year = now.getFullYear()
    let hours = now.getHours()
    const minutes = String(now.getMinutes()).padStart(2, "0")
    const ampm = hours >= 12 ? "PM" : "AM"
    hours = hours % 12 || 12
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`
  }, [data])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target size={20} className="text-gray-500 dark:text-dark-text-secondary" />
          <p className="text-sm font-semibold text-gray-500 dark:text-dark-text-secondary">
            Meta mensual {goal}M
          </p>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-center">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-500"></div>
          </div>
        ) : data ? (
          <>
            <div className="relative w-40 h-40 mx-auto">
              <Doughnut data={chartData} options={options} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-semibold">{percentage.toFixed(1)}%</span>
                <span className="text-xs text-gray-500 dark:text-dark-text-secondary text-center px-2">
                  {data.currency} {(data.total || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })} de {goal.toLocaleString()}
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-dark-text-muted mt-2 text-center">
              Actualizado: {lastUpdated}
            </p>
          </>
        ) : (
          <div className="text-center py-10 text-gray-500 dark:text-dark-text-secondary text-xs">
            No se pudieron cargar los datos de la meta.
          </div>
        )}
      </CardContent>
    </Card>
  )
}
