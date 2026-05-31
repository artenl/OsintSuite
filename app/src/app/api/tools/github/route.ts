import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(39) })

// GitHub user API — structured profile for a username. Free, no key (60 req/hr/IP).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid username' }, { status: 400 })

  const username = parsed.data.target.trim().replace(/^@/, '')

  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'OSINTSuite/1.0' },
      signal: AbortSignal.timeout(10000),
    })

    if (res.status === 404) return NextResponse.json({ Username: username, Result: 'No GitHub account with this username' })
    if (res.status === 403) return NextResponse.json({ error: 'GitHub rate limit reached (60/hr) — try again later' }, { status: 429 })
    if (!res.ok) return NextResponse.json({ error: `GitHub returned ${res.status}` }, { status: res.status })

    const d = await res.json()
    const result: Record<string, string> = { Username: d.login ?? username }

    if (d.name) result['Name'] = d.name
    if (d.bio) result['Bio'] = d.bio
    if (d.company) result['Company'] = d.company
    if (d.location) result['Location'] = d.location
    if (d.email) result['Public Email'] = d.email
    if (d.blog) result['Website'] = d.blog
    if (d.twitter_username) result['Twitter'] = `@${d.twitter_username}`
    if (typeof d.public_repos === 'number') result['Public Repos'] = String(d.public_repos)
    if (typeof d.followers === 'number') result['Followers'] = String(d.followers)
    if (d.created_at) result['Account Created'] = String(d.created_at).split('T')[0]
    if (d.updated_at) result['Last Active'] = String(d.updated_at).split('T')[0]
    if (d.hireable) result['Hireable'] = 'Yes'
    if (d.html_url) result['Profile'] = d.html_url
    if (d.avatar_url) result['Avatar'] = d.avatar_url

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
