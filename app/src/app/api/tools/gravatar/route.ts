import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { z } from 'zod'

const schema = z.object({ target: z.string().email() })

// Gravatar profile lookup by email. Free, no key. Reveals a public profile
// (display name, location, bio) and any linked social accounts.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })

  const email = parsed.data.target.trim().toLowerCase()
  const hash = createHash('md5').update(email).digest('hex')

  try {
    const res = await fetch(`https://gravatar.com/${hash}.json`, {
      headers: { 'user-agent': 'OSINTSuite/1.0', accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 404) {
      return NextResponse.json({ Email: email, Result: 'No public Gravatar profile for this email' })
    }
    if (!res.ok) return NextResponse.json({ error: `Gravatar returned ${res.status}` }, { status: res.status })

    const data = await res.json()
    const entry = data?.entry?.[0]
    if (!entry) return NextResponse.json({ Email: email, Result: 'No public Gravatar profile for this email' })

    const result: Record<string, string> = { Email: email }
    result['Gravatar Found'] = '✓ Yes — this email has a public profile'
    if (entry.displayName) result['Display Name'] = entry.displayName
    if (entry.name?.formatted) result['Full Name'] = entry.name.formatted
    if (entry.currentLocation) result['Location'] = entry.currentLocation
    if (entry.aboutMe) result['About'] = entry.aboutMe
    if (entry.profileUrl) result['Profile'] = entry.profileUrl
    if (entry.thumbnailUrl) result['Avatar'] = entry.thumbnailUrl

    if (Array.isArray(entry.accounts) && entry.accounts.length) {
      result['Linked Accounts'] = entry.accounts
        .map((a: Record<string, string>) => `${a.shortname ?? a.name ?? '?'}: ${a.url ?? ''}`)
        .join('\n')
    }
    if (Array.isArray(entry.urls) && entry.urls.length) {
      result['Listed URLs'] = entry.urls
        .map((u: Record<string, string>) => `${u.title ? u.title + ': ' : ''}${u.value ?? ''}`)
        .join('\n')
    }

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
