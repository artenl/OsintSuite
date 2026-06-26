import WebSocket from 'ws'

// In-memory live AIS vessel cache, fed by a single persistent WebSocket to
// aisstream.io. Lazily connected on first use (never at import/build time).
// Works because the app runs as a long-lived standalone Node process.

export type Vessel = {
  mmsi: string
  name: string | null
  lat: number
  lon: number
  sog: number | null // speed over ground (knots)
  cog: number | null // course over ground (deg)
  ts: number // last update (ms)
}

type State = {
  ws: WebSocket | null
  connected: boolean
  apiKey: string | null
  bbox: number[][] | null // [[lat1,lon1],[lat2,lon2]]
  vessels: Map<string, Vessel>
  lastError: string | null
  connectingAt: number
}

const g = globalThis as unknown as { __ais?: State }
const state: State =
  g.__ais ??
  (g.__ais = { ws: null, connected: false, apiKey: null, bbox: null, vessels: new Map(), lastError: null, connectingAt: 0 })

const STALE_MS = 6 * 60 * 1000 // drop vessels not heard from in 6 min
const MAX_VESSELS = 3000

function bboxFor(lat: number, lon: number, radiusNm: number): number[][] {
  const latPad = (radiusNm / 60) * 1.3
  const lonPad = latPad / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  // aisstream expects [[lat1, lon1], [lat2, lon2]]
  return [
    [lat - latPad, lon - lonPad],
    [lat + latPad, lon + lonPad],
  ]
}

function bboxFarFrom(a: number[][] | null, b: number[][]): boolean {
  if (!a) return true
  // re-subscribe if the new center moved more than ~half the box
  const aCenterLat = (a[0][0] + a[1][0]) / 2
  const aCenterLon = (a[0][1] + a[1][1]) / 2
  const bCenterLat = (b[0][0] + b[1][0]) / 2
  const bCenterLon = (b[0][1] + b[1][1]) / 2
  const halfLat = Math.abs(a[1][0] - a[0][0]) / 2
  const halfLon = Math.abs(a[1][1] - a[0][1]) / 2
  return Math.abs(aCenterLat - bCenterLat) > halfLat || Math.abs(aCenterLon - bCenterLon) > halfLon
}

function subscribe() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.apiKey || !state.bbox) return
  state.ws.send(
    JSON.stringify({
      APIKey: state.apiKey,
      BoundingBoxes: [state.bbox],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    })
  )
}

function connect() {
  if (state.ws || !state.apiKey) return
  state.connectingAt = Date.now()
  try {
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream')
    state.ws = ws
    ws.on('open', () => { state.connected = true; state.lastError = null; subscribe() })
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        const meta = msg.MetaData || {}
        const mmsi = String(meta.MMSI ?? '')
        const lat = meta.latitude ?? meta.Latitude
        const lon = meta.longitude ?? meta.Longitude
        if (!mmsi || typeof lat !== 'number' || typeof lon !== 'number') return
        const existing = state.vessels.get(mmsi)
        const pr = msg.Message?.PositionReport
        state.vessels.set(mmsi, {
          mmsi,
          name: (meta.ShipName ? String(meta.ShipName).trim() : null) || existing?.name || null,
          lat,
          lon,
          sog: typeof pr?.Sog === 'number' ? pr.Sog : existing?.sog ?? null,
          cog: typeof pr?.Cog === 'number' ? pr.Cog : existing?.cog ?? null,
          ts: Date.now(),
        })
        if (state.vessels.size > MAX_VESSELS) prune(true)
      } catch { /* ignore malformed frame */ }
    })
    ws.on('error', (e) => { state.lastError = String((e as Error).message || e) })
    ws.on('close', () => {
      // Only clear state if this is still the active socket (avoid nulling a
      // freshly-reconnected one during an area change).
      if (state.ws === ws) { state.connected = false; state.ws = null }
    })
  } catch (e) {
    state.lastError = String(e)
    state.ws = null
  }
}

function prune(force = false) {
  const cutoff = Date.now() - STALE_MS
  for (const [k, v] of state.vessels) if (v.ts < cutoff) state.vessels.delete(k)
  if (force && state.vessels.size > MAX_VESSELS) {
    // drop oldest down to cap
    const sorted = [...state.vessels.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < sorted.length - MAX_VESSELS; i++) state.vessels.delete(sorted[i][0])
  }
}

// Ensure the stream is connected & subscribed to a box around the given center,
// then return vessels currently within the radius.
export function getVessels(apiKey: string, lat: number, lon: number, radiusNm: number): { vessels: Vessel[]; connected: boolean; error: string | null } {
  state.apiKey = apiKey
  const want = bboxFor(lat, lon, radiusNm)

  if (!state.ws) {
    state.bbox = want
    connect()
  } else if (bboxFarFrom(state.bbox, want)) {
    // aisstream binds the bbox at connection time — reconnect to change area.
    state.bbox = want
    state.vessels.clear()
    const old = state.ws
    state.ws = null
    try { old.close() } catch { /* ignore */ }
    connect()
  }

  prune()

  // haversine filter to the requested radius
  const within: Vessel[] = []
  for (const v of state.vessels.values()) {
    const d = haversineNm(lat, lon, v.lat, v.lon)
    if (d <= radiusNm) within.push(v)
  }
  return { vessels: within, connected: state.connected, error: state.lastError }
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065 // nautical miles
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
