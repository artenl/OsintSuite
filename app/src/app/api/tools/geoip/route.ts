import { NextRequest, NextResponse } from 'next/server'
import { resolve4 } from 'dns/promises'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

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
    const geoRes = await fetch(
      `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,regionName,city,zip,lat,lon,timezone,isp,org,as,query`,
      { signal: AbortSignal.timeout(8000) }
    )
    const geo = await geoRes.json()

    const bgp = await fetch(`https://api.bgpview.io/ip/${ip}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.json())
      .catch(() => null)

    const result: Record<string, string> = {}

    result['IP Address'] = ip

    if (geo.status === 'success') {
      if (geo.country) result['Country'] = `${geo.country} (${geo.countryCode})`
      if (geo.regionName) result['Region'] = geo.regionName
      if (geo.city) result['City'] = geo.city
      if (geo.zip) result['Postal Code'] = geo.zip
      if (geo.lat && geo.lon) result['Coordinates'] = `${geo.lat}, ${geo.lon}`
      if (geo.timezone) result['Timezone'] = geo.timezone
      if (geo.isp) result['ISP'] = geo.isp
      if (geo.org) result['Organization'] = geo.org
      if (geo.as) result['AS'] = geo.as
    }

    if (bgp?.status === 'ok') {
      const d = bgp.data
      if (d?.prefixes?.[0]) {
        const prefix = d.prefixes[0]
        if (prefix.prefix) result['BGP Prefix'] = prefix.prefix
        if (prefix.name) result['BGP Name'] = prefix.name
        if (prefix.description) result['BGP Description'] = prefix.description
        if (prefix.asn?.asn) result['BGP ASN'] = `AS${prefix.asn.asn} (${prefix.asn.name || ''})`
        if (prefix.country_code) result['BGP Country'] = prefix.country_code
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
