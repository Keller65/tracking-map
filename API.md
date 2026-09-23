# Contrato de API para Front-End (GET)

Todas las respuestas de consulta son **GeoJSON (RFC 7946)**: un `FeatureCollection` con `features[]`. Cada `Feature` tiene `geometry` y `properties`.

**Base URL**: `http://localhost:5050` (prod: según deploy).
**Sin persistencia PostGIS** (no hay `DATABASE_URL`), todos los endpoints de consulta responden **503**.

---

## 1. `GET /health`

Estado del server. Sin parámetros.

```json
{ "status": "ok", "uptime": 123.45, "pid": 1234 }
```

---

## 2. `GET /api/ultimas-posiciones`

Última posición de cada dispositivo (snapshot en vivo del dashboard). **Sin parámetros.**

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-58.3816, -34.6037] },
      "properties": {
        "deviceId": "batch-device",
        "deviceCode": "code-123",
        "deviceName": "Camión 5",
        "ts": "2026-09-23T12:00:00Z",
        "receivedAt": "2026-09-23T12:00:01Z",
        "speed": 45.2,
        "accuracy": 8.0,
        "altitude": 25.0,
        "heading": 90.0
      }
    }
  ]
}
```

`speed/accuracy/altitude/heading` pueden venir `null` (undefined en JSON) si el fix no los traía. `coordinates` es `[lng, lat]`.

---

## 3. `GET /api/ubicaciones`

Historial de **puntos crudos** de uno o más dispositivos en un rango de fechas. Un Feature LineString por dispositivo, puntos en orden cronológico. Sin interpolación ni filtrado.

### Parámetros (query)

| Parámetro | Obligatorio | Tipo | Default | Descripción |
|---|---|---|---|---|
| `deviceId` | ✅ | string | — | Identificador del dispositivo. **Obligatorio.** |
| `desde` | ❌ | date-time (ISO 8601) | hace 30 días | Inicio del rango. |
| `hasta` | ❌ | date-time (ISO 8601) | ahora | Fin del rango. |
| `limit` | ❌ | int | `1000` | Máx de Features a devolver. Se clampea a 1–10000. |
| `format` | ❌ | `"polyline"` | `"geojson"` | Con `"polyline"` omite `geometry` y devuelve la polyline en `properties.polyline` (encoded polyline Google/Mapbox). |

### Errores

- **400**: falta `deviceId`, fechas inválidas, o `desde >= hasta`.
- **500** / **503**: error interno / BD no disponible.

### Respuesta 200

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": {
        "type": "LineString",
        "coordinates": [[-58.3816, -34.6037], [-58.3820, -34.6039]]
      },
      "properties": { "deviceId": "batch-device", "deviceName": "Camión 5", "muestras": 2 }
    }
  ]
}
```

Con `format=polyline` la `geometry` no aparece y `properties.polyline` es el string encodeado.

---

## 4. `GET /api/distancia`

Distancia recorrida (km) por dispositivo en un rango de fechas. Un Feature LineString por dispositivo con `km` en properties. Cálculo sobre puntos crudos, sin muestreo.

### Parámetros (query)

| Parámetro | Obligatorio | Tipo | Default | Descripción |
|---|---|---|---|---|
| `deviceId` | ✅ | string | — | Identificador del dispositivo. **Obligatorio.** |
| `desde` | ❌ | date-time (ISO 8601) | hace 30 días | Inicio del rango. |
| `hasta` | ❌ | date-time (ISO 8601) | ahora | Fin del rango. |
| `format` | ❌ | `"polyline"` | `"geojson"` | Con `"polyline"` omite `geometry` y la polyline viaja en `properties.polyline`. |

