import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  query: z.string().max(8000).optional(),
  center: z.object({ lat: z.number(), lon: z.number() }).optional(),
  total: z.number().optional(),
  features: z.array(z.object({
    label: z.string(),
    name: z.string().nullable().optional(),
    lat: z.number(),
    lon: z.number(),
  })).max(120),
})

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash']

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    observations: { type: 'array', items: { type: 'string' } },
    leads: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'observations', 'leads'],
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'gemini') })
  if (!keyRow) return NextResponse.json({ error: 'No Gemini API key configured (Settings → API Keys)' }, { status: 503 })

  const { query, center, total, features } = parsed.data
  if (!features.length) return NextResponse.json({ error: 'No features to summarize' }, { status: 400 })

  const byLabel: Record<string, number> = {}
  for (const f of features) byLabel[f.label] = (byLabel[f.label] || 0) + 1
  const counts = Object.entries(byLabel).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}: ${n}`).join(', ')
  const named = features.filter((f) => f.name).slice(0, 50).map((f) => `- ${f.name} (${f.label}) @ ${f.lat.toFixed(5)},${f.lon.toFixed(5)}`).join('\n')

  const prompt = `You are an OSINT geospatial analyst. The following OpenStreetMap features were found${center ? ` near ${center.lat},${center.lon}` : ''}${query ? ` for the query: ${query.slice(0, 300)}` : ''}.

Total features: ${total ?? features.length}.
Feature type counts: ${counts}.
Named features (sample):
${named || '(none named)'}

Produce a concise analysis grounded ONLY in this data:
- summary: 2-4 sentences describing what is at/around this location and the character of the area.
- observations: concrete patterns (clusters, density, notable named places, what dominates).
- leads: specific follow-up actions for an investigator (what to verify, what each cluster might indicate, useful pivots).`

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
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
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
      return NextResponse.json({ model, ...JSON.parse(text) })
    } catch (err) {
      if (!isLast) continue
      return NextResponse.json({ error: String(err).includes('timeout') ? 'Gemini timed out' : String(err) }, { status: 500 })
    }
  }
  return NextResponse.json({ error: 'Summary failed' }, { status: 502 })
}
