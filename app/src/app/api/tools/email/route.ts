import { NextRequest, NextResponse } from 'next/server'
import { resolveMx } from 'dns/promises'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ target: z.string().email() })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

  const email = parsed.data.target
  const domain = email.split('@')[1]

  const result: Record<string, unknown> = {
    email,
    validFormat: true,
  }

  // MX records
  try {
    const mx = await resolveMx(domain)
    result.mxRecords = mx.sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`)
  } catch {
    result.mxRecords = []
  }

  // HIBP (if API key configured)
  const hibpKey = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'hibp') })

  if (hibpKey) {
    try {
      const hibpRes = await fetch(
        `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`,
        {
          headers: {
            'hibp-api-key': hibpKey.keyValue,
            'user-agent': 'OSINTSuite/1.0',
          },
          signal: AbortSignal.timeout(8000),
        }
      )

      if (hibpRes.status === 404) {
        result.hibp = { breached: false }
      } else if (hibpRes.ok) {
        const breaches = await hibpRes.json()
        result.hibp = {
          breached: true,
          count: breaches.length,
          breaches: breaches.map((b: Record<string, string>) => b.Name),
        }
      } else {
        result.hibp = { error: `HIBP API returned ${hibpRes.status}` }
      }
    } catch {
      result.hibp = { error: 'HIBP request failed' }
    }
  } else {
    result.hibp = { error: 'No HIBP API key configured (Settings → API Keys)' }
  }

  return NextResponse.json(result)
}
