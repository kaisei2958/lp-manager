import { NextRequest, NextResponse } from 'next/server'

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN

export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel')
  const limit   = req.nextUrl.searchParams.get('limit') ?? '20'

  if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  if (!SLACK_TOKEN) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN env var not set' }, { status: 500 })
  }
  

  try {
    // チャンネル名の場合はIDに変換
    let channelId: string = channel
    if (!channel.startsWith('C') && !channel.startsWith('G') && !channel.startsWith('D')) {
      const resolved = await resolveChannelId(channel)
      if (!resolved) {
        return NextResponse.json({ error: `Channel not found: ${channel}` }, { status: 404 })
      }
      channelId = resolved
    }

    // メッセージ取得（not_in_channelの場合はjoinしてリトライ）
    let data = await fetchHistory(channelId, limit)

    if (!data.ok && data.error === 'not_in_channel') {
      // パブリックチャンネルなら参加してリトライ
      await fetch('https://slack.com/api/conversations.join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: channelId })
      })
      data = await fetchHistory(channelId, limit)
    }

    if (!data.ok) {
      return NextResponse.json({ error: data.error }, { status: 400 })
    }

    const messages = await Promise.all(
      (data.messages ?? []).map(async (m: SlackMessage) => ({
        ts:       m.ts,
        text:     m.text ?? '',
        userName: m.username ?? (m.user ? await resolveUserName(m.user) : 'Unknown'),
        botName:  m.bot_profile?.name ?? null,
        datetime: new Date(Number(m.ts) * 1000).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
        files:    (m.files ?? []).map((f: SlackFile) => ({ name: f.name, url: f.url_private })),
      }))
    )

    return NextResponse.json({ messages, channelId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

interface SlackMessage {
  ts: string
  text?: string
  username?: string
  user?: string
  bot_profile?: { name: string }
  files?: SlackFile[]
}

interface SlackFile {
  name: string
  url_private: string
}

async function fetchHistory(channelId: string, limit: string) {
  const res = await fetch(
    `https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${SLACK_TOKEN}` }, next: { revalidate: 30 } }
  )
  return res.json()
}

async function resolveChannelId(name: string): Promise<string | null> {
  let cursor = ''
  const cleanName = name.replace(/^#/, '')
  while (true) {
    const url = `https://slack.com/api/conversations.list?limit=200&exclude_archived=true&types=public_channel,private_channel${cursor ? '&cursor=' + cursor : ''}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } })
    const data = await res.json()
    if (!data.ok) return null
    const ch = data.channels?.find((c: { name: string; id: string }) => c.name === cleanName || c.name.startsWith(cleanName + '_'))
    if (ch) return ch.id
    if (!data.response_metadata?.next_cursor) return null
    cursor = data.response_metadata.next_cursor
  }
}

const userCache: Record<string, string> = {}
async function resolveUserName(userId: string): Promise<string> {
  if (userCache[userId]) return userCache[userId]
  const res = await fetch(
    `https://slack.com/api/users.info?user=${userId}`,
    { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
  )
  const data = await res.json()
  const name = data.user?.profile?.display_name || data.user?.real_name || userId
  userCache[userId] = name
  return name
}
