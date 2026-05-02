import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { resolve4 } from 'dns/promises'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'shodan') })
  if (!keyRow) return NextResponse.json({ error: 'No Shodan API key configured (Settings → API Keys)' }, { status: 503 })

  let ip = parsed.data.target
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)
  if (!isIp) {
    try {
      const addrs = await resolve4(ip)
      if (!addrs.length) throw new Error('No A record')
      ip = addrs[0]
    } catch {
      return NextResponse.json({ error: 'Could not resolve hostname to IP' }, { status: 400 })
    }
  }

  try {
    const res = await fetch(
      `https://api.shodan.io/shodan/host/${ip}?key=${keyRow.keyValue}`,
      { signal: AbortSignal.timeout(10000) }
    )

    if (res.status === 404) return NextResponse.json({ error: 'No Shodan data for this IP' }, { status: 404 })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json({ error: (err as Record<string,string>).error || `Shodan error ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const result: Record<string, string> = {}

    result['IP'] = data.ip_str ?? ip
    if (data.org) result['Organization'] = data.org
    if (data.isp) result['ISP'] = data.isp
    if (data.country_name) result['Country'] = `${data.country_name}${data.city ? ` (${data.city})` : ''}`
    if (data.os) result['OS'] = data.os
    if (data.asn) result['ASN'] = data.asn
    if (data.last_update) result['Last Updated'] = data.last_update

    if (data.ports?.length) result['Open Ports'] = (data.ports as number[]).sort((a, b) => a - b).join(', ')

    if (data.hostnames?.length) result['Hostnames'] = (data.hostnames as string[]).join(', ')
    if (data.domains?.length) result['Domains'] = (data.domains as string[]).join(', ')

    if (data.vulns && Object.keys(data.vulns).length) {
      result['CVEs'] = Object.keys(data.vulns).join(', ')
    }

    const banners: string[] = []
    if (Array.isArray(data.data)) {
      for (const svc of data.data.slice(0, 5)) {
        const port = svc.port
        const product = svc.product || svc.transport || ''
        const version = svc.version || ''
        banners.push(`${port}/${svc.transport ?? 'tcp'}${product ? ` — ${product}${version ? ' ' + version : ''}` : ''}`)
      }
    }
    if (banners.length) result['Services'] = banners.join('\n')

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
