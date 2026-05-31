import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

// abuse.ch URLhaus — host reputation / known-malicious lookup.
// Free; abuse.ch now issues optional Auth-Keys for higher limits (service: 'abusech').
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const host = parsed.data.target.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'abusech') })

  try {
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
    if (keyRow?.keyValue) headers['Auth-Key'] = keyRow.keyValue

    const res = await fetch('https://urlhaus-api.abuse.ch/v1/host/', {
      method: 'POST',
      headers,
      body: new URLSearchParams({ host }).toString(),
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 401) {
      return NextResponse.json({
        Host: host,
        Note: 'abuse.ch now requires a free Auth-Key. Add one under Settings → API Keys (abusech) to enable threat lookups.',
      })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `URLhaus returned ${res.status}` }, { status: 502 })
    }

    const data = await res.json()
    const result: Record<string, string> = { Host: host }

    if (data.query_status === 'no_results') {
      result['Reputation'] = '✓ Clean — not listed in URLhaus'
      return NextResponse.json(result)
    }

    if (data.query_status !== 'ok') {
      result['Reputation'] = `Lookup status: ${data.query_status}`
      return NextResponse.json(result)
    }

    result['Reputation'] = '⚠ LISTED in URLhaus (known malicious activity)'
    if (data.firstseen) result['First Seen'] = data.firstseen
    if (data.url_count) result['Malicious URLs'] = String(data.url_count)

    if (data.blacklists) {
      const bl = Object.entries(data.blacklists as Record<string, string>)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n')
      if (bl) result['Blacklists'] = bl
    }

    if (Array.isArray(data.urls) && data.urls.length) {
      result['Recent Malicious URLs'] = data.urls
        .slice(0, 5)
        .map((u: Record<string, string>) => `${u.url_status ?? '?'} — ${u.url}`)
        .join('\n')
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
