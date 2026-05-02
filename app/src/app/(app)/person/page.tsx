'use client'

import { useState } from 'react'
import { User, Search, Loader2, Save, ExternalLink, Check, Copy, Globe, Phone, Hash } from 'lucide-react'

type Mode = 'username' | 'email' | 'name' | 'phone'

interface PlatformResult {
  platform: string
  url: string
  found: boolean | null
  error?: string
}

interface UsernameResults {
  username: string
  results: PlatformResult[]
}

interface EmailResults {
  email: string
  validFormat: boolean
  mxRecords?: string[]
  hibp?: { breached: boolean; count?: number; breaches?: string[] } | { error: string }
}

type AnyResult = UsernameResults | EmailResults | null

const MODES: { id: Mode; label: string; icon: React.ComponentType<{ size?: number }>, placeholder: string }[] = [
  { id: 'username', label: 'Username', icon: Hash, placeholder: 'john_doe' },
  { id: 'email', label: 'Email', icon: User, placeholder: 'user@example.com' },
  { id: 'name', label: 'Full Name', icon: User, placeholder: 'John Doe' },
  { id: 'phone', label: 'Phone', icon: Phone, placeholder: '+33612345678' },
]

export default function PersonPage() {
  const [mode, setMode] = useState<Mode>('username')
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AnyResult>(null)
  const [saved, setSaved] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [dorks, setDorks] = useState<string[]>([])
  const [copiedDork, setCopiedDork] = useState<string | null>(null)

  async function investigate() {
    if (!target.trim()) return
    setLoading(true)
    setSaved(false)
    setResult(null)
    setDorks([])

    try {
      if (mode === 'username') {
        const res = await fetch('/api/tools/username', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: target.trim() }),
        })
        setResult(await res.json())
        setDorks(buildDorks(target.trim(), 'username'))
      } else if (mode === 'email') {
        const res = await fetch('/api/tools/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target: target.trim() }),
        })
        setResult(await res.json())
        setDorks(buildDorks(target.trim(), 'email'))
      } else {
        // name / phone — dorks only (no API call needed)
        setResult(null)
        setDorks(buildDorks(target.trim(), mode))
      }
    } finally {
      setLoading(false)
    }
  }

  function buildDorks(q: string, type: Mode): string[] {
    if (type === 'username') return [
      `"${q}"`,
      `"${q}" site:linkedin.com`,
      `"${q}" site:github.com`,
      `"${q}" site:twitter.com OR site:x.com`,
      `"${q}" site:reddit.com`,
      `"${q}" site:pastebin.com OR site:paste.ee OR site:ghostbin.com`,
      `"${q}" password OR leak OR breach`,
      `"${q}" filetype:sql OR filetype:csv OR filetype:txt`,
    ]
    if (type === 'email') return [
      `"${q}"`,
      `"${q}" site:linkedin.com`,
      `"${q}" site:pastebin.com OR site:ghostbin.com`,
      `"${q}" password OR breach OR leak`,
      `"${q}" filetype:sql OR filetype:csv OR filetype:txt`,
    ]
    if (type === 'name') return [
      `"${q}"`,
      `"${q}" site:linkedin.com`,
      `"${q}" site:facebook.com`,
      `"${q}" site:twitter.com OR site:x.com`,
      `"${q}" site:instagram.com`,
      `"${q}" email OR contact OR phone`,
      `"${q}" site:github.com`,
      `"${q}" site:researchgate.net OR site:academia.edu`,
      `intitle:"${q}"`,
      `"${q}" resume OR CV OR portfolio`,
    ]
    if (type === 'phone') return [
      `"${q}"`,
      `"${q}" site:linkedin.com OR site:facebook.com`,
      `"${q}" name OR owner OR contact`,
      `"${q}" whatsapp OR telegram OR signal`,
      `"${q}" -site:yellowpages.com -site:truecaller.com`,
    ]
    return []
  }

  async function copyDorkUrl(dork: string) {
    await navigator.clipboard.writeText(`https://www.google.com/search?q=${encodeURIComponent(dork)}`)
    setCopiedDork(dork)
    setTimeout(() => setCopiedDork(null), 2000)
  }

  async function saveInvestigation() {
    setSaveLoading(true)
    try {
      await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mode, target: target.trim(), data: JSON.stringify(result) }),
      })
      setSaved(true)
    } finally {
      setSaveLoading(false)
    }
  }

  const usernameResult = mode === 'username' && result && 'results' in result ? result as UsernameResults : null
  const emailResult = mode === 'email' && result && 'email' in result ? result as EmailResults : null
  const hasResults = result !== null || dorks.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Person Investigation</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
          Username · Email · Full name · Phone
        </p>
      </div>

      {/* Mode selector */}
      <div className="flex gap-1 p-1 rounded-lg w-fit flex-wrap" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        {MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setResult(null); setDorks([]) }}
            className="px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all"
            style={{
              background: mode === m.id ? 'rgba(124,58,237,0.15)' : 'transparent',
              color: mode === m.id ? 'var(--color-purple)' : 'var(--color-muted)',
              border: mode === m.id ? '1px solid rgba(124,58,237,0.3)' : '1px solid transparent',
            }}
          >
            <m.icon size={13} />
            {m.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && investigate()}
            placeholder={MODES.find(m => m.id === mode)?.placeholder}
            className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }}
            onFocus={(e) => (e.target.style.borderColor = 'rgba(124,58,237,0.6)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
        </div>
        <button
          onClick={investigate}
          disabled={loading || !target.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          style={{
            background: 'rgba(124,58,237,0.15)',
            border: '1px solid rgba(124,58,237,0.4)',
            color: 'var(--color-purple)',
            cursor: loading || !target.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !target.trim() ? 0.6 : 1,
          }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Investigate
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted)' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-purple)' }} />
          {mode === 'username' ? 'Checking 50+ platforms…' : mode === 'email' ? 'Analysing email…' : 'Generating intelligence…'}
        </div>
      )}

      {hasResults && !loading && result !== null && (
        <button onClick={saveInvestigation} disabled={saveLoading || saved}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{ background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'var(--color-border)'}`, color: saved ? 'var(--color-green)' : 'var(--color-muted)', cursor: saved ? 'default' : 'pointer' }}>
          {saveLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          {saved ? 'Saved' : 'Save investigation'}
        </button>
      )}

      {/* Username results */}
      {usernameResult && (
        <div>
          <div className="flex items-center gap-3 mb-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-muted)' }}>
              Platform Results
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.1)', color: 'var(--color-green)', border: '1px solid rgba(34,197,94,0.2)' }}>
              {usernameResult.results.filter(r => r.found === true).length} found
            </span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>
              / {usernameResult.results.length} checked
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {usernameResult.results.map((r) => (
              <a key={r.platform} href={r.found ? r.url : undefined} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-all"
                style={{
                  background: r.found === true ? 'rgba(34,197,94,0.08)' : r.found === false ? 'rgba(255,255,255,0.02)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${r.found === true ? 'rgba(34,197,94,0.25)' : r.found === false ? 'var(--color-border)' : 'rgba(245,158,11,0.25)'}`,
                  color: r.found === true ? 'var(--color-green)' : r.found === false ? 'var(--color-muted)' : 'var(--color-amber)',
                  textDecoration: 'none',
                  cursor: r.found ? 'pointer' : 'default',
                }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.found === true ? 'var(--color-green)' : r.found === false ? 'var(--color-muted)' : 'var(--color-amber)', opacity: r.found === false ? 0.3 : 1 }} />
                <span className="flex-1 truncate text-xs font-medium">{r.platform}</span>
                {r.found && <ExternalLink size={10} style={{ flexShrink: 0 }} />}
              </a>
            ))}
          </div>

          {/* Reverse image search links for username */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>Reverse Image Search</h3>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Google Images', url: `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(usernameResult.username)}` },
                { label: 'Yandex', url: `https://yandex.com/images/search?text=${encodeURIComponent(usernameResult.username)}` },
                { label: 'TinEye', url: `https://tineye.com/search?url=` },
                { label: 'PimEyes', url: `https://pimeyes.com/en` },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none' }}>
                  <Globe size={11} />
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Email results */}
      {emailResult && (
        <div className="rounded-xl p-4 space-y-2" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text)' }}>Email Analysis</h2>
          <Row label="Address" value={emailResult.email} />
          <Row label="Format valid" value={emailResult.validFormat ? '✓ Valid' : '✗ Invalid'} color={emailResult.validFormat ? 'var(--color-green)' : 'var(--color-red)'} />
          {emailResult.mxRecords && emailResult.mxRecords.length > 0 && (
            <Row label="MX records" value={emailResult.mxRecords.join(', ')} />
          )}
          {emailResult.mxRecords?.length === 0 && (
            <Row label="MX records" value="None — domain may not accept email" color="var(--color-amber)" />
          )}
          {emailResult.hibp && (
            'error' in emailResult.hibp
              ? <Row label="HIBP" value={emailResult.hibp.error} color="var(--color-muted)" />
              : <Row
                  label="Breaches"
                  value={emailResult.hibp.breached ? `${emailResult.hibp.count} breach(es): ${emailResult.hibp.breaches?.join(', ')}` : 'No breaches found'}
                  color={emailResult.hibp.breached ? 'var(--color-red)' : 'var(--color-green)'}
                />
          )}
          {/* Email-specific search links */}
          <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <p className="text-xs mb-2" style={{ color: 'var(--color-muted)' }}>Search profiles linked to this email:</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Hunter.io', url: `https://hunter.io/email-verifier/${encodeURIComponent(emailResult.email)}` },
                { label: 'Gravatar', url: `https://en.gravatar.com/${emailResult.email}` },
                { label: 'LinkedIn', url: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(emailResult.email)}` },
                { label: 'Google', url: `https://www.google.com/search?q="${encodeURIComponent(emailResult.email)}"` },
              ].map(link => (
                <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none' }}>
                  <ExternalLink size={10} />{link.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Name mode info box */}
      {mode === 'name' && !loading && dorks.length === 0 && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Enter a full name to generate targeted Google dork queries and direct search links across social networks, professional platforms, and public records.
          </p>
        </div>
      )}

      {/* Phone mode info box */}
      {mode === 'phone' && !loading && dorks.length === 0 && (
        <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            Enter a phone number (international format recommended, e.g. +33612345678) to generate search queries and lookup links.
          </p>
        </div>
      )}

      {/* Phone direct lookups */}
      {mode === 'phone' && dorks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
            Lookup Services
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            {[
              { label: 'NumVerify', url: `https://numverify.com/phone-number-validation` },
              { label: 'Truecaller', url: `https://www.truecaller.com/search/intl/${encodeURIComponent(target.replace(/\D/g,''))}` },
              { label: 'Sync.me', url: `https://sync.me/search/?number=${encodeURIComponent(target)}` },
              { label: 'Whitepages', url: `https://www.whitepages.com/phone/${encodeURIComponent(target)}` },
              { label: 'Spokeo', url: `https://www.spokeo.com/phone-search?q=${encodeURIComponent(target)}` },
              { label: 'Google', url: `https://www.google.com/search?q="${encodeURIComponent(target)}"` },
            ].map(link => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs hover-card"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none' }}>
                <ExternalLink size={11} />
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Google Dorks */}
      {dorks.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--color-muted)' }}>
            Google Dorks
          </h2>
          <div className="space-y-2">
            {dorks.map((dork) => (
              <div key={dork} className="flex items-center gap-3 px-4 py-3 rounded-lg"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                <code className="flex-1 text-xs font-mono truncate" style={{ color: 'var(--color-text)' }}>{dork}</code>
                <div className="flex gap-2 flex-shrink-0">
                  <a href={`https://www.google.com/search?q=${encodeURIComponent(dork)}`} target="_blank" rel="noopener noreferrer"
                    className="p-1.5 rounded-md transition-colors" style={{ color: 'var(--color-muted)' }} title="Open in Google">
                    <Globe size={12} />
                  </a>
                  <button onClick={() => copyDorkUrl(dork)} className="p-1.5 rounded-md transition-colors"
                    style={{ color: copiedDork === dork ? 'var(--color-green)' : 'var(--color-muted)' }} title="Copy URL">
                    {copiedDork === dork ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Paste site searches */}
          {(mode === 'username' || mode === 'email' || mode === 'name') && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>Paste Site Search</h3>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Pastebin', url: `https://pastebin.com/search?q=${encodeURIComponent(target)}` },
                  { label: 'GitHub Gist', url: `https://gist.github.com/search?q=${encodeURIComponent(target)}` },
                  { label: 'Ghostbin', url: `https://ghostbin.com/search?q=${encodeURIComponent(target)}` },
                  { label: 'Rentry', url: `https://www.google.com/search?q=site:rentry.co "${encodeURIComponent(target)}"` },
                  { label: 'JustPaste.it', url: `https://www.google.com/search?q=site:justpaste.it "${encodeURIComponent(target)}"` },
                ].map(link => (
                  <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-muted)', textDecoration: 'none' }}>
                    <Globe size={11} />{link.label}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex gap-3 text-sm py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span className="text-xs font-mono w-28 flex-shrink-0 pt-0.5" style={{ color: 'var(--color-muted)' }}>{label}</span>
      <span className="text-xs font-mono flex-1 break-all" style={{ color: color || 'var(--color-text)' }}>{value}</span>
    </div>
  )
}
