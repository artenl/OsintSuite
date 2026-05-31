import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

// VirusTotal v3 — domain / IP reputation. Uses the stored 'virustotal' key (free tier: 500/day).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'virustotal') })
  if (!keyRow) return NextResponse.json({ error: 'No VirusTotal API key configured (Settings → API Keys)' }, { status: 503 })

  const target = parsed.data.target.toLowerCase().replace(/^https?:\/\//, '').split('/')[0]
  const isIp = isIpv4(target)
  const url = isIp
    ? `https://www.virustotal.com/api/v3/ip_addresses/${target}`
    : `https://www.virustotal.com/api/v3/domains/${target}`

  try {
    const res = await fetch(url, {
      headers: { 'x-apikey': keyRow.keyValue, accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    })

    if (res.status === 404) return NextResponse.json({ error: 'Not found in VirusTotal' }, { status: 404 })
    if (res.status === 401) return NextResponse.json({ error: 'VirusTotal rejected the API key' }, { status: 401 })
    if (res.status === 429) return NextResponse.json({ error: 'VirusTotal rate limit reached (free tier: 4/min, 500/day)' }, { status: 429 })
    if (!res.ok) return NextResponse.json({ error: `VirusTotal returned ${res.status}` }, { status: res.status })

    const data = await res.json()
    const attr = data?.data?.attributes ?? {}
    const result: Record<string, string> = {}

    const stats = attr.last_analysis_stats as Record<string, number> | undefined
    if (stats) {
      const mal = stats.malicious ?? 0
      const susp = stats.suspicious ?? 0
      const harmless = stats.harmless ?? 0
      const undet = stats.undetected ?? 0
      result['Detections'] = `${mal} malicious · ${susp} suspicious · ${harmless} harmless · ${undet} undetected`
      result['Verdict'] = mal > 0 ? `⚠ Flagged by ${mal} engine(s)` : susp > 0 ? `⚠ ${susp} engine(s) suspicious` : '✓ Clean'
    }

    if (typeof attr.reputation === 'number') result['Community Reputation'] = String(attr.reputation)

    if (Array.isArray(attr.categories) || (attr.categories && typeof attr.categories === 'object')) {
      const cats = Array.isArray(attr.categories) ? attr.categories : Object.values(attr.categories)
      const uniq = Array.from(new Set(cats as string[]))
      if (uniq.length) result['Categories'] = uniq.join(', ')
    }

    if (attr.last_analysis_date) {
      result['Last Analyzed'] = new Date(attr.last_analysis_date * 1000).toISOString().split('T')[0]
    }

    if (isIp) {
      if (attr.as_owner) result['AS Owner'] = attr.as_owner
      if (attr.country) result['Country'] = attr.country
    } else {
      if (attr.registrar) result['Registrar'] = attr.registrar
      if (Array.isArray(attr.last_dns_records)) {
        const types = Array.from(new Set(attr.last_dns_records.map((r: Record<string, string>) => r.type)))
        if (types.length) result['DNS Record Types'] = types.join(', ')
      }
    }

    if (Object.keys(result).length === 0) result['Result'] = 'No reputation data available'

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
