import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  query: z.string().min(1).max(500),
  page: z.number().int().min(1).max(20).optional(),
})

// Shodan host search — returns matching exposed devices (metadata + banner) and
// facets. Requires a paid Shodan plan for the search endpoint.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'shodan') })
  if (!keyRow) return NextResponse.json({ error: 'No Shodan API key configured (Settings → API Keys)' }, { status: 503 })

  const { query, page = 1 } = parsed.data
  const params = new URLSearchParams({
    key: keyRow.keyValue,
    query,
    page: String(page),
    facets: 'product:10,org:10,country:10,port:10',
  })

  try {
    const res = await fetch(`https://api.shodan.io/shodan/host/search?${params}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 401) return NextResponse.json({ error: 'Shodan rejected the API key' }, { status: 401 })
    if (res.status === 403) return NextResponse.json({ error: 'Shodan search requires a paid plan (membership)' }, { status: 403 })
    if (res.status === 429) return NextResponse.json({ error: 'Shodan rate limit reached — slow down' }, { status: 429 })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: (err as { error?: string }).error || `Shodan error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()

    const matches = (Array.isArray(data.matches) ? data.matches : []).map((m: Record<string, unknown>) => {
      const loc = (m.location ?? {}) as Record<string, string>
      return {
        ip: m.ip_str,
        port: m.port,
        transport: m.transport,
        product: m.product ?? null,
        org: m.org ?? null,
        isp: m.isp ?? null,
        os: m.os ?? null,
        hostnames: m.hostnames ?? [],
        country: loc.country_name ?? null,
        city: loc.city ?? null,
        title: ((m.http ?? {}) as Record<string, string>).title ?? null,
        // First line of the banner only — enough to fingerprint, not a payload dump.
        banner: typeof m.data === 'string' ? m.data.split('\n').slice(0, 4).join('\n').slice(0, 400) : null,
        timestamp: m.timestamp ?? null,
      }
    })

    const facets: Record<string, { value: string; count: number }[]> = {}
    if (data.facets) {
      for (const [k, v] of Object.entries(data.facets)) {
        facets[k] = (v as { value: string; count: number }[]).map((f) => ({ value: f.value, count: f.count }))
      }
    }

    return NextResponse.json({ total: data.total ?? 0, page, matches, facets })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Shodan request timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