### Respuesta 200

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[-58.3816, -34.6037], [-58.3820, -34.6039]] },
      "properties": { "deviceId": "batch-device", "km": 12.34, "muestras": 200 }
    }
  ]
}
```

---

## 5. `GET /api/tiempos-estaticos`

Periodos en que el dispositivo permaneció **estático** (parado). Agrupa puntos consecutivos dentro de un radio (`stopRadius`) y devuelve un Feature Point por parada (centroide del cluster).

### Parámetros (query)

| Parámetro | Obligatorio | Tipo | Default | Descripción |
|---|---|---|---|---|
| `deviceId` | ✅ | string | — | Identificador del dispositivo. **Obligatorio.** |
| `desde` | ❌ | date-time (ISO 8601) | hace 30 días | Inicio del rango. |
| `hasta` | ❌ | date-time (ISO 8601) | ahora | Fin del rango. |
| `stopRadius` | ❌ | number (metros) | `15` | Un punto a mayor distancia del anterior inicia un nuevo periodo estático. Se clampea a `>= 0`. |

### Respuesta 200

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-58.3816, -34.6037] },
      "properties": {
        "deviceId": "batch-device",
        "inicio": "2026-09-23T11:00:00Z",
        "fin": "2026-09-23T11:30:00Z",
        "duracionMin": 30,
        "muestras": 45
      }
    }
  ]
}
```

`duracionMin` en minutos (decimal). `inicio`/`fin` en ISO 8601 UTC.

---

## 6. `GET /api/rutas/:deviceId`

**Vista de detalle en un solo request.** Mezcla tres tipos de Feature en una sola FeatureCollection, distinguibles por `properties.tipo`:

- `tipo: "recorrido"` → 1 Feature LineString con resumen (km, duración, velocidades).
- `tipo: "punto"` → 1 Feature Point por cada punto crudo (`ts`, `receivedAt`, `speed`, `accuracy`, `heading`).
- `tipo: "parada"` → 1 Feature Point por cada parada detectada.

### Parámetros

| Parámetro | Ubicación | Obligatorio | Tipo | Default | Descripción |
|---|---|---|---|---|---|
| `deviceId` | path | ✅ | string | — | Identificador del dispositivo (en la URL). |
| `desde` | query | ❌ | date-time (ISO 8601) | hace 30 días | Inicio del rango. |
| `hasta` | query | ❌ | date-time (ISO 8601) | ahora | Fin del rango. |
| `limit` | query | ❌ | int | `1000` | Máx de Features de tipo `punto`. Clampeado a 1–10000. |
| `stopRadius` | query | ❌ | number (metros) | `15` | Radio para agrupar paradas. |
| `format` | query | ❌ | `"polyline"` | `"geojson"` | Con `"polyline"` el Feature `recorrido` omite `geometry` y la polyline viaja en `properties.polyline`. |

### Respuesta 200

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[-58.3816, -34.6037], [-58.3820, -34.6039]] },
      "properties": {
        "deviceId": "batch-device",
        "tipo": "recorrido",
        "km": 12.34,
        "duracionMin": 40.5,
        "inicio": "2026-09-23T11:00:00Z",
        "fin": "2026-09-23T11:40:00Z",
        "velocidadMax": 80.0,
        "velocidadPromedio": 25.3,
        "muestras": 120
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-58.3816, -34.6037] },
      "properties": {
        "deviceId": "batch-device", "deviceName": "Camión 5", "tipo": "punto",
        "ts": "2026-09-23T11:00:00Z", "receivedAt": "2026-09-23T11:00:01Z",
        "speed": 45.2, "accuracy": 8.0, "heading": 90.0
      }
    },
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [-58.3816, -34.6037] },
      "properties": {
        "deviceId": "batch-device", "tipo": "parada",
        "inicio": "2026-09-23T11:00:00Z", "fin": "2026-09-23T11:30:00Z",
        "duracionMin": 30, "muestras": 45
      }
    }
  ]
}
```

---

## Notas comunes

- **Coordenadas**: siempre `[lng, lat]` en `geometry`. `properties.polyline` (encoded polyline, estándar Google/Mapbox) es orden `[lat, lng]` — delinealo con la librería `@mapbox/polyline`/`polyline` y te devuelve `[lat, lng]`; convertí a `[lng, lat]` para mostrarlo en mapas.
- **Fechas**: ISO 8601. `ts` (evento GPS) ≠ `receivedAt` (llegada al server).
- **Formato JSON**: al serializar, los campos `null` no se incluyen en el body (el server manda los properties con `undefined`, que JSON.stringify omite).
- **Errores**: `{ ok: false, error: "mensaje" }` con status 400/500/503.
- **documentación interactiva** ya disponible en `GET /swagger` (Swagger UI).