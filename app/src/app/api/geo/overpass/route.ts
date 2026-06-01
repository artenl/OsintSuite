import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ query: z.string().min(1).max(8000) })

const UA = 'OSINTSuite/1.1.5 (self-hosted research tool)'
const MAX = 300

type OverpassEl = {
  type: string
  id: number
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: Record<string, string>
}

function labelFor(tags: Record<string, string>): string {
  const keys = ['amenity', 'shop', 'man_made', 'tourism', 'leisure', 'highway', 'building', 'office', 'natural', 'historic', 'craft']
  for (const k of keys) if (tags[k]) return `${k}=${tags[k]}`
  return tags.type || 'feature'
}

// Execute Overpass QL against the public Overpass API. Free, no key.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
      body: `data=${encodeURIComponent(parsed.data.query)}`,
      signal: AbortSignal.timeout(35000),
    })

    if (res.status === 400) return NextResponse.json({ error: 'Overpass rejected the query (syntax error)' }, { status: 400 })
    if (res.status === 429) return NextResponse.json({ error: 'Overpass rate limit reached — wait a moment and retry' }, { status: 429 })
    if (res.status === 504) return NextResponse.json({ error: 'Overpass timed out — narrow the area or feature type' }, { status: 504 })
    if (!res.ok) return NextResponse.json({ error: `Overpass returned ${res.status}` }, { status: res.status })

    const data = await res.json()
    const els: OverpassEl[] = Array.isArray(data.elements) ? data.elements : []

    const features = els
      .map((e) => {
        const lat = e.lat ?? e.center?.lat
        const lon = e.lon ?? e.center?.lon
        if (typeof lat !== 'number' || typeof lon !== 'number') return null
        const tags = e.tags ?? {}
        return {
          type: e.type,
          id: e.id,
          lat,
          lon,
          name: tags.name || tags['name:en'] || null,
          label: labelFor(tags),
          tags,
        }
      })
      .filter(Boolean)

    return NextResponse.json({
      total: features.length,
      truncated: features.length > MAX,
      features: features.slice(0, MAX),
    })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Overpass request timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
