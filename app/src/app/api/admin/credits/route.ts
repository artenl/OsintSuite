import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  if (req.headers.get('x-user-role') !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const results = await Promise.all([
    checkShodan(),
    checkVirusTotal(),
    checkUrlScan(),
    checkHibp(),
  ])

  return NextResponse.json(results)
}

async function checkShodan() {
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'shodan') })
  if (!row) return { service: 'shodan', configured: false }
  try {
    const res = await fetch(`https://api.shodan.io/api-info?key=${row.keyValue}`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { service: 'shodan', configured: true, error: `HTTP ${res.status}` }
    const d = await res.json()
    return {
      service: 'shodan',
      configured: true,
      plan: d.plan,
      credits: [
        { label: 'Query credits', used: null, remaining: d.query_credits },
        { label: 'Scan credits', used: null, remaining: d.scan_credits },
      ],
      unlocked: d.unlocked,
    }
  } catch (e) {
    return { service: 'shodan', configured: true, error: String(e) }
  }
}

async function checkVirusTotal() {
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'virustotal') })
  if (!row) return { service: 'virustotal', configured: false }
  try {
    const res = await fetch('https://www.virustotal.com/api/v3/users/me', {
      headers: { 'x-apikey': row.keyValue },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { service: 'virustotal', configured: true, error: `HTTP ${res.status}` }
    const d = await res.json()
    const q = d?.data?.attributes?.quotas
    const daily = q?.api_requests_daily
    const monthly = q?.api_requests_monthly
    return {
      service: 'virustotal',
      configured: true,
      plan: d?.data?.attributes?.status ?? 'unknown',
      credits: [
        ...(daily ? [{ label: 'Daily requests', used: daily.used, remaining: daily.allowed - daily.used, total: daily.allowed }] : []),
        ...(monthly ? [{ label: 'Monthly requests', used: monthly.used, remaining: monthly.allowed - monthly.used, total: monthly.allowed }] : []),
      ],
    }
  } catch (e) {
    return { service: 'virustotal', configured: true, error: String(e) }
  }
}

async function checkUrlScan() {
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'urlscan') })
  if (!row) return { service: 'urlscan', configured: false }
  try {
    const res = await fetch('https://urlscan.io/user/quotas/', {
      headers: { 'API-Key': row.keyValue },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { service: 'urlscan', configured: true, error: `HTTP ${res.status}` }
    const d = await res.json()
    const scans = d?.limits?.private?.day
    const search = d?.limits?.search?.day
    return {
      service: 'urlscan',
      configured: true,
      plan: d?.subscription ?? 'free',
      credits: [
        ...(scans ? [{ label: 'Scans today', used: scans.used, remaining: scans.limit - scans.used, total: scans.limit }] : []),
        ...(search ? [{ label: 'Searches today', used: search.used, remaining: search.limit - search.used, total: search.limit }] : []),
      ],
    }
  } catch (e) {
    return { service: 'urlscan', configured: true, error: String(e) }
  }
}

async function checkHibp() {
  const row = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'hibp') })
  if (!row) return { service: 'hibp', configured: false }
  try {
    const res = await fetch('https://haveibeenpwned.com/api/v3/breachesdomain/example.com', {
      headers: { 'hibp-api-key': row.keyValue, 'user-agent': 'OSINTSuite/1.0' },
      signal: AbortSignal.timeout(8000),
    })
    if (res.status === 401) return { service: 'hibp', configured: true, error: 'Invalid API key' }
    return { service: 'hibp', configured: true, plan: 'paid', credits: [] }
  } catch (e) {
    return { service: 'hibp', configured: true, error: String(e) }
  }
}
