import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(2000) })

function fmt(ts: string): string {
  if (!ts || ts.length < 8) return ts
  return `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`
}

type Snap = { timestamp?: string; url?: string }

// Wayback availability API is sub-second (CDX is too slow for one-click use).
// It returns the snapshot closest to a given date within a few-year window, so
// probing anchor years in parallel and taking min/max recovers first/last capture.
async function closest(target: string, timestamp?: string): Promise<Snap | null> {
  const url = `https://archive.org/wayback/available?url=${encodeURIComponent(target)}${timestamp ? `&timestamp=${timestamp}` : ''}`
  const res = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { 'User-Agent': 'OSINTSuite/1.1.5' } })
  if (!res.ok) throw new Error(`Wayback ${res.status}`)
  const d = await res.json()
  return d?.archived_snapshots?.closest ?? null
}

const ANCHORS = ['19980101', '20010101', '20040101', '20070101', '20100101', '20130101', '20160101', '20190101', '20220101', '20240101']

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const target = parsed.data.target.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')

  try {
    const latest = await closest(target).catch(() => null) // no timestamp = most recent
    const anchorSnaps = await Promise.all(ANCHORS.map((a) => closest(target, a).catch(() => null)))

    const all = [latest, ...anchorSnaps].filter((s): s is Snap => !!s && !!s.timestamp)
    if (!all.length) {
      return NextResponse.json({ Target: target, Result: 'No archived snapshots found' })
    }

    const sorted = all.slice().sort((a, b) => a.timestamp!.localeCompare(b.timestamp!))
    const first = sorted[0]
    const last = latest?.timestamp ? latest : sorted[sorted.length - 1]

    const result: Record<string, string> = { Target: target }
    result['First Captured'] = fmt(first.timestamp!)
    result['Last Captured'] = fmt(last.timestamp!)
    if (first.url) result['First Snapshot'] = first.url.replace(/^http:/, 'https:')
    if (last.url) result['Latest Snapshot'] = last.url.replace(/^http:/, 'https:')
    result['Timeline'] = `https://web.archive.org/web/*/${target}`

    return NextResponse.json(result)
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Wayback timed out — try again' : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
