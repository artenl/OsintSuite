import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

const isIpv4 = (s: string) => /^\d{1,3}(\.\d{1,3}){3}$/.test(s)

// crt.sh — subdomain discovery via Certificate Transparency logs. Free, no key.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const domain = parsed.data.target.toLowerCase().replace(/^\*\./, '')
  if (isIpv4(domain)) {
    return NextResponse.json({ error: 'Subdomain discovery requires a domain, not an IP' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `https://crt.sh/?q=${encodeURIComponent('%.' + domain)}&output=json`,
      { signal: AbortSignal.timeout(20000), headers: { accept: 'application/json' } }
    )

    if (!res.ok) {
      return NextResponse.json({ error: `crt.sh returned ${res.status}` }, { status: 502 })
    }

    const text = await res.text()
    if (!text.trim()) {
      return NextResponse.json({ Domain: domain, Result: 'No certificates found in CT logs' })
    }

    let rows: Array<{ name_value?: string; common_name?: string }>
    try {
      rows = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'crt.sh returned an unexpected response' }, { status: 502 })
    }

    const set = new Set<string>()
    for (const row of rows) {
      const names = `${row.name_value ?? ''}\n${row.common_name ?? ''}`.split(/\n/)
      for (let name of names) {
        name = name.trim().toLowerCase().replace(/^\*\./, '')
        if (!name) continue
        if (name === domain || name.endsWith('.' + domain)) set.add(name)
      }
    }

    const subs = Array.from(set).sort()
    if (!subs.length) {
      return NextResponse.json({ Domain: domain, Result: 'No subdomains found in CT logs' })
    }

    return NextResponse.json({
      Domain: domain,
      'Subdomains Found': String(subs.length),
      Subdomains: subs.join('\n'),
    })
  } catch (err) {
    const msg = String(err).includes('timeout')
      ? 'crt.sh timed out (the service is often slow for large domains — try again)'
      : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
