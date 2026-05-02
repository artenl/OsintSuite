import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { investigations } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { z } from 'zod'

const createSchema = z.object({
  type: z.enum(['domain', 'ip', 'person', 'email', 'username']),
  target: z.string().min(1).max(500),
  notes: z.string().max(5000).optional(),
  data: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')!
  const all = await db.query.investigations.findMany({
    where: eq(investigations.userId, userId),
    orderBy: [desc(investigations.createdAt)],
  })
  return NextResponse.json(all)
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')!
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data' }, { status: 400 })

  const id = crypto.randomUUID()
  const now = new Date()

  await db.insert(investigations).values({
    id,
    userId,
    type: parsed.data.type,
    target: parsed.data.target,
    notes: parsed.data.notes ?? null,
    data: parsed.data.data ?? null,
    createdAt: now,
  })

  revalidatePath('/dashboard')
  revalidatePath('/investigations')
  return NextResponse.json({ id }, { status: 201 })
}
