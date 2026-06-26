'use client'

import { useState } from 'react'
import { User, Search, Loader2, Save, ExternalLink, Check, Copy, Globe, Phone, Hash } from 'lucide-react'
import { InsightsPanel, type Insights } from '@/components/insights-panel'

type Mode = 'username' | 'email' | 'name' | 'phone'

type ToolStatus = 'idle' | 'loading' | 'done' | 'error'
type ToolResult = { status: ToolStatus; data?: unknown; error?: string }
type Results = Record<string, ToolResult>

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

type SanctionMatch = { name: string; type: string; programs: string[]; matchedAs: string; score: number }
type SanctionsData = { query: string; Result: string; count: number; listSize: number; matches: SanctionMatch[] }

// Which backend tools run automatically per mode.
const MODE_TOOLS: Record<Mode, string[]> = {
  username: ['username', 'github'],
  email: ['email', 'gravatar'],
  name: ['sanctions'],
  phone: ['phone'],
}

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
  const [results, setResults] = useState<Results>({})
  const [saved, setSaved] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [dorks, setDorks] = useState<string[]>([])
  const [copiedDork, setCopiedDork] = useState<string | null>(null)
  const [insights, setInsights] = useState<Insights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState('')

  async function runTool(toolId: string, t: string) {
    setResults((prev) => ({ ...prev, [toolId]: { status: 'loading' } }))
    try {
      const res = await fetch(`/api/tools/${toolId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: t }),
      })
      const data = await res.json()
      if (!res.ok) setResults((prev) => ({ ...prev, [toolId]: { status: 'error', error: data.error } }))
      else setResults((prev) => ({ ...prev, [toolId]: { status: 'done', data } }))
    } catch (err) {
      setResults((prev) => ({ ...prev, [toolId]: { status: 'error', error: String(err) } }))
    }
  }

  async function investigate() {
    if (!target.trim()) return
    const t = target.trim()
    setLoading(true)
    setSaved(false)
    setSaveError('')
    setResults({})
    setInsights(null)
    setInsightsError('')
    setDorks(buildDorks(t, mode))
    await Promise.all(MODE_TOOLS[mode].map((tool) => runTool(tool, t)))
    setLoading(false)
  }

  // Compact the noisy username platform list to just the hits before sending to the LLM.
  function cleanForInsights(r: Results): Results {
    const out: Results = {}
    for (const [k, v] of Object.entries(r)) {
      if (v.status === 'done' && k === 'username' && (v.data as UsernameResults)?.results) {
        const ur = v.data as UsernameResults
        const found = ur.results.filter((p) => p.found === true).map((p) => p.platform)
        out[k] = {
          status: 'done',
          data: {
            username: ur.username,
            accountsFound: found.length,
            platformsChecked: ur.results.length,
            foundOn: found.join(', ') || 'none',
          },
        }
      } else {
        out[k] = v
      }
    }
    return out
  }

  async function generateInsights() {
    setInsightsLoading(true)
    setInsightsError('')
    setInsights(null)
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: target.trim(), type: mode, results: cleanForInsights(results) }),
      })
      const data = await res.json()
      if (!res.ok) setInsightsError(data.error || 'Analysis failed')
      else setInsights(data)
    } catch (err) {
      setInsightsError(String(err))
    } finally {
      setInsightsLoading(false)
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
    setSaveError('')
    try {
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: mode, target: target.trim(), data: JSON.stringify(results) }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(err.error || `Save failed (HTTP ${res.status})`)
      } else {
        setSaved(true)
      }
    } catch (err) {
      setSaveError(String(err))
    } finally {
      setSaveLoading(false)
    }
  }

  const usernameResult = results.username?.status === 'done' ? (results.username.data as UsernameResults) : null
  const emailResult = results.email?.status === 'done' ? (results.email.data as EmailResults) : null
  const githubResult = results.github?.status === 'done' ? (results.github.data as Record<string, string>) : null
  const gravatarResult = results.gravatar?.status === 'done' ? (results.gravatar.data as Record<string, string>) : null
  const phoneResult = results.phone?.status === 'done' ? (results.phone.data as Record<string, string>) : null
  const sanctionsResult = results.sanctions?.status === 'done' ? (results.sanctions.data as SanctionsData) : null

  const doneTools = Object.values(results).filter((r) => r.status === 'done').length
  const hasToolResults = doneTools > 0

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
            onClick={() => { setMode(m.id); setResults({}); setDorks([]); setInsights(null); setInsightsError(''); setSaved(false) }}
            className="px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-all"
            style={{
              background: mode === m.id ? 'rgba(255,180,84,0.15)' : 'transparent',
              color: mode === m.id ? 'var(--color-purple)' : 'var(--color-muted)',
              border: mode === m.id ? '1px solid rgba(255,180,84,0.3)' : '1px solid transparent',
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
            onFocus={(e) => (e.target.style.borderColor = 'rgba(255,180,84,0.6)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
        </div>
        <button
          onClick={investigate}
          disabled={loading || !target.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          style={{
            background: 'rgba(255,180,84,0.15)',
            border: '1px solid rgba(255,180,84,0.4)',
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
          {mode === 'username' ? 'Checking 50+ platforms + GitHub profile…' : mode === 'email' ? 'Analysing email, breaches & Gravatar…' : 'Generating intelligence…'}
        </div>
      )}

      {/* Actions */}
      {hasToolResults && !loading && (
        <div className="flex flex-col gap-2">
          <button onClick={saveInvestigation} disabled={saveLoading || saved}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all w-fit"
            style={{ background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)', border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'var(--color-border)'}`, color: saved ? 'var(--color-green)' : 'var(--color-muted)', cursor: saved ? 'default' : 'pointer' }}>
            {saveLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saved ? 'Saved' : 'Save investigation'}
          </button>
          {saveError && <p className="text-xs" style={{ color: 'var(--color-red)' }}>Could not save: {saveError}</p>}
        </div>
      )}

      {/* AI Insights */}
      {hasToolResults && !loading && (
        <InsightsPanel insights={insights} loading={insightsLoading} error={insightsError} onGenerate={generateInsights} />
      )}

      {/* GitHub profile card */}
      {githubResult && <ProfileCard title="GitHub Profile" data={githubResult} accent="var(--color-cyan)" />}

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

      {/* Gravatar profile card */}
      {gravatarResult && <ProfileCard title="Gravatar Profile" data={gravatarResult} accent="var(--color-purple)" />}

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

      {/* OFAC sanctions screen (name mode) */}
      {sanctionsResult && <SanctionsCard d={sanctionsResult} />}

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

      {/* Phone intelligence (parsed) */}
      {phoneResult && <ProfileCard title="Phone Intelligence" data={phoneResult} accent="var(--color-purple)" />}

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

