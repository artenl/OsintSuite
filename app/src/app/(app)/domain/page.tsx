'use client'

import { useState } from 'react'
import {
  Globe, Search, Loader2, ChevronDown, ChevronUp, Save,
  AlertCircle, CheckCircle, Clock, Copy, Check, Sparkles, ShieldAlert
} from 'lucide-react'

type ToolStatus = 'idle' | 'loading' | 'done' | 'error'
type ToolResult = { status: ToolStatus; data?: unknown; error?: string }
type Results = Record<string, ToolResult>

type Insights = {
  riskLevel: 'low' | 'medium' | 'high' | 'unknown'
  summary: string
  keyFindings: string[]
  recommendedNextSteps: string[]
  model?: string
}

const TOOLS = [
  { id: 'whois', label: 'WHOIS' },
  { id: 'dns', label: 'DNS Records' },
  { id: 'ssl', label: 'SSL Certificate' },
  { id: 'geoip', label: 'GeoIP / ASN' },
  { id: 'headers', label: 'HTTP Headers' },
  { id: 'subdomains', label: 'Subdomains (crt.sh)' },
  { id: 'shodan', label: 'Shodan' },
  { id: 'internetdb', label: 'InternetDB — Ports & CVEs' },
  { id: 'virustotal', label: 'VirusTotal' },
  { id: 'urlscan', label: 'URLScan.io' },
  { id: 'threat', label: 'Threat Intel (abuse.ch)' },
]

