import { NextRequest, NextResponse } from 'next/server'
import { resolve4 } from 'dns/promises'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

// Shodan InternetDB — free, no API key required.
// Returns open ports, known CVEs, hostnames and tags for an IP.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  let ip = parsed.data.target
  if (!isIpv4(ip)) {
    try {
      const addrs = await resolve4(ip)
      if (!addrs.length) throw new Error('No A record')
      ip = addrs[0]
    } catch {
      return NextResponse.json({ error: 'Could not resolve hostname to an IPv4 address' }, { status: 400 })
    }
  }

  try {
    const res = await fetch(`https://internetdb.shodan.io/${ip}`, {
      signal: AbortSignal.timeout(10000),
      headers: { accept: 'application/json' },
    })

    if (res.status === 404) {
      return NextResponse.json({ IP: ip, Result: 'No InternetDB data for this IP (not indexed)' })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `InternetDB returned ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const result: Record<string, string> = { IP: data.ip ?? ip }

    if (Array.isArray(data.ports) && data.ports.length) {
      result['Open Ports'] = (data.ports as number[]).sort((a, b) => a - b).join(', ')
    }
    if (Array.isArray(data.vulns) && data.vulns.length) {
      result['CVEs'] = (data.vulns as string[]).join(', ')
      result['CVE Count'] = String(data.vulns.length)
    }
    if (Array.isArray(data.hostnames) && data.hostnames.length) {
      result['Hostnames'] = (data.hostnames as string[]).join(', ')
    }
    if (Array.isArray(data.tags) && data.tags.length) {
      result['Tags'] = (data.tags as string[]).join(', ')
    }
    if (Array.isArray(data.cpes) && data.cpes.length) {
      result['Detected Software (CPE)'] = (data.cpes as string[]).join('\n')
    }

    if (Object.keys(result).length === 1) {
      result['Result'] = 'IP is indexed but has no open ports, CVEs or tags'
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