function ProfileCard({ title, data, accent }: { title: string; data: Record<string, string>; accent: string }) {
  const avatar = data['Avatar']
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: `1px solid ${accent}40` }}>
      <h2 className="text-sm font-semibold mb-3" style={{ color: accent }}>{title}</h2>
      <div className="flex gap-4">
        {avatar && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt="avatar" width={56} height={56}
            className="rounded-lg flex-shrink-0" style={{ width: 56, height: 56, objectFit: 'cover', border: '1px solid var(--color-border)' }} />
        )}
        <div className="flex-1 min-w-0 space-y-1.5">
          {Object.entries(data).map(([k, v]) => {
            if (k === 'Avatar' || v === null || v === undefined || v === '') return null
            const isLink = typeof v === 'string' && /^https?:\/\//.test(v)
            const isMultiline = typeof v === 'string' && v.includes('\n')
            return (
              <div key={k} className="flex gap-3 text-sm" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span className="text-xs font-mono w-32 flex-shrink-0 pt-0.5" style={{ color: 'var(--color-muted)' }}>{k}</span>
                {isLink ? (
                  <a href={v} target="_blank" rel="noopener noreferrer" className="text-xs font-mono flex-1 break-all" style={{ color: accent }}>{v}</a>
                ) : isMultiline ? (
                  <span className="text-xs font-mono flex-1 break-all whitespace-pre-wrap" style={{ color: 'var(--color-text)' }}>{v}</span>
                ) : (
                  <span className="text-xs font-mono flex-1 break-all" style={{ color: 'var(--color-text)' }}>{v}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function SanctionsCard({ d }: { d: SanctionsData }) {
  const hit = d.count > 0
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: `1px solid ${hit ? 'rgba(255,85,85,0.35)' : 'var(--color-border)'}` }}>
      <div className="flex items-center gap-2 mb-2">
        <h2 className="text-sm font-semibold" style={{ color: hit ? 'var(--color-red)' : 'var(--color-green)' }}>OFAC Sanctions Screen</h2>
        <span className="text-xs" style={{ color: 'var(--color-muted)' }}>· {d.listSize.toLocaleString()} entries</span>
      </div>
      <p className="text-sm mb-2" style={{ color: hit ? 'var(--color-red)' : 'var(--color-green)' }}>{d.Result}</p>
      {hit && (
        <div className="space-y-1.5">
          {d.matches.map((m, i) => (
            <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,85,85,0.06)', border: '1px solid rgba(255,85,85,0.2)' }}>
              <span className="text-xs font-mono mt-0.5 px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(255,85,85,0.15)', color: 'var(--color-red)' }}>{Math.round(m.score * 100)}%</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{m.name}</p>
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
                  {m.type}{m.matchedAs !== m.name ? ` · matched alias "${m.matchedAs}"` : ''}
                </p>
                {m.programs.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {m.programs.map((p) => (
                      <span key={p} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--color-amber)' }}>{p}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs mt-1" style={{ color: 'var(--color-muted)' }}>Fuzzy name matches against the US Treasury SDN list — verify identity before acting (same name ≠ same person).</p>
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
