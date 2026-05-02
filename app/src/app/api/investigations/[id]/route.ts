import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { investigations } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id')!
  const { id } = await params
  const inv = await db.query.investigations.findFirst({
    where: and(eq(investigations.id, id), eq(investigations.userId, userId)),
  })
  if (!inv) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(inv)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id')!
  const { id } = await params
  await db.delete(investigations).where(and(eq(investigations.id, id), eq(investigations.userId, userId)))
  revalidatePath('/dashboard')
  revalidatePath('/investigations')
  return NextResponse.json({ ok: true })
}
