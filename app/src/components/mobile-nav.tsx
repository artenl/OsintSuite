'use client'

import { usePathname } from 'next/navigation'
import { LayoutDashboard, Globe, User, FolderSearch, Settings } from 'lucide-react'

interface MobileNavProps {
  role: string
}

const NAV = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Domain', href: '/domain', icon: Globe },
  { label: 'Person', href: '/person', icon: User },
  { label: 'History', href: '/investigations', icon: FolderSearch },
  { label: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
]

export function MobileNav({ role }: MobileNavProps) {
  const pathname = usePathname()
  const items = NAV.filter((item) => !item.adminOnly || role === 'admin')

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-2 py-1 md:hidden"
      style={{
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {items.map((item) => {
        const active = pathname === item.href
        return (
          <a
            key={item.href}
            href={item.href}
            className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all min-w-0"
            style={{
              color: active ? 'var(--color-cyan)' : 'var(--color-muted)',
              textDecoration: 'none',
              flex: 1,
            }}
          >
            <item.icon size={20} />
            <span className="text-xs font-medium truncate" style={{ fontSize: '10px' }}>{item.label}</span>
          </a>
        )
      })}
    </nav>
  )
}
