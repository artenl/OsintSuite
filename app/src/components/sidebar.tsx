'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Globe,
  User,
  FolderSearch,
  Settings,
  Shield,
  Radar,
  MapPin,
  LogOut,
  ChevronRight,
} from 'lucide-react'

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ size?: number }>
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Domain / IP', href: '/domain', icon: Globe },
  { label: 'Person', href: '/person', icon: User },
  { label: 'Shodan', href: '/shodan', icon: Radar },
  { label: 'Geo / OSM', href: '/geo', icon: MapPin },
  { label: 'Investigations', href: '/investigations', icon: FolderSearch },
  { label: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
]

interface SidebarProps {
  username: string
  role: string
}

export function Sidebar({ username, role }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const items = NAV.filter((item) => !item.adminOnly || role === 'admin')

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 flex flex-col" style={{
      background: 'var(--color-surface)',
      borderRight: '1px solid var(--color-border)',
    }}>
      {/* Logo */}
      <div className="px-5 py-5 flex items-center gap-3" style={{
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{
          background: 'rgba(51,255,153,0.15)',
          border: '1px solid rgba(51,255,153,0.3)',
        }}>
          <Shield size={16} style={{ color: 'var(--color-cyan)' }} />
        </div>
        <div>
          <p className="text-sm font-bold tracking-tight terminal-cursor" style={{ color: 'var(--color-cyan)' }}>OSINT Suite</p>
          <p className="text-xs" style={{ color: 'var(--color-muted)' }}>v2.0 — secure shell</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href
          return (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group"
              style={{
                background: active ? 'rgba(51,255,153,0.1)' : 'transparent',
                color: active ? 'var(--color-cyan)' : 'var(--color-muted)',
                border: active ? '1px solid rgba(51,255,153,0.2)' : '1px solid transparent',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.color = 'var(--color-text)'
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-muted)'
                }
              }}
            >
              <item.icon size={16} />
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={14} style={{ opacity: 0.5 }} />}
            </a>
          )
        })}
      </nav>

      {/* User */}
      <div className="px-3 pb-4 space-y-0.5" style={{
        borderTop: '1px solid var(--color-border)',
        paddingTop: '12px',
      }}>
        <div className="px-3 py-2 rounded-lg" style={{
          background: 'rgba(255,255,255,0.02)',
        }}>
          <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>{username}</p>
          <p className="text-xs capitalize" style={{ color: 'var(--color-muted)' }}>{role}</p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
          style={{ color: 'var(--color-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
            e.currentTarget.style.color = 'var(--color-red)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-muted)'
          }}
        >
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
