import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const schema = z.object({
  target: z.string().min(1).max(253),
  type: z.string().optional(),
  results: z.record(z.unknown()),
})

const MODEL = 'gemini-2.5-flash'

// Flatten the per-tool results map into a compact text block for the LLM.
function buildEvidence(results: Record<string, unknown>): string {
  const lines: string[] = []
  for (const [tool, entry] of Object.entries(results)) {
    const e = entry as { status?: string; data?: unknown; error?: string }
    if (e?.status === 'done' && e.data && typeof e.data === 'object') {
      lines.push(`## ${tool}`)
      for (const [k, v] of Object.entries(e.data as Record<string, unknown>)) {
        if (v === null || v === undefined || v === '') continue
        const val = typeof v === 'object' ? JSON.stringify(v) : String(v)
        lines.push(`- ${k}: ${val.length > 600 ? val.slice(0, 600) + '…' : val}`)
      }
    } else if (e?.status === 'error') {
      lines.push(`## ${tool}\n- (failed: ${e.error})`)
    }
  }
  return lines.join('\n')
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'unknown'] },
    summary: { type: 'string' },
    keyFindings: { type: 'array', items: { type: 'string' } },
    recommendedNextSteps: { type: 'array', items: { type: 'string' } },
  },
  required: ['riskLevel', 'summary', 'keyFindings', 'recommendedNextSteps'],
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const keyRow = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, 'gemini') })
  if (!keyRow) {
    return NextResponse.json({ error: 'No Gemini API key configured (Settings → API Keys). Get a free key at aistudio.google.com.' }, { status: 503 })
  }

  const { target, type, results } = parsed.data
  const evidence = buildEvidence(results)
  if (!evidence.trim()) {
    return NextResponse.json({ error: 'No completed tool results to analyze yet' }, { status: 400 })
  }

  const prompt = `You are a senior OSINT and threat-intelligence analyst. Analyze the reconnaissance data below for the target "${target}" (${type ?? 'unknown type'}).

Produce a tight, factual assessment. Base every claim ONLY on the evidence provided — never invent data. If signals conflict or are missing, say so.

Guidance:
- riskLevel: weigh malicious flags (VirusTotal/abuse.ch/urlscan), exposed services & CVEs (Shodan/InternetDB), suspicious infra, missing email security (SPF/DMARC/DKIM), and cert/registration anomalies.
- summary: 2-4 sentences a non-expert can understand — what this target is and whether it looks legitimate, suspicious, or malicious.
- keyFindings: the most important concrete observations (open ports, CVEs, blacklist hits, subdomains of note, registrar/age, tech stack).
- recommendedNextSteps: specific follow-up investigative actions.

EVIDENCE:
${evidence}`

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${keyRow.keyValue}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (res.status === 400) return NextResponse.json({ error: 'Gemini rejected the request (check the API key is valid)' }, { status: 400 })
    if (res.status === 429) return NextResponse.json({ error: 'Gemini rate limit reached (free tier). Try again shortly.' }, { status: 429 })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const msg = (errBody as { error?: { message?: string } })?.error?.message
      return NextResponse.json({ error: msg || `Gemini returned ${res.status}` }, { status: res.status })
    }

    const data = await res.json()
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) return NextResponse.json({ error: 'Gemini returned an empty response' }, { status: 502 })

    let analysis
    try {
      analysis = JSON.parse(text)
    } catch {
      return NextResponse.json({ error: 'Could not parse the analysis', raw: text }, { status: 502 })
    }

    return NextResponse.json({ model: MODEL, ...analysis })
  } catch (err) {
    const msg = String(err).includes('timeout') ? 'Gemini request timed out' : String(err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