export default function DomainPage() {
  const [target, setTarget] = useState('')
  const [results, setResults] = useState<Results>({})
  const [running, setRunning] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [saved, setSaved] = useState(false)
  const [saveLoading, setSaveLoading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [copied, setCopied] = useState(false)
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
      if (!res.ok) {
        setResults((prev) => ({ ...prev, [toolId]: { status: 'error', error: data.error } }))
      } else {
        setResults((prev) => ({ ...prev, [toolId]: { status: 'done', data } }))
      }
    } catch (err) {
      setResults((prev) => ({ ...prev, [toolId]: { status: 'error', error: String(err) } }))
    }
  }

  async function investigate() {
    if (!target.trim()) return
    const t = target.trim().replace(/^https?:\/\//, '').split('/')[0]
    setResults({})
    setSaved(false)
    setSaveError('')
    setInsights(null)
    setInsightsError('')
    setRunning(true)
    setExpanded(Object.fromEntries(TOOLS.map((t) => [t.id, true])))
    await Promise.all(TOOLS.map((tool) => runTool(tool.id, t)))
    setRunning(false)
  }

  async function generateInsights() {
    const t = target.trim().replace(/^https?:\/\//, '').split('/')[0]
    const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)
    setInsightsLoading(true)
    setInsightsError('')
    setInsights(null)
    try {
      const res = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: t, type: isIp ? 'ip' : 'domain', results }),
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

  async function saveInvestigation() {
    setSaveLoading(true)
    setSaveError('')
    try {
      const t = target.trim().replace(/^https?:\/\//, '').split('/')[0]
      const isIp = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: isIp ? 'ip' : 'domain',
          target: t,
          data: JSON.stringify(results),
        }),
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

  async function copyResults() {
    const text = JSON.stringify(results, null, 2)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const hasResults = Object.keys(results).length > 0
  const doneCount = Object.values(results).filter((r) => r.status === 'done').length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>Domain / IP Investigation</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--color-muted)' }}>
          WHOIS · DNS · SSL · GeoIP · HTTP Headers
        </p>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--color-muted)' }} />
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && investigate()}
            placeholder="example.com  or  8.8.8.8"
            className="w-full pl-9 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
            onFocus={(e) => (e.target.style.borderColor = 'var(--color-cyan)')}
            onBlur={(e) => (e.target.style.borderColor = 'var(--color-border)')}
          />
        </div>
        <button
          onClick={investigate}
          disabled={running || !target.trim()}
          className="px-5 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all"
          style={{
            background: 'rgba(0,212,255,0.15)',
            border: '1px solid rgba(0,212,255,0.4)',
            color: 'var(--color-cyan)',
            cursor: running || !target.trim() ? 'not-allowed' : 'pointer',
            opacity: running || !target.trim() ? 0.6 : 1,
          }}
        >
          {running ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
          Investigate
        </button>
      </div>

      {/* Progress */}
      {running && (
        <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-cyan)' }} />
          Running {TOOLS.length} tools… {doneCount}/{TOOLS.length} complete
        </div>
      )}

      {/* Actions */}
      {hasResults && !running && (
        <div className="flex gap-2">
          <button
            onClick={saveInvestigation}
            disabled={saveLoading || saved}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: saved ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${saved ? 'rgba(34,197,94,0.3)' : 'var(--color-border)'}`,
              color: saved ? 'var(--color-green)' : 'var(--color-muted)',
              cursor: saved ? 'default' : 'pointer',
            }}
          >
            {saveLoading ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saved ? 'Saved' : 'Save investigation'}
          </button>
          <button
            onClick={copyResults}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-muted)',
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied!' : 'Copy JSON'}
          </button>
        </div>
      )}

      {saveError && !running && (
        <p className="text-xs" style={{ color: 'var(--color-red)' }}>Could not save: {saveError}</p>
      )}

      {/* AI Insights */}
      {hasResults && !running && (
        <InsightsPanel
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
          onGenerate={generateInsights}
        />
      )}

      {/* Results */}
      {TOOLS.map((tool) => {
        const result = results[tool.id]
        if (!result) return null
        const open = expanded[tool.id] ?? true

        return (
          <ResultCard
            key={tool.id}
            label={tool.label}
            result={result}
            open={open}
            onToggle={() => setExpanded((prev) => ({ ...prev, [tool.id]: !prev[tool.id] }))}
          />
        )
      })}
    </div>
  )
}

function ResultCard({
  label,
  result,
  open,
  onToggle,
}: {
  label: string
  result: ToolResult
  open: boolean
  onToggle: () => void
}) {
  const statusIcon =
    result.status === 'loading' ? (
      <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-cyan)' }} />
    ) : result.status === 'done' ? (
      <CheckCircle size={14} style={{ color: 'var(--color-green)' }} />
    ) : result.status === 'error' ? (
      <AlertCircle size={14} style={{ color: 'var(--color-red)' }} />
    ) : (
      <Clock size={14} style={{ color: 'var(--color-muted)' }} />
    )

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
    }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ borderBottom: open ? '1px solid var(--color-border)' : 'none' }}
      >
        {statusIcon}
        <span className="text-sm font-semibold flex-1" style={{ color: 'var(--color-text)' }}>{label}</span>
        {open ? <ChevronUp size={14} style={{ color: 'var(--color-muted)' }} /> : <ChevronDown size={14} style={{ color: 'var(--color-muted)' }} />}
      </button>

      {open && (
        <div className="p-4">
          {result.status === 'loading' && (
            <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-muted)' }}>
              <Loader2 size={14} className="animate-spin" />
              Fetching data…
            </div>
          )}
          {result.status === 'error' && (
            <p className="text-sm" style={{ color: 'var(--color-red)' }}>Error: {result.error}</p>
          )}
          {result.status === 'done' && <DataRenderer data={result.data} />}
        </div>
      )}
    </div>
  )
}

const RISK_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  high: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.35)', color: 'var(--color-red)', label: 'HIGH RISK' },
  medium: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.35)', color: '#f59e0b', label: 'MEDIUM RISK' },
  low: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: 'var(--color-green)', label: 'LOW RISK' },
  unknown: { bg: 'rgba(255,255,255,0.05)', border: 'var(--color-border)', color: 'var(--color-muted)', label: 'UNKNOWN' },
}

function InsightsPanel({
  insights,
  loading,
  error,
  onGenerate,
}: {
  insights: Insights | null
  loading: boolean
  error: string
  onGenerate: () => void
}) {
  const risk = insights ? (RISK_STYLE[insights.riskLevel] ?? RISK_STYLE.unknown) : null

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: 'var(--color-surface)',
      border: '1px solid rgba(0,212,255,0.25)',
    }}>
      <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: insights || error ? '1px solid var(--color-border)' : 'none' }}>
        <Sparkles size={15} style={{ color: 'var(--color-cyan)' }} />
        <span className="text-sm font-semibold flex-1" style={{ color: 'var(--color-text)' }}>AI Insights</span>
        {risk && (
          <span className="text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
            style={{ background: risk.bg, border: `1px solid ${risk.border}`, color: risk.color }}>
            <ShieldAlert size={11} /> {risk.label}
          </span>
        )}
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
          style={{
            background: 'rgba(0,212,255,0.12)',
            border: '1px solid rgba(0,212,255,0.3)',
            color: 'var(--color-cyan)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {loading ? 'Analyzing…' : insights ? 'Regenerate' : 'Generate analysis'}
        </button>
      </div>

      {(insights || error || loading) && (
        <div className="p-4 space-y-4">
          {loading && !insights && (
            <p className="text-sm flex items-center gap-2" style={{ color: 'var(--color-muted)' }}>
              <Loader2 size={14} className="animate-spin" /> Analyzing the collected evidence…
            </p>
          )}
          {error && <p className="text-sm" style={{ color: 'var(--color-red)' }}>{error}</p>}

          {insights && (
            <>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>{insights.summary}</p>

              {insights.keyFindings?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>Key Findings</p>
                  <ul className="space-y-1.5">
                    {insights.keyFindings.map((f, i) => (
                      <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--color-text)' }}>
                        <span style={{ color: 'var(--color-cyan)' }}>•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.recommendedNextSteps?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-muted)' }}>Recommended Next Steps</p>
                  <ul className="space-y-1.5">
                    {insights.recommendedNextSteps.map((s, i) => (
                      <li key={i} className="text-sm flex gap-2" style={{ color: 'var(--color-text)' }}>
                        <span style={{ color: 'var(--color-green)' }}>→</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.model && (
                <p className="text-xs pt-1" style={{ color: 'var(--color-muted)' }}>
                  Generated by {insights.model} · AI-generated, verify before acting
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DataRenderer({ data }: { data: unknown }) {
  if (!data || typeof data !== 'object') {
    return <pre className="text-xs font-mono" style={{ color: 'var(--color-text)' }}>{String(data)}</pre>
  }

  const obj = data as Record<string, unknown>

  return (
    <div className="space-y-1">
      {Object.entries(obj).map(([key, value]) => {
        if (value === null || value === undefined || value === '') return null

        const displayValue = Array.isArray(value)
          ? value.join(', ')
          : typeof value === 'object'
          ? JSON.stringify(value, null, 2)
          : String(value)

        if (key === '_raw') {
          return (
            <pre
              key={key}
              className="text-xs font-mono p-3 rounded-lg overflow-x-auto whitespace-pre-wrap mt-2"
              style={{
                background: 'var(--color-surface-2)',
                color: 'var(--color-text)',
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {displayValue}
            </pre>
          )
        }

        return (
          <div key={key} className="flex gap-3 py-1.5 text-sm" style={{
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span className="font-mono text-xs w-40 flex-shrink-0 pt-0.5" style={{ color: 'var(--color-muted)' }}>
              {key}
            </span>
            <span className="font-mono text-xs flex-1 break-all" style={{ color: 'var(--color-text)' }}>
              {displayValue}
            </span>
          </div>
        )
      })}
    </div>
  )
}
