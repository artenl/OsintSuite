import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })
const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

// Shodan passive DNS pivot (uses /dns/* — DNS lookups, not query credits).
// Domain -> subdomains + observed DNS records. IP -> reverse PTR hostnames.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'shodan') })
  if (!keyRow) return NextResponse.json({ error: 'No Shodan API key configured (Settings → API Keys)' }, { status: 503 })
  const key = keyRow.keyValue

  const target = parsed.data.target.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]

  try {
    if (isIpv4(target)) {
      const res = await fetch(`https://api.shodan.io/dns/reverse?ips=${target}&key=${key}`, { signal: AbortSignal.timeout(12000) })
      if (res.status === 401) return NextResponse.json({ error: 'Shodan rejected the API key' }, { status: 401 })
      if (!res.ok) return NextResponse.json({ error: `Shodan returned ${res.status}` }, { status: res.status })
      const data = await res.json()
      const names = (data[target] as string[]) || []
      const result: Record<string, string> = { IP: target }
      if (names.length) result['Reverse DNS (PTR)'] = names.join('\n')
      else result['Reverse DNS (PTR)'] = 'No PTR records known to Shodan'
      return NextResponse.json(result)
    }

    const res = await fetch(`https://api.shodan.io/dns/domain/${encodeURIComponent(target)}?key=${key}`, { signal: AbortSignal.timeout(15000) })
    if (res.status === 401) return NextResponse.json({ error: 'Shodan rejected the API key' }, { status: 401 })
    if (res.status === 404) return NextResponse.json({ error: 'No Shodan DNS data for this domain' }, { status: 404 })
    if (res.status === 403) return NextResponse.json({ error: 'This Shodan endpoint requires a paid plan' }, { status: 403 })
    if (!res.ok) return NextResponse.json({ error: `Shodan returned ${res.status}` }, { status: res.status })

    const data = await res.json()
    const result: Record<string, string> = { Domain: target }

    const subs = Array.isArray(data.subdomains) ? (data.subdomains as string[]) : []
    if (subs.length) {
      result['Subdomains Found'] = String(subs.length)
      result['Subdomains'] = subs.slice(0, 300).map((s) => `${s}.${target}`).sort().join('\n')
    }

    const records = Array.isArray(data.data) ? (data.data as Record<string, string>[]) : []
    if (records.length) {
      const byType: Record<string, number> = {}
      for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1
      result['DNS Record Types'] = Object.entries(byType).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t} (${n})`).join(', ')

      result['Sample Records'] = records.slice(0, 30).map((r) => {
        const host = r.subdomain ? `${r.subdomain}.${target}` : target
        return `${host}  ${r.type}  ${r.value}${r.last_seen ? `  (${String(r.last_seen).split('T')[0]})` : ''}`
      }).join('\n')
    }

    if (Array.isArray(data.tags) && data.tags.length) result['Tags'] = (data.tags as string[]).join(', ')
    if (data.more) result['Note'] = 'More records available on Shodan (truncated)'

    if (!subs.length && !records.length) result['Result'] = 'No passive DNS data for this domain'

    return NextResponse.json(result)
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Shodan DNS request timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
