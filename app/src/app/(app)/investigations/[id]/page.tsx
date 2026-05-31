export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { investigations } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { ArrowLeft, Globe, User } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type ToolEntry = { status?: string; data?: unknown; error?: string }
type PlatformResult = { platform: string; url?: string; found?: boolean | null }

export default async function InvestigationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session) return null

  const inv = await db.query.investigations.findFirst({
    where: and(eq(investigations.id, id), eq(investigations.userId, session.sub)),
  })
  if (!inv) notFound()

  let parsed: Record<string, unknown> | null = null
  try {
    parsed = inv.data ? JSON.parse(inv.data) : null
  } catch {
    parsed = null
  }

  const Icon = inv.type === 'person' || inv.type === 'email' || inv.type === 'username' ? User : Globe

  // Detect the {toolId: {status, data}} results-map shape vs a legacy flat object.
  const entries = parsed ? Object.entries(parsed) : []
  const isResultsMap = entries.some(([, v]) => v && typeof v === 'object' && 'status' in (v as object))

  return (
    <div className="space-y-6">
      <Link href="/investigations" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted)' }}>
        <ArrowLeft size={14} /> Back to investigations
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(51,255,153,0.12)' }}>
          <Icon size={18} style={{ color: 'var(--color-cyan)' }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold break-all" style={{ color: 'var(--color-text)' }}>{inv.target}</h1>
          <p className="text-xs capitalize" style={{ color: 'var(--color-muted)' }}>
            {inv.type} · {inv.createdAt ? formatDate(inv.createdAt) : ''}
          </p>
        </div>
      </div>

      {inv.notes && (
        <p className="text-sm rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}>
          {inv.notes}
        </p>
      )}

      {!parsed && (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No structured data was stored with this investigation.</p>
      )}

      {parsed && isResultsMap && entries.map(([tool, raw]) => {
        const entry = raw as ToolEntry
        if (entry.status === 'error') {
          return (
            <Card key={tool} title={tool}>
              <p className="text-sm" style={{ color: 'var(--color-red)' }}>Failed: {entry.error}</p>
            </Card>
          )
        }
        if (entry.status !== 'done' || !entry.data || typeof entry.data !== 'object') return null
        return <Card key={tool} title={tool}><KeyValues data={entry.data as Record<string, unknown>} /></Card>
      })}

      {parsed && !isResultsMap && (
        <Card title="Stored data"><KeyValues data={parsed} /></Card>
      )}
    </div>
  )
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <span className="text-sm font-semibold capitalize" style={{ color: 'var(--color-text)' }}>{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function KeyValues({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="space-y-1">
      {Object.entries(data).map(([key, value]) => {
        if (value === null || value === undefined || value === '') return null

        // Username platform-results array → compact found summary
        if (key === 'results' && Array.isArray(value)) {
          const platforms = value as PlatformResult[]
          const found = platforms.filter((p) => p.found === true)
          return (
            <div key={key} className="text-sm py-1">
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
                {found.length} accounts found / {platforms.length} checked
              </span>
              {found.length > 0 && (
                <p className="text-xs font-mono mt-1 break-all" style={{ color: 'var(--color-text)' }}>
                  {found.map((p) => p.platform).join(', ')}
                </p>
              )}
            </div>
          )
        }

        const display = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value)

        return (
          <div key={key} className="flex gap-3 py-1.5 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="font-mono text-xs w-40 flex-shrink-0 pt-0.5" style={{ color: 'var(--color-muted)' }}>{key}</span>
            <span className="font-mono text-xs flex-1 break-all whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>{display}</span>
          </div>
        )
      })}
    </div>
  )
}
