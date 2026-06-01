import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  prompt: z.string().min(1).max(1000),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
})

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    note: { type: 'string' },
  },
  required: ['query', 'note'],
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'gemini') })
  if (!keyRow) return NextResponse.json({ error: 'No Gemini API key configured (Settings → API Keys)' }, { status: 503 })

  const { prompt, center } = parsed.data
  const centerHint = center
    ? `\nThe user's current reference point is lat=${center.lat}, lon=${center.lon}. Use it for "near me" / "around here" / radius requests via around: filters.`
    : ''

  const sys = `You are an expert in Overpass QL for OpenStreetMap. Convert the user's natural-language request into ONE valid Overpass QL query.

Rules:
- Start with: [out:json][timeout:25];
- End with output that includes coordinates for ways/relations, i.e. finish with: out center;  (or "out body; >; out skel qt;" only if explicitly needed)
- For "within N meters of LAT,LON" use (around:N,LAT,LON) filters.
- Use the correct OSM tags (e.g. man_made=surveillance for cameras, amenity=atm, amenity=place_of_worship, shop=*, amenity=fuel, highway=*, etc.).
- Combine node/way/relation with a union ( ... ); when a feature can be any of them.
- Keep it minimal and runnable. Do NOT wrap in markdown fences.
${centerHint}

Return JSON: { "query": "<the Overpass QL>", "note": "<one sentence explaining what it finds>" }.

Request: ${prompt}`

  for (let i = 0; i < MODELS.length; i++) {
    const model = MODELS[i]
    const isLast = i === MODELS.length - 1
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${keyRow.keyValue}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: sys }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
          }),
          signal: AbortSignal.timeout(45000),
        }
      )
      if ((res.status === 429 || res.status === 404 || res.status === 503) && !isLast) continue
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        return NextResponse.json({ error: (e as { error?: { message?: string } })?.error?.message || `Gemini ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!text) { if (!isLast) continue; return NextResponse.json({ error: 'Empty response' }, { status: 502 }) }
      const out = JSON.parse(text)
      return NextResponse.json({ model, ...out })
    } catch (err) {
      if (!isLast) continue
      return NextResponse.json({ error: String(err).includes('timeout') ? 'Gemini timed out' : String(err) }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Query generation failed' }, { status: 502 })
}
