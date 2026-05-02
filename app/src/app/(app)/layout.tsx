import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth/session'
import { Sidebar } from '@/components/sidebar'
import { MobileNav } from '@/components/mobile-nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--color-bg)' }}>
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar username={session.username} role={session.role} />
      </div>

      {/* Main content — full width on mobile, offset on desktop */}
      <main
        className="flex-1 p-4 md:p-6 pb-20 md:pb-6"
        style={{ marginLeft: 0 }}
      >
        {/* On desktop, push right of sidebar */}
        <div className="md:ml-56 max-w-5xl">
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav role={session.role} />
    </div>
  )
}
