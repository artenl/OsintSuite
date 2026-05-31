import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

// urlscan.io — recent scans for a domain/IP. Search API is free; the stored key
// (if present) raises rate limits.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const target = parsed.data.target.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
  const field = isIpv4(target) ? 'ip' : 'domain'

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'urlscan') })

  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (keyRow?.keyValue) headers['API-Key'] = keyRow.keyValue

    const res = await fetch(
      `https://urlscan.io/api/v1/search/?q=${encodeURIComponent(`${field}:${target}`)}&size=10`,
      { headers, signal: AbortSignal.timeout(12000) }
    )

    if (res.status === 429) return NextResponse.json({ error: 'urlscan rate limit reached — add an API key for higher limits' }, { status: 429 })
    if (!res.ok) return NextResponse.json({ error: `urlscan returned ${res.status}` }, { status: res.status })

    const data = await res.json()
    const results = Array.isArray(data.results) ? data.results : []
    const result: Record<string, string> = { Target: target }

    if (!results.length) {
      result['Scans'] = 'No public scans found on urlscan.io'
      return NextResponse.json(result)
    }

    result['Public Scans'] = String(data.total ?? results.length)

    const malicious = results.filter((r: Record<string, unknown>) => {
      const verdicts = (r.verdicts as Record<string, { malicious?: boolean }>) ?? {}
      return verdicts.overall?.malicious
    }).length
    if (malicious) result['Flagged Malicious'] = `⚠ ${malicious} of last ${results.length} scans`

    const latest = results.slice(0, 5).map((r: Record<string, Record<string, string>>) => {
      const page = r.page ?? {}
      const task = r.task ?? {}
      const date = task.time ? task.time.split('T')[0] : '?'
      return `${date} — ${page.url ?? task.url ?? '?'}${page.server ? ` (${page.server})` : ''}`
    })
    result['Recent Scans'] = latest.join('\n')

    // Surface a viewable report link for the most recent scan
    const first = results[0] as { result?: string }
    if (typeof first?.result === 'string') result['Latest Report'] = first.result

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
