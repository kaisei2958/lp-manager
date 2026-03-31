import { NextRequest, NextResponse } from 'next/server'

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN  // xoxb-... (Bot User OAuth Token)

// ===== GET: チャンネルのメッセージを取得 =====
// /api/slack?channel=C12345678&limit=20
export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel')
  const limit   = req.nextUrl.searchParams.get('limit') ?? '20'

  if (!channel) return NextResponse.json({ error: 'channel is required' }, { status: 400 })
  if (!SLACK_TOKEN) {
    return NextResponse.json({ error: 'SLACK_BOT_TOKEN env var not set' }, { status: 500 })
  }

  try {
    // チャンネル名（#なし）が渡された場合はIDに変換
    let channelId: string = channel
    if (!channel.startsWith('C') && !channel.startsWith('G') && !channel.startsWith('D')) {
      const resolved = await resolveChannelId(channel)
      if (!resolved) {
        return NextResponse.json({ error: `Channel not found: ${channel}` }, { status: 404 })
      }
      channelId = resolved
    }

    // メッセージ取得
    const res = await fetch(
      `https://slack.com/api/conversations.history?channel=${channelId}&limit=${limit}`,
      { headers: { Authorization: `Bearer ${SLACK_TOKEN}` }, next: { revalidate: 30 } }
    )
    const data = await res.json()

    if (!data.ok) {
      return NextResponse.json({ error: data.error }, { status: 400 })
    }

    // ユーザー名を解決して返す
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

// ===== ヘルパー =====

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

// チャンネル名 → ID
async function resolveChannelId(name: string): Promise<string | null> {
  const res = await fetch(
    `https://slack.com/api/conversations.list?limit=200&exclude_archived=true&types=public_channel,private_channel`,
    { headers: { Authorization: `Bearer ${SLACK_TOKEN}` } }
  )
  const data = await res.json()
  if (!data.ok) return null
  const ch = data.channels?.find((c: { name: string; id: string }) => c.name === name.replace(/^#/, ''))
  return ch?.id ?? null
}

// ユーザーID → 表示名
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
