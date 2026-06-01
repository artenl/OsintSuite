import { NextRequest, NextResponse } from 'next/server'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { geocoder, carrier, timezones } from 'libphonenumber-geo-carrier'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(40) })

const TYPE_LABELS: Record<string, string> = {
  MOBILE: 'Mobile',
  FIXED_LINE: 'Landline',
  FIXED_LINE_OR_MOBILE: 'Landline or mobile',
  TOLL_FREE: 'Toll-free',
  PREMIUM_RATE: 'Premium rate',
  VOIP: 'VoIP',
  PERSONAL_NUMBER: 'Personal number',
  PAGER: 'Pager',
  UAN: 'UAN',
  SHARED_COST: 'Shared cost',
}

const REGION = typeof Intl.DisplayNames !== 'undefined' ? new Intl.DisplayNames(['en'], { type: 'region' }) : null

// Phone number intelligence via libphonenumber-js. Offline, free.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })

  const input = parsed.data.target.trim()
  const phone = parsePhoneNumberFromString(input.startsWith('+') ? input : `+${input.replace(/^00/, '')}`)
    || parsePhoneNumberFromString(input)

  if (!phone) {
    return NextResponse.json({ Input: input, Valid: '✗ Could not parse — include the country code (e.g. +33…)' })
  }

  const result: Record<string, string> = { Input: input }
  result['Valid'] = phone.isValid() ? '✓ Valid number' : phone.isPossible() ? '~ Possible but not confirmed valid' : '✗ Invalid number'

  if (phone.country) {
    const name = REGION?.of(phone.country)
    result['Country'] = name ? `${name} (${phone.country})` : phone.country
  }
  result['Country Code'] = `+${phone.countryCallingCode}`

  const type = phone.getType()
  if (type) result['Line Type'] = TYPE_LABELS[type] || type

  result['International'] = phone.formatInternational()
  result['National'] = phone.formatNational()
  result['E.164'] = phone.number

  // Carrier / region / timezone mapping (offline metadata).
  try {
    const [region, car, tz] = await Promise.all([
      geocoder(phone).catch(() => null),
      carrier(phone).catch(() => null),
      timezones(phone).catch(() => null),
    ])
    if (region) result['Region'] = region
    if (car) result['Carrier'] = car
    if (Array.isArray(tz) && tz.length) result['Timezone'] = tz.join(', ')
  } catch { /* metadata optional */ }

  result['Dial URI'] = phone.getURI()

  return NextResponse.json(result)
}
