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
  heading?: number | null
  flag?: string | null
  typeLabel?: string | null
  destination?: string | null
  imo?: string | null
  callsign?: string | null
  draught?: number | null
  length?: number | null
  width?: number | null
  ts: number
}

function shipTypeLabel(t: number): string {
  if (t >= 20 && t <= 29) return 'Wing-in-ground'
  if (t === 30) return 'Fishing'
  if (t === 31 || t === 32) return 'Towing'
  if (t === 33) return 'Dredging'
  if (t === 34) return 'Diving'
  if (t === 35) return 'Military'
  if (t === 36) return 'Sailing'
  if (t === 37) return 'Pleasure craft'
  if (t >= 40 && t <= 49) return 'High-speed craft'
  if (t === 50) return 'Pilot'
  if (t === 51) return 'Search & rescue'
  if (t === 52) return 'Tug'
  if (t === 53) return 'Port tender'
  if (t === 55) return 'Law enforcement'
  if (t >= 60 && t <= 69) return 'Passenger'
  if (t >= 70 && t <= 79) return 'Cargo'
  if (t >= 80 && t <= 89) return 'Tanker'
  if (t >= 90 && t <= 99) return 'Other'
  return `Type ${t}`
}

// MMSI Maritime Identification Digits (first 3) → flag country (common ones).
const MID: Record<string, string> = {
  201: 'Albania', 205: 'Belgium', 209: 'Cyprus', 210: 'Cyprus', 211: 'Germany', 212: 'Cyprus', 219: 'Denmark', 220: 'Denmark',
  224: 'Spain', 226: 'France', 227: 'France', 228: 'France', 230: 'Finland', 232: 'United Kingdom', 233: 'United Kingdom',
  234: 'United Kingdom', 235: 'United Kingdom', 236: 'Gibraltar', 237: 'Greece', 238: 'Croatia', 239: 'Greece', 240: 'Greece',
  241: 'Greece', 244: 'Netherlands', 245: 'Netherlands', 246: 'Netherlands', 247: 'Italy', 248: 'Malta', 249: 'Malta', 250: 'Ireland',
  255: 'Madeira', 256: 'Malta', 257: 'Norway', 258: 'Norway', 259: 'Norway', 261: 'Poland', 263: 'Portugal', 265: 'Sweden', 266: 'Sweden',
  269: 'Switzerland', 271: 'Turkey', 273: 'Russia', 275: 'Latvia', 276: 'Estonia', 277: 'Lithuania', 304: 'Antigua', 305: 'Antigua',
  306: 'Curaçao', 308: 'Bahamas', 309: 'Bahamas', 311: 'Bahamas', 314: 'Barbados', 316: 'Canada', 319: 'Cayman Islands',
  338: 'USA', 351: 'Panama', 352: 'Panama', 353: 'Panama', 354: 'Panama', 355: 'Panama', 356: 'Panama', 357: 'Panama', 366: 'USA', 367: 'USA',
  368: 'USA', 369: 'USA', 370: 'Panama', 371: 'Panama', 372: 'Panama', 373: 'Panama', 374: 'Panama', 412: 'China', 413: 'China', 414: 'China',
  416: 'Taiwan', 431: 'Japan', 432: 'Japan', 440: 'South Korea', 441: 'South Korea', 445: 'North Korea', 477: 'Hong Kong', 525: 'Indonesia',
  563: 'Singapore', 564: 'Singapore', 565: 'Singapore', 566: 'Singapore', 538: 'Marshall Islands', 548: 'Philippines', 553: 'Papua New Guinea',
  600: 'Egypt', 612: 'Côte d\'Ivoire', 620: 'Comoros', 636: 'Liberia', 637: 'Liberia', 657: 'Nigeria', 710: 'Brazil', 725: 'Chile',
  730: 'Colombia', 760: 'Peru',
}
function flagForMmsi(mmsi: string): string | null {
  return MID[mmsi.slice(0, 3)] ?? null
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
        if (!mmsi) return
        const existing = state.vessels.get(mmsi)
        const lat = meta.latitude ?? meta.Latitude
        const lon = meta.longitude ?? meta.Longitude

        // Need a position from this message or a prior one.
        const hasPos = typeof lat === 'number' && typeof lon === 'number' && (lat !== 0 || lon !== 0)
        if (!hasPos && !existing) return

        const v: Vessel = existing
          ? { ...existing }
          : { mmsi, name: null, lat: lat as number, lon: lon as number, sog: null, cog: null, flag: flagForMmsi(mmsi), ts: Date.now() }

        if (hasPos) { v.lat = lat as number; v.lon = lon as number }
        if (meta.ShipName) v.name = String(meta.ShipName).trim() || v.name
        v.ts = Date.now()

        const pr = msg.Message?.PositionReport
        if (pr) {
          if (typeof pr.Sog === 'number') v.sog = pr.Sog
          if (typeof pr.Cog === 'number') v.cog = pr.Cog
          if (typeof pr.TrueHeading === 'number' && pr.TrueHeading < 360) v.heading = pr.TrueHeading
        }
        const sd = msg.Message?.ShipStaticData
        if (sd) {
          if (typeof sd.Type === 'number' && sd.Type > 0) v.typeLabel = shipTypeLabel(sd.Type)
          if (sd.Destination) v.destination = String(sd.Destination).trim() || null
          if (sd.ImoNumber) v.imo = String(sd.ImoNumber)
          if (sd.CallSign) v.callsign = String(sd.CallSign).trim() || null
          if (typeof sd.MaximumStaticDraught === 'number' && sd.MaximumStaticDraught > 0) v.draught = sd.MaximumStaticDraught
          if (sd.Dimension) { v.length = (sd.Dimension.A || 0) + (sd.Dimension.B || 0); v.width = (sd.Dimension.C || 0) + (sd.Dimension.D || 0) }
        }

        state.vessels.set(mmsi, v)
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
