import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ hex: z.string().max(10).optional(), callsign: z.string().max(12).optional() })

// Enrich a clicked aircraft using adsbdb (free, no key): route by callsign,
// aircraft details by mode-s hex.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success || (!parsed.data.hex && !parsed.data.callsign)) {
    return NextResponse.json({ error: 'Provide hex or callsign' }, { status: 400 })
  }

  const { hex, callsign } = parsed.data
  const opts = { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) }

  const [routeRes, acRes] = await Promise.all([
    callsign ? fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign.trim())}`, opts).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
    hex ? fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(hex.trim())}`, opts).then((r) => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null),
  ])

  const result: Record<string, unknown> = {}

  const fr = routeRes?.response?.flightroute
  if (fr) {
    const ap = (a: Record<string, unknown> | undefined) => a ? {
      name: a.name, iata: a.iata_code, icao: a.icao_code, city: a.municipality, country: a.country_name,
    } : null
    result.route = {
      airline: fr.airline?.name ?? null,
      airlineCountry: fr.airline?.country ?? null,
      callsignIata: fr.callsign_iata ?? null,
      origin: ap(fr.origin),
      destination: ap(fr.destination),
    }
  }

  const ac = acRes?.response?.aircraft
  if (ac) {
    result.aircraft = {
      type: ac.type ?? null,
      icaoType: ac.icao_type ?? null,
      manufacturer: ac.manufacturer ?? null,
      registration: ac.registration ?? null,
      owner: ac.registered_owner ?? null,
      ownerCountry: ac.registered_owner_country_name ?? null,
      photo: ac.url_photo_thumbnail ?? null,
    }
  }

  return NextResponse.json(result)
}
