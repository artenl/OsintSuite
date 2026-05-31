import { NextRequest, NextResponse } from 'next/server'
import http from 'node:http'
import https from 'node:https'
import { z } from 'zod'

const schema = z.object({
  target: z.string().min(1).max(253),
  port: z.number().int().min(1).max(65535).optional(),
})

type Probe = {
  port: number
  scheme: 'http' | 'https'
  status?: number
  server?: string
  realm?: string
  authRequired?: boolean
  error?: string
}

// Map noisy low-level socket errors to a short, readable reason.
function shortError(e: NodeJS.ErrnoException): string {
  if (e.code === 'ECONNREFUSED') return 'connection refused'
  if (e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH') return 'host unreachable'
  if (e.code === 'ETIMEDOUT' || e.code === 'UND_ERR_CONNECT_TIMEOUT') return 'timeout'
  if (e.code === 'ECONNRESET') return 'connection reset'
  if (e.code === 'ENOTFOUND') return 'host not found'
  if (/wrong version number|SSL routines|EPROTO/.test(e.message)) return 'not TLS on this port'
  return e.code || 'no response'
}

// Connect, send GET /, read ONLY the response headers, then destroy the socket
// before any body arrives. Never sends credentials, never requests media endpoints.
function probe(host: string, port: number, scheme: 'http' | 'https'): Promise<Probe> {
  return new Promise((resolve) => {
    const lib = scheme === 'https' ? https : http
    const req = lib.request(
      {
        host,
        port,
        path: '/',
        method: 'GET',
        timeout: 5000,
        rejectUnauthorized: false, // device certs are usually self-signed
        headers: { 'User-Agent': 'OSINTSuite-ExposureCheck/1.0' },
      },
      (res) => {
        const wwwAuth = res.headers['www-authenticate']
        const realmMatch = typeof wwwAuth === 'string' ? wwwAuth.match(/realm="?([^"]+)"?/i) : null
        const out: Probe = {
          port,
          scheme,
          status: res.statusCode,
          server: typeof res.headers.server === 'string' ? res.headers.server : undefined,
          realm: realmMatch?.[1],
          authRequired: !!wwwAuth || res.statusCode === 401 || res.statusCode === 403,
        }
        res.destroy() // do NOT read the body — headers are all we inspect
        resolve(out)
      }
    )
    req.on('timeout', () => { req.destroy(); resolve({ port, scheme, error: 'timeout' }) })
    req.on('error', (e) => resolve({ port, scheme, error: shortError(e as NodeJS.ErrnoException) }))
    req.end()
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const host = parsed.data.target.trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0]

  const candidates: { port: number; scheme: 'http' | 'https' }[] = parsed.data.port
    ? [
        { port: parsed.data.port, scheme: 'http' },
        { port: parsed.data.port, scheme: 'https' },
      ]
    : [
        { port: 80, scheme: 'http' },
        { port: 8080, scheme: 'http' },
        { port: 8000, scheme: 'http' },
        { port: 443, scheme: 'https' },
        { port: 8443, scheme: 'https' },
      ]

  const probes = await Promise.all(candidates.map((c) => probe(host, c.port, c.scheme)))
  const responded = probes.filter((p) => typeof p.status === 'number')

  let verdict: 'open' | 'protected' | 'reachable' | 'unreachable'
  let exposure: string
  const openOnes = responded.filter((p) => !p.authRequired && (p.status! < 400 || p.status === 404))
  const protectedOnes = responded.filter((p) => p.authRequired)

  if (openOnes.length) {
    verdict = 'open'
    exposure = '⚠ Responds without an authentication challenge — exposure confirmed at the HTTP level. Only access devices you own or are authorized to test.'
  } else if (protectedOnes.length) {
    verdict = 'protected'
    exposure = '🔒 Reachable but requires credentials (auth challenge present) — not openly exposed.'
  } else if (responded.length) {
    verdict = 'reachable'
    exposure = 'Reachable but returned no clear auth state — inconclusive.'
  } else {
    verdict = 'unreachable'
    exposure = '○ Not reachable on common web ports — likely offline or firewalled. Shodan data is often stale.'
  }

  const result: Record<string, string> = { Target: host, Verdict: exposure }
  const lines = probes.map((p) =>
    p.error
      ? `${p.scheme}/${p.port}: no response (${p.error})`
      : `${p.scheme}/${p.port}: HTTP ${p.status}${p.authRequired ? ' — auth required' : ' — no auth challenge'}${p.server ? ` [${p.server}]` : ''}${p.realm ? ` realm="${p.realm}"` : ''}`
  )
  result['Probes'] = lines.join('\n')

  const fingerprints = Array.from(new Set(probes.flatMap((p) => [p.server, p.realm].filter(Boolean) as string[])))
  if (fingerprints.length) result['Fingerprints'] = fingerprints.join(', ')

  return NextResponse.json({ ...result, _verdict: verdict })
}
