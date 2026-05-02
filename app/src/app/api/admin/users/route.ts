import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { hashSync } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

function requireAdmin(req: NextRequest) {
  return req.headers.get('x-user-role') !== 'admin'
}

const createSchema = z.object({
  username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/),
  password: z.string().min(8).max(256),
  email: z.string().email().nullable().optional(),
  role: z.enum(['admin', 'user']).default('user'),
})

export async function GET(req: NextRequest) {
  if (requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const all = await db.query.users.findMany({
    columns: { passwordHash: false },
  })
  return NextResponse.json(all)
}

export async function POST(req: NextRequest) {
  if (requireAdmin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 })

  const existing = await db.query.users.findFirst({ where: eq(users.username, parsed.data.username) })
  if (existing) return NextResponse.json({ error: 'Username already taken' }, { status: 409 })

  const id = crypto.randomUUID()
  const passwordHash = hashSync(parsed.data.password, 12)

  await db.insert(users).values({
    id,
    username: parsed.data.username,
    email: parsed.data.email ?? null,
    passwordHash,
    role: parsed.data.role,
    createdAt: new Date(),
    createdBy: req.headers.get('x-user-id'),
  })

  return NextResponse.json({ id, username: parsed.data.username }, { status: 201 })
}
