import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

const TECH_SIGNATURES: Record<string, string[]> = {
  'Next.js': ['x-powered-by: Next.js', 'x-nextjs'],
  'Nginx': ['server: nginx'],
  'Apache': ['server: apache'],
  'Cloudflare': ['cf-ray', 'cf-cache-status', 'server: cloudflare'],
  'Vercel': ['x-vercel-id'],
  'AWS': ['x-amz', 'x-amzn'],
  'WordPress': ['x-pingback'],
  'PHP': ['x-powered-by: php'],
  'ASP.NET': ['x-aspnet', 'x-powered-by: asp.net'],
  'Express': ['x-powered-by: express'],
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  let url = parsed.data.target
  if (!/^https?:\/\//.test(url)) url = `https://${url}`

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OSINTSuite/1.0)' },
      signal: AbortSignal.timeout(8000),
    })

    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })

    const result: Record<string, string> = {}
    result['Status'] = `${res.status} ${res.statusText}`
    result['Final URL'] = res.url

    // Key security / info headers
    const interesting = [
      'server', 'x-powered-by', 'content-type', 'content-security-policy',
      'strict-transport-security', 'x-frame-options', 'x-content-type-options',
      'x-xss-protection', 'referrer-policy', 'permissions-policy',
      'cache-control', 'last-modified', 'etag',
      'cf-ray', 'x-vercel-id', 'x-amzn-requestid', 'x-request-id',
    ]

    for (const key of interesting) {
      const val = headers[key]
      if (val) result[key] = val
    }

    // Detect technologies
    const headersLower = Object.entries(headers).map(([k, v]) => `${k}: ${v}`.toLowerCase())
    const detected: string[] = []
    for (const [tech, signatures] of Object.entries(TECH_SIGNATURES)) {
      if (signatures.some((sig) => headersLower.some((h) => h.includes(sig)))) {
        detected.push(tech)
      }
    }
    if (detected.length) result['Detected Technologies'] = detected.join(', ')

    // Security score (naive)
    const securityHeaders = ['strict-transport-security', 'content-security-policy', 'x-frame-options', 'x-content-type-options']
    const present = securityHeaders.filter((h) => headers[h]).length
    result['Security Headers'] = `${present}/${securityHeaders.length} present`

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
