import { NextRequest, NextResponse } from 'next/server'
import * as satellite from 'satellite.js'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { conflictNear } from '@/lib/gdelt-conflict'

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  dist: z.number().min(1).max(500).optional(),
  fires: z.boolean().optional(),
  conflict: z.boolean().optional(),
  iss: z.boolean().optional(),
})

type Fire = { lat: number; lon: number; confidence: string; frp: number | null; date: string }
type Conflict = { lat: number; lon: number; type: string; date: string; fatalities?: number; notes?: string; mentions?: number; place?: string; url?: string }

// ISS position — CelesTrak TLE (free, no key) propagated with SGP4. TLE cached.
const tleCache = globalThis as unknown as { __issTle?: { l1: string; l2: string; ts: number } }
async function getTle(): Promise<{ l1: string; l2: string } | null> {
  const c = tleCache.__issTle
  if (c && Date.now() - c.ts < 6 * 3600 * 1000) return c
  try {
    const r = await fetch('https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE', { signal: AbortSignal.timeout(8000) })
    if (!r.ok) return c ?? null
    const lines = (await r.text()).trim().split('\n')
    if (lines.length < 3) return c ?? null
    const t = { l1: lines[1].trim(), l2: lines[2].trim(), ts: Date.now() }
    tleCache.__issTle = t
    return t
  } catch { return c ?? null }
}
async function iss(): Promise<{ lat: number; lon: number } | null> {
  const t = await getTle()
  if (!t) return null
  try {
    const rec = satellite.twoline2satrec(t.l1, t.l2)
    const now = new Date()
    const pv = satellite.propagate(rec, now)
    if (!pv || !pv.position || typeof pv.position === 'boolean') return null
    const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(now))
    return { lat: satellite.degreesLat(geo.latitude), lon: satellite.degreesLong(geo.longitude) }
  } catch { return null }
}

// NASA FIRMS active fires/thermal anomalies in the bbox (last 1 day).
async function fires(key: string, bbox: string): Promise<Fire[]> {
  try {
    const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${bbox}/1`, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) return []
    const text = await r.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const head = lines[0].split(',')
    const iLat = head.indexOf('latitude'), iLon = head.indexOf('longitude'), iConf = head.indexOf('confidence'), iFrp = head.indexOf('frp'), iDate = head.indexOf('acq_date')
    const out: Fire[] = []
    for (const l of lines.slice(1, 1500)) {
      const c = l.split(',')
      const lat = Number(c[iLat]), lon = Number(c[iLon])
      if (!isFinite(lat) || !isFinite(lon)) continue
      out.push({ lat, lon, confidence: c[iConf] ?? '', frp: iFrp >= 0 ? Number(c[iFrp]) : null, date: c[iDate] ?? '' })
    }
    return out
  } catch { return [] }
}

// ACLED conflict events near the point (last 30 days). Best-effort.
async function conflict(key: string, email: string, lat: number, lon: number): Promise<Conflict[]> {
  try {
    const url = `https://api.acleddata.com/acled/read?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}&latitude=${lat.toFixed(0)}&longitude=${lon.toFixed(0)}&latitude_where=between&limit=300`
    const r = await fetch(url, { signal: AbortSignal.timeout(12000) })
    if (!r.ok) return []
    const d = await r.json()
    const rows = Array.isArray(d.data) ? d.data : []
    return rows.map((e: Record<string, string>) => ({
      lat: Number(e.latitude), lon: Number(e.longitude), type: e.event_type || 'event',
      date: e.event_date || '', fatalities: Number(e.fatalities) || 0, notes: (e.notes || '').slice(0, 200),
    })).filter((e: Conflict) => isFinite(e.lat) && isFinite(e.lon))
  } catch { return [] }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })

  const { lat, lon } = parsed.data
  const dist = parsed.data.dist ?? 100
  const wantFires = parsed.data.fires !== false
  const wantConflict = parsed.data.conflict !== false
  const wantIss = parsed.data.iss !== false
  const padLat = (dist / 60) * 1.3
  const padLon = padLat / Math.max(0.2, Math.cos((lat * Math.PI) / 180))
  const bbox = `${(lon - padLon).toFixed(3)},${(lat - padLat).toFixed(3)},${(lon + padLon).toFixed(3)},${(lat + padLat).toFixed(3)}`

  const firmsKey = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'firms') })
  const acledKey = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'acled') })

  // Conflict: ACLED if a key is configured (verified), else GDELT events (free, no key)
  let conflictEvents: Conflict[] = []
  let conflictSource: 'acled' | 'gdelt' | 'none' = 'none'
  if (wantConflict) {
    if (acledKey?.keyValue?.includes('|')) {
      const [email, k] = acledKey.keyValue.split('|')
      conflictEvents = await conflict(k, email, lat, lon)
      conflictSource = 'acled'
    } else {
      const ev = await conflictNear(lat, lon, dist)
      conflictEvents = ev.map((e) => ({ lat: e.lat, lon: e.lon, type: e.type, date: e.date, mentions: e.mentions, place: e.place, url: e.url }))
      conflictSource = 'gdelt'
    }
  }

  const [issPos, fireList] = await Promise.all([
    wantIss ? iss() : Promise.resolve(null),
    wantFires && firmsKey?.keyValue ? fires(firmsKey.keyValue, bbox) : Promise.resolve([]),
  ])

  return NextResponse.json({
    iss: issPos,
    fires: fireList,
    conflict: conflictEvents,
    conflictSource,
    firmsConfigured: !!firmsKey?.keyValue,
    acledConfigured: !!acledKey?.keyValue,
  })
}
