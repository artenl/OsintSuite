'use client'

import { useState, useEffect, useCallback } from 'react'
import { Settings, Users, Key, Plus, Trash2, Loader2, Check, Eye, EyeOff, BarChart2, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'

interface UserEntry {
  id: string
  username: string
  email: string | null
  role: 'admin' | 'user'
  createdAt: number | null
}

interface ApiKeyEntry {
  service: string
  hasKey: boolean
}

interface CreditEntry {
  label: string
  used: number | null
  remaining: number
  total?: number
}

interface ServiceCredit {
  service: string
  configured: boolean
  plan?: string
  credits?: CreditEntry[]
  error?: string
  unlocked?: boolean
}

const API_SERVICES = [
  { id: 'gemini', label: 'Google Gemini', description: 'AI insights & analysis (free key at aistudio.google.com)' },
  { id: 'virustotal', label: 'VirusTotal', description: 'Domain/IP reputation (free: 500 req/day)' },
  { id: 'shodan', label: 'Shodan', description: 'Port scanning & host info' },
  { id: 'hibp', label: 'HaveIBeenPwned', description: 'Email breach lookup' },
  { id: 'urlscan', label: 'URLScan.io', description: 'URL & domain analysis (optional — search works without a key)' },
  { id: 'abusech', label: 'abuse.ch', description: 'Threat intel / URLhaus (free Auth-Key at auth.abuse.ch)' },
  { id: 'aisstream', label: 'aisstream.io', description: 'Live ship/AIS data for the dashboard radar (free key at aisstream.io)' },
  { id: 'firms', label: 'NASA FIRMS', description: 'Active fire/thermal map layer (free key at firms.modaps.eosdis.nasa.gov)' },
  { id: 'acled', label: 'ACLED', description: 'Conflict-event map layer — store as "email|key" (free, register at acleddata.com)' },
]

const SERVICE_LABELS: Record<string, string> = {
  shodan: 'Shodan',
  virustotal: 'VirusTotal',
  urlscan: 'URLScan.io',
  hibp: 'HaveIBeenPwned',
  gemini: 'Google Gemini',
  abusech: 'abuse.ch',
  aisstream: 'aisstream.io',
  firms: 'NASA FIRMS',
  acled: 'ACLED',
}

export default function SettingsPage() {
  const [tab, setTab] = useState<'users' | 'apikeys' | 'credits'>('users')
  const [users, setUsers] = useState<UserEntry[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyEntry[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [keysLoading, setKeysLoading] = useState(true)
  const [credits, setCredits] = useState<ServiceCredit[]>([])
  const [creditsLoading, setCreditsLoading] = useState(false)
  const [creditsLastFetched, setCreditsLastFetched] = useState<Date | null>(null)

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  const [keyValues, setKeyValues] = useState<Record<string, string>>({})
  const [showKey, setShowKey] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)

  const loadCredits = useCallback(async () => {
    setCreditsLoading(true)
    const res = await fetch('/api/admin/credits')
    if (res.ok) {
      setCredits(await res.json())
      setCreditsLastFetched(new Date())
    }
    setCreditsLoading(false)
  }, [])

  useEffect(() => {
    loadUsers()
    loadApiKeys()
  }, [])

  async function loadUsers() {
    setUsersLoading(true)
    const res = await fetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
    setUsersLoading(false)
  }

  async function loadApiKeys() {
    setKeysLoading(true)
    const res = await fetch('/api/admin/apikeys')
    if (res.ok) setApiKeys(await res.json())
    setKeysLoading(false)
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    setCreateLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newUsername, password: newPassword, email: newEmail || null, role: newRole }),
      })
      const data = await res.json()
      if (!res.ok) { setCreateError(data.error); return }
      setNewUsername(''); setNewPassword(''); setNewEmail(''); setNewRole('user')
      loadUsers()
    } finally {
      setCreateLoading(false)
    }
  }

  async function deleteUser(id: string) {
    if (!confirm('Delete this user? This cannot be undone.')) return
    await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    loadUsers()
  }

  async function saveApiKey(service: string) {
    const key = keyValues[service]?.trim()
    if (!key) return
    setSavingKey(service)
    try {
      await fetch('/api/admin/apikeys', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service, key }),
      })
      setSavedKey(service)
      setTimeout(() => setSavedKey(null), 2000)
      loadApiKeys()
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Settings</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>User management · API keys</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {[
          { id: 'users', label: 'Users', icon: Users },
          { id: 'apikeys', label: 'API Keys', icon: Key },
          { id: 'credits', label: 'Credits', icon: BarChart2, onSelect: loadCredits },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id as typeof tab); t.onSelect?.() }}
            className="px-4 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-all"
            style={{
              background: tab === t.id ? 'rgba(51,255,153,0.1)' : 'transparent',
              color: tab === t.id ? 'var(--color-cyan)' : 'var(--color-muted)',
              border: tab === t.id ? '1px solid rgba(51,255,153,0.2)' : '1px solid transparent',
            }}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Users tab */}
      {tab === 'users' && (
        <div className="space-y-4">
          {/* Create user form */}
          <div className="rounded-xl p-5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: 'var(--color-text)' }}>Create User</h2>
            <form onSubmit={createUser} className="grid grid-cols-2 gap-3">
              <Field label="Username" value={newUsername} onChange={setNewUsername} required placeholder="johndoe" />
              <Field label="Password" value={newPassword} onChange={setNewPassword} required placeholder="••••••••" type="password" />
              <Field label="Email (optional)" value={newEmail} onChange={setNewEmail} placeholder="user@example.com" />
              <div>
                <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
                  className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              {createError && (
                <p className="col-span-2 text-xs" style={{ color: 'var(--color-red)' }}>{createError}</p>
              )}
              <div className="col-span-2">
                <button
                  type="submit"
                  disabled={createLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ background: 'rgba(51,255,153,0.15)', border: '1px solid rgba(51,255,153,0.3)', color: 'var(--color-cyan)', cursor: createLoading ? 'not-allowed' : 'pointer' }}
                >
                  {createLoading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Create User
                </button>
              </div>
            </form>
          </div>

          {/* User list */}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Users</h2>
            </div>
            {usersLoading ? (
              <div className="p-6 flex justify-center"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-muted)' }} /></div>
            ) : (
              users.map((u, i) => (
                <div key={u.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < users.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold" style={{ background: 'rgba(51,255,153,0.15)', color: 'var(--color-cyan)' }}>
                    {u.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{u.username}</p>
                    <p className="text-xs capitalize" style={{ color: 'var(--color-muted)' }}>
                      {u.role}{u.email ? ` · ${u.email}` : ''}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{
                    background: u.role === 'admin' ? 'rgba(51,255,153,0.1)' : 'rgba(255,255,255,0.05)',
                    color: u.role === 'admin' ? 'var(--color-cyan)' : 'var(--color-muted)',
                    border: `1px solid ${u.role === 'admin' ? 'rgba(51,255,153,0.2)' : 'var(--color-border)'}`,
                  }}>
                    {u.role}
                  </span>
                  {u.role !== 'admin' && (
                    <button onClick={() => deleteUser(u.id)} className="p-2 rounded-lg transition-all" style={{ color: 'var(--color-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = 'var(--color-red)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-muted)' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Credits tab */}
      {tab === 'credits' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
              {creditsLastFetched ? `Last refreshed ${creditsLastFetched.toLocaleTimeString()}` : 'Click refresh to load credit data'}
            </p>
            <button
              onClick={loadCredits}
              disabled={creditsLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{ background: 'rgba(51,255,153,0.1)', border: '1px solid rgba(51,255,153,0.2)', color: 'var(--color-cyan)', cursor: creditsLoading ? 'not-allowed' : 'pointer', opacity: creditsLoading ? 0.6 : 1 }}
            >
              {creditsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              Refresh
            </button>
          </div>

          {creditsLoading && credits.length === 0 && (
            <div className="flex justify-center py-10">
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--color-muted)' }} />
            </div>
          )}

          {!creditsLoading && credits.length === 0 && creditsLastFetched && (
            <div className="rounded-xl p-6 text-center" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>No data available. Configure API keys first.</p>
            </div>
          )}

          {credits.map((svc) => (
            <div key={svc.service} className="rounded-xl p-4 space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>
                    {SERVICE_LABELS[svc.service] ?? svc.service}
                  </p>
                  {svc.plan && (
                    <span className="text-xs px-1.5 py-0.5 rounded capitalize" style={{ background: 'rgba(51,255,153,0.08)', color: 'var(--color-cyan)', border: '1px solid rgba(51,255,153,0.15)' }}>
                      {svc.plan}
                    </span>
                  )}
                </div>
                {!svc.configured ? (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-muted)' }}>
                    <XCircle size={12} /> Not configured
                  </span>
                ) : svc.error ? (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-red)' }}>
                    <AlertCircle size={12} /> Error
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-green)' }}>
                    <CheckCircle2 size={12} /> Active
                  </span>
                )}
              </div>

              {svc.error && (
                <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--color-red)' }}>
                  {svc.error}
                </p>
              )}

              {!svc.error && svc.configured && svc.credits && svc.credits.length === 0 && (
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>No quota data available for this service.</p>
              )}

              {svc.credits && svc.credits.length > 0 && (
                <div className="space-y-2.5">
                  {svc.credits.map((c) => {
                    const pct = c.total ? Math.round((c.remaining / c.total) * 100) : null
                    const barColor = pct === null ? 'var(--color-cyan)' : pct > 50 ? 'var(--color-green)' : pct > 20 ? '#f59e0b' : 'var(--color-red)'
                    return (
                      <div key={c.label}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs" style={{ color: 'var(--color-muted)' }}>{c.label}</span>
                          <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-text)' }}>
                            {c.remaining.toLocaleString()}
                            {c.total ? <span style={{ color: 'var(--color-muted)' }}> / {c.total.toLocaleString()}</span> : ' remaining'}
                          </span>
                        </div>
                        {pct !== null && (
                          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface-2)' }}>
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: barColor }} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {svc.service === 'shodan' && svc.unlocked !== undefined && (
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  Unlocked features: {svc.unlocked ? 'Yes' : 'No'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* API Keys tab */}
      {tab === 'apikeys' && (
        <div className="space-y-3">
          {API_SERVICES.map((svc) => {
            const info = apiKeys.find((k) => k.service === svc.id)
            return (
              <div key={svc.id} className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{svc.label}</p>
                      {info?.hasKey && (
                        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          configured
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>{svc.description}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      type={showKey[svc.id] ? 'text' : 'password'}
                      value={keyValues[svc.id] || ''}
                      onChange={(e) => setKeyValues((prev) => ({ ...prev, [svc.id]: e.target.value }))}
                      placeholder={info?.hasKey ? '••••••••••••••••' : 'Enter API key…'}
                      className="w-full px-3 py-2 pr-9 rounded-lg text-sm outline-none font-mono"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => ({ ...prev, [svc.id]: !prev[svc.id] }))}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {showKey[svc.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                  <button
                    onClick={() => saveApiKey(svc.id)}
                    disabled={savingKey === svc.id || !keyValues[svc.id]?.trim()}
                    className="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all"
                    style={{
                      background: savedKey === svc.id ? 'rgba(34,197,94,0.15)' : 'rgba(51,255,153,0.1)',
                      border: `1px solid ${savedKey === svc.id ? 'rgba(34,197,94,0.3)' : 'rgba(51,255,153,0.2)'}`,
                      color: savedKey === svc.id ? 'var(--color-green)' : 'var(--color-cyan)',
                      cursor: !keyValues[svc.id]?.trim() ? 'not-allowed' : 'pointer',
                      opacity: !keyValues[svc.id]?.trim() ? 0.5 : 1,
                    }}
                  >
                    {savingKey === svc.id ? <Loader2 size={12} className="animate-spin" /> : savedKey === svc.id ? <Check size={12} /> : <Key size={12} />}
                    {savedKey === svc.id ? 'Saved' : 'Save'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, required, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void
  required?: boolean; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
        style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
        onFocus={(e) => (e.target.style.borderColor = 'var(--color-cyan)')}
        onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
      />
    </div>
  )
}
