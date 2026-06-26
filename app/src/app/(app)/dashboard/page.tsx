export const dynamic = 'force-dynamic'

import { getSession } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { investigations } from '@/lib/db/schema'
import { eq, desc, count } from 'drizzle-orm'
import { Globe, User, FolderSearch, Activity, ArrowRight, type LucideProps } from 'lucide-react'
import Link from 'next/link'
import { formatDate } from '@/lib/utils'
import { Radar } from '@/components/radar'

type IconComponent = React.ComponentType<LucideProps>

export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null

  const [recentInvestigations, [stats]] = await Promise.all([
    db.query.investigations.findMany({
      where: eq(investigations.userId, session.sub),
      orderBy: [desc(investigations.createdAt)],
      limit: 5,
    }),
    db
      .select({ total: count() })
      .from(investigations)
      .where(eq(investigations.userId, session.sub)),
  ])

  const quickActions = [
    { label: 'Domain / IP', description: 'WHOIS, DNS, SSL, GeoIP', href: '/domain', icon: Globe, color: 'var(--color-cyan)' },
    { label: 'Person', description: 'Username, email, social', href: '/person', icon: User, color: 'var(--color-purple)' },
    { label: 'Investigations', description: 'Browse saved reports', href: '/investigations', icon: FolderSearch, color: 'var(--color-green)' },
  ]

  const typeIcon: Record<string, IconComponent> = {
    domain: Globe,
    ip: Globe,
    person: User,
    email: User,
    username: User,
  }

  const typeColor: Record<string, string> = {
    domain: 'var(--color-cyan)',
    ip: 'var(--color-cyan)',
    person: 'var(--color-purple)',
    email: 'var(--color-purple)',
    username: 'var(--color-green)',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
          Welcome back, <span style={{ color: 'var(--color-cyan)' }}>{session.username}</span>
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
          Ready to investigate.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total Investigations"
          value={stats.total}
          icon={Activity}
          color="var(--color-cyan)"
        />
        <StatCard
          label="Domain / IP"
          value={recentInvestigations.filter((i) => ['domain', 'ip'].includes(i.type)).length}
          icon={Globe}
          color="var(--color-cyan)"
          sub="recent"
        />
        <StatCard
          label="Person"
          value={recentInvestigations.filter((i) => ['person', 'email', 'username'].includes(i.type)).length}
          icon={User}
          color="var(--color-purple)"
          sub="recent"
        />
      </div>

      {/* Live radar */}
      <Radar />

      {/* Quick actions */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="hover-card rounded-xl p-4 flex items-center gap-4"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                textDecoration: 'none',
              }}
            >
              <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{
                background: `${action.color}20`,
                border: `1px solid ${action.color}40`,
              }}>
                <action.icon size={18} style={{ color: action.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{action.label}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>{action.description}</p>
              </div>
              <ArrowRight size={16} style={{ color: 'var(--color-muted)', flexShrink: 0 }} />
            </Link>
          ))}
        </div>
      </div>

      {/* Recent investigations */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
            Recent Investigations
          </h2>
          <Link href="/investigations" className="text-xs" style={{ color: 'var(--color-cyan)', textDecoration: 'none' }}>
            View all →
          </Link>
        </div>

        {recentInvestigations.length === 0 ? (
          <div className="rounded-xl p-8 text-center" style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            <FolderSearch size={32} className="mx-auto mb-3" style={{ color: 'var(--color-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No investigations yet. Start one above.</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
          }}>
            {recentInvestigations.map((inv, i) => {
              const Icon = typeIcon[inv.type] || Globe
              const color = typeColor[inv.type] || 'var(--color-cyan)'
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors"
                  style={{
                    borderBottom: i < recentInvestigations.length - 1 ? '1px solid var(--color-border)' : 'none',
                  }}
                >
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{
                    background: `${color}20`,
                  }}>
                    <Icon size={13} style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{inv.target}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--color-muted)' }}>{inv.type}</p>
                  </div>
                  <p className="text-xs flex-shrink-0" style={{ color: 'var(--color-muted)' }}>
                    {inv.createdAt ? formatDate(inv.createdAt) : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
}: {
  label: string
  value: number
  icon: IconComponent
  color: string
  sub?: string
}) {
  return (
    <div className="rounded-xl p-4" style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
    }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{label}</p>
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{
          background: `${color}20`,
        }}>
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold" style={{ color: 'var(--color-text)' }}>
        {value}
        {sub && <span className="text-xs font-normal ml-1" style={{ color: 'var(--color-muted)' }}>{sub}</span>}
      </p>
    </div>
  )
}
