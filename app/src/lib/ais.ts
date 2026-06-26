import WebSocket from 'ws'

// In-memory live AIS vessel cache, fed by a single persistent WebSocket to
// aisstream.io. Lazily connected on first use (never at import/build time).
// Works because the app runs as a long-lived standalone Node process.
//
// aisstream binds bounding boxes at connection time and supports MULTIPLE boxes
// per subscription, so we track a *set* of active viewer areas and subscribe to
// all of them at once — concurrent viewers of different regions don't evict each
// other. We only reopen the socket when that set actually changes.

export type Vessel = {
  mmsi: string
  name: string | null
  lat: number
  lon: number
  sog: number | null // speed over ground (knots)
  cog: number | null // course over ground (deg)
  ts: number
}

type Box = { bbox: number[][]; ts: number }

type State = {
  ws: WebSocket | null
  connected: boolean
  apiKey: string | null
  boxes: Map<string, Box>
  subscribedSig: string
  vessels: Map<string, Vessel>
  lastError: string | null
}

const g = globalThis as unknown as { __ais?: State }
const state: State =
  g.__ais ??
  (g.__ais = { ws: null, connected: false, apiKey: null, boxes: new Map(), subscribedSig: '', vessels: new Map(), lastError: null })

const STALE_MS = 6 * 60 * 1000
const BOX_TTL_MS = 5 * 60 * 1000 // stop watching an area no one has requested for 5 min
const MAX_BOXES = 8
const MAX_VESSELS = 4000

function bboxFor(lat: number, lon: number, radiusNm: number): number[][] {
  const latPad = (radiusNm / 60) * 1.3
  const lonPad = latPad / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  return [[lat - latPad, lon - lonPad], [lat + latPad, lon + lonPad]]
}

function boxesSig(): string {
  return [...state.boxes.keys()].sort().join('|')
}

function subscribe() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN || !state.apiKey) return
  const boxes = [...state.boxes.values()].map((b) => b.bbox)
  if (!boxes.length) return
  state.ws.send(JSON.stringify({ APIKey: state.apiKey, BoundingBoxes: boxes, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }))
  state.subscribedSig = boxesSig()
}

function connect() {
  if (state.ws || !state.apiKey) return
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
        if (state.vessels.size > MAX_VESSELS) pruneVessels(true)
      } catch { /* ignore malformed frame */ }
    })
    ws.on('error', (e) => { state.lastError = String((e as Error).message || e) })
    ws.on('close', () => { if (state.ws === ws) { state.connected = false; state.ws = null } })
  } catch (e) {
    state.lastError = String(e)
    state.ws = null
  }
}

function reconnect() {
  const old = state.ws
  state.ws = null
  try { old?.close() } catch { /* ignore */ }
  connect()
}

function pruneVessels(force = false) {
  const cutoff = Date.now() - STALE_MS
  for (const [k, v] of state.vessels) if (v.ts < cutoff) state.vessels.delete(k)
  if (force && state.vessels.size > MAX_VESSELS) {
    const sorted = [...state.vessels.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < sorted.length - MAX_VESSELS; i++) state.vessels.delete(sorted[i][0])
  }
}

function pruneBoxes() {
  const cutoff = Date.now() - BOX_TTL_MS
  for (const [k, b] of state.boxes) if (b.ts < cutoff) state.boxes.delete(k)
  if (state.boxes.size > MAX_BOXES) {
    const sorted = [...state.boxes.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < sorted.length - MAX_BOXES; i++) state.boxes.delete(sorted[i][0])
  }
}

export function getVessels(apiKey: string, lat: number, lon: number, radiusNm: number): { vessels: Vessel[]; connected: boolean; error: string | null } {
  state.apiKey = apiKey

  // Register/refresh this viewer's area (coarse key so small jitter doesn't churn).
  const key = `${lat.toFixed(1)}:${lon.toFixed(1)}:${radiusNm}`
  state.boxes.set(key, { bbox: bboxFor(lat, lon, radiusNm), ts: Date.now() })
  pruneBoxes()
  pruneVessels()

  if (!state.ws) {
    connect()
  } else if (boxesSig() !== state.subscribedSig && state.ws.readyState === WebSocket.OPEN) {
    // the set of watched areas changed → reopen with the new box set
    reconnect()
  }

  const within: Vessel[] = []
  for (const v of state.vessels.values()) {
    if (haversineNm(lat, lon, v.lat, v.lon) <= radiusNm) within.push(v)
  }
  return { vessels: within, connected: state.connected, error: state.lastError }
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
