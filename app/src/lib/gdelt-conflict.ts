import { unzipSync } from 'fflate'

// Free, no-key conflict/unrest layer from GDELT's raw 15-minute event export
// files (static CDN — no API key, no rate limit). Maintains a rolling in-memory
// buffer of recent global violence/protest events, filtered by map view.

export type ConflictEvent = {
  id: string; lat: number; lon: number; type: string; date: string; mentions: number; place: string; url: string
  actor1?: string; actor2?: string; articles?: number; tone?: number
}

type State = { events: Map<string, ConflictEvent>; lastTs: string; loadedAt: number; loading: Promise<void> | null }
const g = globalThis as unknown as { __gdeltConf?: State }
const state: State = g.__gdeltConf ?? (g.__gdeltConf = { events: new Map(), lastTs: '', loadedAt: 0, loading: null })

const REFRESH_MS = 14 * 60 * 1000
const MAX_AGE_MS = 48 * 60 * 60 * 1000
const MAX_EVENTS = 25000
const SEED_FILES = 16 // ~4h on cold start

// EventRootCode → label (CAMEO). We keep protests + violence.
const ROOT: Record<string, string> = { '14': 'Protest', '17': 'Coerce', '18': 'Assault', '19': 'Armed clash', '20': 'Mass violence' }

function fmtTs(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}00`
}
function parseTs(ts: string): number {
  return Date.UTC(+ts.slice(0, 4), +ts.slice(4, 6) - 1, +ts.slice(6, 8), +ts.slice(8, 10), +ts.slice(10, 12))
}

async function fetchFile(ts: string): Promise<void> {
  try {
    const r = await fetch(`http://data.gdeltproject.org/gdeltv2/${ts}.export.CSV.zip`, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) return
    const zip = unzipSync(new Uint8Array(await r.arrayBuffer()))
    const name = Object.keys(zip)[0]
    if (!name) return
    const csv = Buffer.from(zip[name]).toString('utf8')
    for (const line of csv.split('\n')) {
      const f = line.split('\t')
      if (f.length < 58) continue
      const root = f[28]
      if (!ROOT[root]) continue
      const lat = Number(f[56]), lon = Number(f[57])
      if (!isFinite(lat) || !isFinite(lon) || (lat === 0 && lon === 0)) continue
      const id = f[0]
      state.events.set(id, {
        id, lat, lon, type: ROOT[root], date: f[1] ? `${f[1].slice(0, 4)}-${f[1].slice(4, 6)}-${f[1].slice(6, 8)}` : '',
        mentions: Number(f[31]) || 0, place: f[52] || '', url: f[60]?.trim() || '',
        actor1: f[6]?.trim() || undefined, actor2: f[16]?.trim() || undefined,
        articles: Number(f[33]) || undefined, tone: f[34] ? Math.round(Number(f[34]) * 10) / 10 : undefined,
      })
    }
  } catch { /* skip bad file */ }
}

function prune() {
  const cutoff = Date.now() - MAX_AGE_MS
  for (const [k, e] of state.events) {
    const t = e.date ? Date.parse(e.date) : 0
    if (t && t < cutoff) state.events.delete(k)
  }
  if (state.events.size > MAX_EVENTS) {
    const arr = [...state.events.entries()].sort((a, b) => Date.parse(a[1].date) - Date.parse(b[1].date))
    for (let i = 0; i < arr.length - MAX_EVENTS; i++) state.events.delete(arr[i][0])
  }
}

async function refresh(): Promise<void> {
  // latest file pointer
  let latest = ''
  try {
    const r = await fetch('http://data.gdeltproject.org/gdeltv2/lastupdate.txt', { signal: AbortSignal.timeout(8000) })
    const m = (await r.text()).match(/(\d{14})\.export\.CSV\.zip/)
    if (m) latest = m[1]
  } catch { /* ignore */ }
  if (!latest) return

  if (!state.events.size) {
    // cold start — seed several recent files
    const base = parseTs(latest)
    const tsList = Array.from({ length: SEED_FILES }, (_, i) => fmtTs(new Date(base - i * 15 * 60 * 1000)))
    await Promise.all(tsList.map(fetchFile))
  } else if (latest !== state.lastTs) {
    await fetchFile(latest)
  }
  state.lastTs = latest
  state.loadedAt = Date.now()
  prune()
}

async function ensureFresh(): Promise<void> {
  if (state.events.size && Date.now() - state.loadedAt < REFRESH_MS) return
  if (!state.loading) state.loading = refresh().finally(() => { state.loading = null })
  await state.loading
}

function havNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export async function conflictNear(lat: number, lon: number, radiusNm: number): Promise<ConflictEvent[]> {
  await ensureFresh()
  const out: ConflictEvent[] = []
  for (const e of state.events.values()) if (havNm(lat, lon, e.lat, e.lon) <= radiusNm) out.push(e)
  // de-dup by rounded location + type, prefer more mentions
  out.sort((a, b) => b.mentions - a.mentions)
  return out.slice(0, 400)
}
