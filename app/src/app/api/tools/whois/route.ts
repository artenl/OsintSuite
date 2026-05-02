import { NextRequest, NextResponse } from 'next/server'
import net from 'net'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

async function queryWhois(host: string, query: string, port = 43): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket()
    let data = ''
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('WHOIS timeout')) }, 8000)

    socket.connect(port, host, () => socket.write(query + '\r\n'))
    socket.on('data', (chunk) => (data += chunk.toString()))
    socket.on('close', () => { clearTimeout(timer); resolve(data) })
    socket.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
}

function parseWhois(raw: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const lines = raw.split('\n')
  for (const line of lines) {
    if (line.startsWith('%') || line.startsWith('#') || !line.includes(':')) continue
    const colonIdx = line.indexOf(':')
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value && !parsed[key]) parsed[key] = value
  }
  return parsed
}

async function findWhoisServer(domain: string): Promise<string> {
  const tld = domain.split('.').pop()!
  try {
    const ianaRaw = await queryWhois('whois.iana.org', tld)
    const match = ianaRaw.match(/whois:\s+(\S+)/i)
    if (match) return match[1]
  } catch {}
  return `whois.${tld}.whois-servers.net`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const { target } = parsed.data
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(target)

  try {
    let raw: string
    if (isIp) {
      raw = await queryWhois('whois.arin.net', `n + ${target}`)
    } else {
      const server = await findWhoisServer(target)
      raw = await queryWhois(server, target)
    }

    const fields = parseWhois(raw)

    const important = [
      'Domain Name', 'Registrar', 'Registrar URL', 'Registrant Name',
      'Registrant Organization', 'Registrant Country', 'Creation Date',
      'Updated Date', 'Registry Expiry Date', 'Name Server',
      'DNSSEC', 'Domain Status',
      // ARIN fields for IPs
      'NetRange', 'CIDR', 'NetName', 'Organization', 'OrgName', 'Country',
    ]

    const result: Record<string, string> = {}
    for (const key of important) {
      if (fields[key]) result[key] = fields[key]
    }
    result._raw = raw

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
