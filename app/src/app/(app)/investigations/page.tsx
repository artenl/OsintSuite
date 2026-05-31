export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { investigations } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import Link from 'next/link'
import { Globe, User, FolderSearch, Plus, type LucideProps } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type IconComponent = React.ComponentType<LucideProps>
import { DeleteButton } from './delete-button'

export default async function InvestigationsPage() {
  const session = await getSession()
  if (!session) return null

  const all = await db.query.investigations.findMany({
    where: eq(investigations.userId, session.sub),
    orderBy: [desc(investigations.createdAt)],
  })

  const typeIcon: Record<string, IconComponent> = {
    domain: Globe, ip: Globe, person: User, email: User, username: User,
  }
  const typeColor: Record<string, string> = {
    domain: 'var(--color-cyan)', ip: 'var(--color-cyan)',
    person: 'var(--color-purple)', email: 'var(--color-purple)', username: 'var(--color-green)',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Investigations</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
            {all.length} saved investigation{all.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/domain"
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold flex-shrink-0 transition-all"
          style={{
            background: 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: 'var(--color-cyan)',
          }}
        >
          <Plus size={16} />
          New Investigation
        </Link>
      </div>

      {all.length === 0 ? (
        <div className="rounded-xl p-12 text-center" style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}>
          <FolderSearch size={40} className="mx-auto mb-4" style={{ color: 'var(--color-muted)' }} />
          <p style={{ color: 'var(--color-muted)' }}>No saved investigations yet.</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--color-muted)' }}>
            Run a scan on the Domain or Person page, then tap <span style={{ color: 'var(--color-cyan)' }}>Save investigation</span>.
          </p>
          <Link
            href="/domain"
            className="inline-flex items-center gap-2 mt-5 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: 'rgba(0,212,255,0.15)',
              border: '1px solid rgba(0,212,255,0.4)',
              color: 'var(--color-cyan)',
            }}
          >
            <Plus size={16} />
            Start an Investigation
          </Link>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
        }}>
          {all.map((inv, i) => {
            const Icon = typeIcon[inv.type] || Globe
            const color = typeColor[inv.type] || 'var(--color-cyan)'
            return (
              <div
                key={inv.id}
                className="flex items-center gap-4 px-4 py-3"
                style={{ borderBottom: i < all.length - 1 ? '1px solid var(--color-border)' : 'none' }}
              >
                <Link href={`/investigations/${inv.id}`} className="flex items-center gap-4 flex-1 min-w-0" style={{ textDecoration: 'none' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                    background: `${color}20`,
                  }}>
                    <Icon size={14} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{inv.target}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--color-muted)' }}>
                      {inv.type} · {inv.createdAt ? formatDate(inv.createdAt) : ''}
                    </p>
                    {inv.notes && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-muted)' }}>{inv.notes}</p>}
                  </div>
                </Link>
                <DeleteButton id={inv.id} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
