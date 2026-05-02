import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const schema = z.object({ target: z.string().min(1).max(64) })

interface Platform {
  name: string
  url: string
  check: (html: string, status: number) => boolean
}

const PLATFORMS: Platform[] = [
  // Dev & Tech
  { name: 'GitHub', url: 'https://github.com/{}', check: (_, s) => s === 200 },
  { name: 'GitLab', url: 'https://gitlab.com/{}', check: (_, s) => s === 200 },
  { name: 'Docker Hub', url: 'https://hub.docker.com/u/{}', check: (_, s) => s === 200 },
  { name: 'npm', url: 'https://www.npmjs.com/~{}', check: (_, s) => s === 200 },
  { name: 'PyPI', url: 'https://pypi.org/user/{}', check: (_, s) => s === 200 },
  { name: 'Codepen', url: 'https://codepen.io/{}', check: (_, s) => s === 200 },
  { name: 'Replit', url: 'https://replit.com/@{}', check: (_, s) => s === 200 },
  { name: 'HackerNews', url: 'https://news.ycombinator.com/user?id={}', check: (h, s) => s === 200 && !h.includes('No such user') },
  { name: 'Kaggle', url: 'https://www.kaggle.com/{}', check: (_, s) => s === 200 },
  { name: 'SourceForge', url: 'https://sourceforge.net/u/{}/profile/', check: (_, s) => s === 200 },
  // Social
  { name: 'Reddit', url: 'https://www.reddit.com/user/{}', check: (h, s) => s === 200 && !h.includes('Sorry, nobody on Reddit') },
  { name: 'Twitch', url: 'https://www.twitch.tv/{}', check: (_, s) => s === 200 },
  { name: 'Pinterest', url: 'https://www.pinterest.com/{}', check: (h, s) => s === 200 && !h.includes('User not found') },
  { name: 'Linktree', url: 'https://linktr.ee/{}', check: (_, s) => s === 200 },
  { name: 'Tumblr', url: 'https://{}.tumblr.com', check: (h, s) => s === 200 && !h.includes('There\'s nothing here') },
  { name: 'Mastodon', url: 'https://mastodon.social/@{}', check: (_, s) => s === 200 },
  { name: 'Lemmy', url: 'https://lemmy.world/u/{}', check: (_, s) => s === 200 },
  { name: 'Minds', url: 'https://www.minds.com/{}/', check: (_, s) => s === 200 },
  // Music & Art
  { name: 'SoundCloud', url: 'https://soundcloud.com/{}', check: (_, s) => s === 200 },
  { name: 'Bandcamp', url: 'https://{}.bandcamp.com', check: (_, s) => s === 200 },
  { name: 'Spotify', url: 'https://open.spotify.com/user/{}', check: (_, s) => s === 200 },
  { name: 'Last.fm', url: 'https://www.last.fm/user/{}', check: (h, s) => s === 200 && !h.includes('User not found') },
  { name: 'Vimeo', url: 'https://vimeo.com/{}', check: (_, s) => s === 200 },
  { name: 'Flickr', url: 'https://www.flickr.com/people/{}', check: (h, s) => s === 200 && !h.includes('Page Not Found') },
  { name: 'Dribbble', url: 'https://dribbble.com/{}', check: (h, s) => s === 200 && !h.includes('Whoops') },
  { name: 'Behance', url: 'https://www.behance.net/{}', check: (h, s) => s === 200 && !h.includes('Page Not Found') },
  { name: '500px', url: 'https://500px.com/p/{}', check: (_, s) => s === 200 },
  // Professional
  { name: 'Medium', url: 'https://medium.com/@{}', check: (_, s) => s === 200 },
  { name: 'Dev.to', url: 'https://dev.to/{}', check: (_, s) => s === 200 },
  { name: 'Producthunt', url: 'https://www.producthunt.com/@{}', check: (_, s) => s === 200 },
  { name: 'AngelList', url: 'https://angel.co/u/{}', check: (_, s) => s === 200 },
  { name: 'Gravatar', url: 'https://en.gravatar.com/{}', check: (_, s) => s === 200 },
  { name: 'About.me', url: 'https://about.me/{}', check: (_, s) => s === 200 },
  { name: 'Keybase', url: 'https://keybase.io/{}', check: (_, s) => s === 200 },
  // Gaming
  { name: 'Steam', url: 'https://steamcommunity.com/id/{}', check: (h, s) => s === 200 && !h.includes('The specified profile could not be found') },
  { name: 'Xbox', url: 'https://www.xbox.com/en-US/play/user/{}', check: (_, s) => s === 200 },
  { name: 'Chess.com', url: 'https://www.chess.com/member/{}', check: (_, s) => s === 200 },
  { name: 'Speedrun.com', url: 'https://www.speedrun.com/user/{}', check: (h, s) => s === 200 && !h.includes('User not found') },
  // Other
  { name: 'Pastebin', url: 'https://pastebin.com/u/{}', check: (h, s) => s === 200 && !h.includes('Not Found') },
  { name: 'Disqus', url: 'https://disqus.com/{}', check: (_, s) => s === 200 },
  { name: 'Trello', url: 'https://trello.com/{}', check: (_, s) => s === 200 },
  { name: 'Wattpad', url: 'https://www.wattpad.com/user/{}', check: (h, s) => s === 200 && !h.includes('Page not found') },
  { name: 'Quora', url: 'https://www.quora.com/profile/{}', check: (_, s) => s === 200 },
  { name: 'Goodreads', url: 'https://www.goodreads.com/{}', check: (_, s) => s === 200 },
  { name: 'Letterboxd', url: 'https://letterboxd.com/{}', check: (h, s) => s === 200 && !h.includes('isn\'t a Letterboxd member') },
  { name: 'GitBook', url: 'https://app.gitbook.com/@{}', check: (_, s) => s === 200 },
  { name: 'Codecademy', url: 'https://www.codecademy.com/profiles/{}', check: (_, s) => s === 200 },
]

async function checkPlatform(platform: Platform, username: string): Promise<{ found: boolean | null; error?: string }> {
  const url = platform.url.replace('{}', username)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    })
    const html = await res.text()
    return { found: platform.check(html, res.status) }
  } catch {
    return { found: null, error: 'timeout' }
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid username' }, { status: 400 })

  const username = parsed.data.target

  const results = await Promise.all(
    PLATFORMS.map(async (platform) => {
      const { found, error } = await checkPlatform(platform, username)
      return {
        platform: platform.name,
        url: platform.url.replace('{}', username),
        found,
        error,
      }
    })
  )

  return NextResponse.json({ username, results })
}
