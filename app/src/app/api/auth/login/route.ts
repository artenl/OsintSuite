import { NextRequest, NextResponse } from 'next/server'
import { compareSync } from 'bcryptjs'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { signSession, makeSessionCookie } from '@/lib/auth/session'
import { checkRateLimit, clearRateLimit } from '@/lib/utils'
import { z } from 'zod'

const schema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many login attempts. Try again in 15 minutes.' }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { username, password } = parsed.data

  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
  })

  if (!user || !compareSync(password, user.passwordHash)) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 })
  }

  clearRateLimit(ip)

  const token = await signSession({ sub: user.id, username: user.username, role: user.role })
  const cookie = makeSessionCookie(token)

  const res = NextResponse.json({ ok: true, username: user.username, role: user.role })
  res.cookies.set(cookie)
  return res
}
