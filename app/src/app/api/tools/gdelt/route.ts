import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(2).max(120) })

function fmtDate(s: string): string {
  // 20260620T120000Z -> 2026-06-20
  return s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s
}

// GDELT DOC 2.0 — recent global news coverage mentioning the target. Free, no key.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const target = parsed.data.target.trim()
  const q = /\s/.test(target) ? `"${target}"` : target
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&format=json&maxrecords=30&sort=datedesc&timespan=3m`

  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'OSINTSuite/1.2', accept: 'application/json' }, signal: AbortSignal.timeout(12000) })
    // GDELT free API allows ~1 request / 5s per IP — degrade softly, don't fail the investigation.
    if (res.status === 429) return NextResponse.json({ query: target, Result: 'News lookup rate-limited (GDELT: ~1 request / 5s) — try again shortly' })
    if (!res.ok) return NextResponse.json({ error: `GDELT returned ${res.status}` }, { status: 502 })

    const text = await res.text()
    let data: { articles?: Array<Record<string, string>> }
    try { data = JSON.parse(text) } catch { return NextResponse.json({ query: target, Result: 'No recent news coverage' }) }

    const articles = Array.isArray(data.articles) ? data.articles : []
    if (!articles.length) return NextResponse.json({ query: target, Result: 'No recent news coverage (last 3 months)' })

    const result: Record<string, string> = {
      query: target,
      Result: `${articles.length}${articles.length >= 30 ? '+' : ''} articles (last 3 months)`,
    }

    const sources = Array.from(new Set(articles.map((a) => a.domain).filter(Boolean))).slice(0, 6)
    if (sources.length) result['Top sources'] = sources.join(', ')

    const countries = Array.from(new Set(articles.map((a) => a.sourcecountry).filter(Boolean))).slice(0, 6)
    if (countries.length) result['Source countries'] = countries.join(', ')

    result['Recent headlines'] = articles.slice(0, 8)
      .map((a) => `${fmtDate(a.seendate)} — ${a.title} (${a.domain})`)
      .join('\n')

    if (articles[0]?.url) result['Latest article'] = articles[0].url

    return NextResponse.json(result)
  } catch {
    // GDELT often resets the connection when throttled — soft-fail.
    return NextResponse.json({ query: target, Result: 'News lookup temporarily unavailable (GDELT throttled) — try again shortly' })
  }
}
