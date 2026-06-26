import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

const ALLOWED = ['virustotal', 'shodan', 'hibp', 'urlscan', 'gemini', 'abusech', 'aisstream', 'firms', 'acled']

function requireAdmin(req: NextRequest) {
  return req.headers.get('x-user-role') !== 'admin'
}

export async function GET(req: NextRequest) {
  if (requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const all = await db.query.apiKeys.findMany()
  return NextResponse.json(
    ALLOWED.map((service) => ({
      service,
      hasKey: all.some((k) => k.service === service),
    }))
  )
}

export async function PUT(req: NextRequest) {
  if (requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = z.object({ service: z.enum(['virustotal', 'shodan', 'hibp', 'urlscan', 'gemini', 'abusech', 'aisstream', 'firms', 'acled']), key: z.string().min(1) }).safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 })

  const { service, key } = parsed.data
  const existing = await db.query.apiKeys.findFirst({ where: eq(apiKeys.service, service) })

  if (existing) {
    await db.update(apiKeys).set({ keyValue: key, updatedAt: new Date() }).where(eq(apiKeys.service, service))
  } else {
    await db.insert(apiKeys).values({ id: crypto.randomUUID(), service, keyValue: key, updatedAt: new Date() })
  }

  return NextResponse.json({ ok: true })
}
