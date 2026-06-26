import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getVessels } from '@/lib/ais'

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  dist: z.number().min(1).max(250).optional(),
})

type Aircraft = {
  hex: string; flight: string | null; type: string | null
  lat: number; lon: number; alt: number | null; gs: number | null; track: number | null
}

async function fetchAircraft(lat: number, lon: number, dist: number): Promise<Aircraft[]> {
  const urls = [
    `https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
    `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${dist}`,
  ]
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'User-Agent': 'OSINTSuite/1.2' }, signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      const ac = Array.isArray(data.ac) ? data.ac : []
      const out: Aircraft[] = []
      for (const a of ac) {
        if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue
        out.push({
          hex: a.hex,
          flight: a.flight ? String(a.flight).trim() : null,
          type: a.t || null,
          lat: a.lat,
          lon: a.lon,
          alt: typeof a.alt_baro === 'number' ? a.alt_baro : null,
          gs: typeof a.gs === 'number' ? Math.round(a.gs) : null,
          track: typeof a.track === 'number' ? a.track : null,
        })
      }
      if (out.length || url === urls[urls.length - 1]) return out
    } catch { /* try next source */ }
  }
  return []
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })

  const { lat, lon } = parsed.data
  const dist = parsed.data.dist ?? 100

  const aircraft = await fetchAircraft(lat, lon, dist)

  // Vessels (AIS) — only if a key is configured.
  let vessels: unknown[] = []
  let aisConfigured = false
  let aisConnected = false
  const aisKey = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'aisstream') })
  if (aisKey?.keyValue) {
    aisConfigured = true
    const r = getVessels(aisKey.keyValue, lat, lon, dist)
    vessels = r.vessels
    aisConnected = r.connected
  }

  return NextResponse.json({
    center: { lat, lon },
    dist,
    aircraft,
    vessels,
    aisConfigured,
    aisConnected,
    ts: Date.now(),
  })
}
