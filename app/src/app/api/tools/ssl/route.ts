import { NextRequest, NextResponse } from 'next/server'
import tls from 'tls'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(253) })

async function getCertInfo(hostname: string, port = 443): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: hostname, port, servername: hostname, rejectUnauthorized: false }, () => {
      const cert = socket.getPeerCertificate(true)
      socket.destroy()

      if (!cert || !cert.subject) {
        reject(new Error('No certificate found'))
        return
      }

      const info: Record<string, string> = {}

      const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''
      if (cert.subject?.CN) info['Common Name'] = str(cert.subject.CN)
      if (cert.subject?.O) info['Organization'] = str(cert.subject.O)
      if (cert.subject?.C) info['Country'] = str(cert.subject.C)

      if (cert.issuer?.CN) info['Issuer CN'] = str(cert.issuer.CN)
      if (cert.issuer?.O) info['Issuer Org'] = str(cert.issuer.O)

      if (cert.valid_from) info['Valid From'] = cert.valid_from
      if (cert.valid_to) info['Valid To'] = cert.valid_to

      const now = Date.now()
      const expiry = new Date(cert.valid_to).getTime()
      const daysLeft = Math.floor((expiry - now) / (1000 * 60 * 60 * 24))
      info['Days Until Expiry'] = daysLeft < 0 ? 'EXPIRED' : `${daysLeft} days`

      if (cert.subjectaltname) {
        const sans = cert.subjectaltname.split(', ').filter((s: string) => s.startsWith('DNS:')).map((s: string) => s.replace('DNS:', ''))
        if (sans.length) info['SANs (DNS)'] = sans.join(', ')
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const certAny = cert as any
      if (certAny.fingerprint) info['SHA-1 Fingerprint'] = String(certAny.fingerprint)
      if (certAny.fingerprint256) info['SHA-256 Fingerprint'] = String(certAny.fingerprint256)

      const protocol = socket.getProtocol()
      if (protocol) info['TLS Protocol'] = protocol

      const cipher = socket.getCipher()
      if (cipher) info['Cipher'] = `${cipher.name} (${cipher.version})`

      resolve(info)
    })

    socket.on('error', reject)
    setTimeout(() => { socket.destroy(); reject(new Error('SSL timeout')) }, 8000)
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid target' }, { status: 400 })

  const hostname = parsed.data.target.replace(/^https?:\/\//, '').split('/')[0]

  try {
    const info = await getCertInfo(hostname)
    return NextResponse.json(info)
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch SSL cert: ${String(err)}` }, { status: 500 })
  }
}
