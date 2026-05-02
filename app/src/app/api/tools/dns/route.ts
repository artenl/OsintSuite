import { NextRequest, NextResponse } from 'next/server'
import { resolve4, resolve6, resolveMx, resolveNs, resolveTxt, resolveCname, resolveSoa, reverse } from 'dns/promises'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try { return await fn() } catch { return null }
}

const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const { target } = parsed.data

  // For IPs, do reverse PTR lookup instead
  if (isIpv4(target)) {
    const ptr = await safe(() => reverse(target))
    if (!ptr?.length) return NextResponse.json({ error: 'No PTR record found for this IP' }, { status: 404 })
    return NextResponse.json({ 'PTR (Reverse DNS)': ptr.join(', ') })
  }

  const [a, aaaa, mx, ns, txt, cname, soa] = await Promise.all([
    safe(() => resolve4(target)),
    safe(() => resolve6(target)),
    safe(() => resolveMx(target)),
    safe(() => resolveNs(target)),
    safe(() => resolveTxt(target)),
    safe(() => resolveCname(target)),
    safe(() => resolveSoa(target)),
  ])

  const result: Record<string, unknown> = {}

  if (a?.length) result['A (IPv4)'] = a.join(', ')
  if (aaaa?.length) result['AAAA (IPv6)'] = aaaa.join(', ')
  if (mx?.length) result['MX'] = mx.sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`).join('\n')
  if (ns?.length) result['NS'] = ns.join('\n')
  if (cname?.length) result['CNAME'] = cname.join(', ')
  if (txt?.length) {
    const flat = txt.map((r) => r.join(''))
    result['TXT'] = flat.join('\n')

    const spf = flat.find((r) => r.startsWith('v=spf'))
    if (spf) result['SPF'] = spf

    const dmarc = flat.find((r) => r.startsWith('v=DMARC'))
    if (dmarc) result['DMARC'] = dmarc

    const dkim = flat.filter((r) => r.includes('k=rsa') || r.includes('p='))
    if (dkim.length) result['DKIM entries'] = dkim.length.toString()
  }
  if (soa) {
    result['SOA Primary NS'] = soa.nsname
    result['SOA Email'] = soa.hostmaster
    result['SOA Serial'] = soa.serial.toString()
    result['SOA TTL'] = `${soa.minttl}s`
  }

  if (Object.keys(result).length === 0) {
    return NextResponse.json({ error: 'No DNS records found or domain does not exist' }, { status: 404 })
  }

  return NextResponse.json(result)
}
