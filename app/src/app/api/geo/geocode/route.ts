import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({
  q: z.string().min(1).max(300).optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
})

const UA = 'OSINTSuite/1.1.5 (self-hosted research tool)'

// Nominatim geocoding (free, no key). Forward: place name -> coords.
// Reverse: coords -> address. Respect the 1 req/s usage policy via UA + timeouts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { q, lat, lon } = parsed.data

  try {
    if (typeof lat === 'number' && typeof lon === 'number') {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`,
        { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return NextResponse.json({ error: `Nominatim returned ${res.status}` }, { status: 502 })
      const d = await res.json()
      if (d.error) return NextResponse.json({ error: 'No address found for these coordinates' }, { status: 404 })
      return NextResponse.json({
        mode: 'reverse',
        results: [{ displayName: d.display_name, lat: Number(d.lat), lon: Number(d.lon), type: d.type, addressType: d.addresstype }],
      })
    }

    if (q) {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`,
        { headers: { 'User-Agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      )
      if (!res.ok) return NextResponse.json({ error: `Nominatim returned ${res.status}` }, { status: 502 })
      const arr = await res.json()
      if (!Array.isArray(arr) || !arr.length) return NextResponse.json({ error: 'No places matched that search' }, { status: 404 })
      return NextResponse.json({
        mode: 'forward',
        results: arr.map((d: Record<string, string>) => ({
          displayName: d.display_name,
          lat: Number(d.lat),
          lon: Number(d.lon),
          type: d.type,
          category: d.category,
        })),
      })
    }

    return NextResponse.json({ error: 'Provide a place name (q) or coordinates (lat, lon)' }, { status: 400 })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Geocoder timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
