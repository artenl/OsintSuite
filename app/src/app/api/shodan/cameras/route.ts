import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys, cameraCatalog } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { z } from 'zod'

// Default query targets internet-facing cameras specifically. Editable from the UI.
const DEFAULT_QUERY = 'device:webcam'

export async function GET() {
  const rows = await db.query.cameraCatalog.findMany({ orderBy: [asc(cameraCatalog.rank)] })
  const updatedAt = rows[0]?.updatedAt ?? null
  const query = rows[0]?.query ?? null
  return NextResponse.json({ updatedAt, query, cameras: rows.map((r) => ({ rank: r.rank, product: r.product, count: r.count })) })
}

// Refresh the top-50 catalog using Shodan's count endpoint: returns facet
// counts (product name + how many are exposed) WITHOUT any device records or IPs.
export async function POST(req: NextRequest) {
  if (req.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const parsed = z.object({ query: z.string().min(1).max(500).optional() }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data.query?.trim() || DEFAULT_QUERY

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'shodan') })
  if (!keyRow) return NextResponse.json({ error: 'No Shodan API key configured (Settings → API Keys)' }, { status: 503 })

  const params = new URLSearchParams({ key: keyRow.keyValue, query, facets: 'product:50' })

  try {
    const res = await fetch(`https://api.shodan.io/shodan/host/count?${params}`, {
      signal: AbortSignal.timeout(15000),
    })

    if (res.status === 401) return NextResponse.json({ error: 'Shodan rejected the API key' }, { status: 401 })
    if (res.status === 403) return NextResponse.json({ error: 'This Shodan query requires a paid plan' }, { status: 403 })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: (err as { error?: string }).error || `Shodan error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const facet = (data.facets?.product ?? []) as { value: string; count: number }[]
    if (!facet.length) return NextResponse.json({ error: 'Shodan returned no product facets for this query' }, { status: 502 })

    const now = new Date()
    const rows = facet.slice(0, 50).map((f, i) => ({
      id: crypto.randomUUID(),
      rank: i + 1,
      product: f.value,
      count: f.count,
      query,
      updatedAt: now,
    }))

    // Replace the catalog atomically.
    await db.delete(cameraCatalog)
    await db.insert(cameraCatalog).values(rows)

    return NextResponse.json({
      updatedAt: now.toISOString(),
      query,
      total: data.total ?? null,
      cameras: rows.map((r) => ({ rank: r.rank, product: r.product, count: r.count })),
    })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Shodan request timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
