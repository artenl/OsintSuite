import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { screen } from '@/lib/ofac'

const schema = z.object({ target: z.string().min(2).max(120) })

// Screen a name (person or entity) against the OFAC SDN sanctions list.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Enter a name to screen (2+ chars)' }, { status: 400 })

  try {
    const r = await screen(parsed.data.target.trim())
    return NextResponse.json({
      query: parsed.data.target.trim(),
      Result: r.count > 0 ? `⚠ ${r.count} possible OFAC match${r.count > 1 ? 'es' : ''}` : '✓ No OFAC sanctions matches',
      count: r.count,
      listSize: r.total,
      matches: r.matches,
    })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'OFAC list download timed out — try again' : String(err)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
