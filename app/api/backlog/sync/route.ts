import { NextRequest, NextResponse } from 'next/server'

// Backlog ステータス名 → アプリ ステータス マッピング
const STATUS_MAP: Record<string, string> = {
  '未対応':   '依頼前',
  '処理中':   '進行中',
  '処理済み': '先方チェック',
  '完了':     '納品',
  'WF作成':        'WF作成',
  'コーディング':  'コーディング',
  '確認中':        '先方チェック',
  '配信待ち':      '配信待ち',
  '配信済み':      '納品',
  '失注':          '失注',
  '保留':          '保留',
}

// GET /api/backlog/sync?key=s193
// 指定したBacklog課題キーの現在のステータスを取得して返す
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })

  const spaceId = process.env.BACKLOG_SPACE_ID
  const apiKey  = process.env.BACKLOG_API_KEY

  if (!spaceId || !apiKey) {
    return NextResponse.json(
      { error: 'BACKLOG_SPACE_ID と BACKLOG_API_KEY を Vercel 環境変数に設定してください' },
      { status: 500 }
    )
  }

  try {
    const url = `https://${spaceId}.backlog.com/api/v2/issues/${encodeURIComponent(key)}?apiKey=${apiKey}`
    const res = await fetch(url, { next: { revalidate: 0 } })
    const data = await res.json()

    if (!res.ok) {
      const msg = data.errors?.[0]?.message || `Backlog API error (${res.status})`
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    const backlogStatus = data.status?.name as string | undefined
    const appStatus = backlogStatus ? STATUS_MAP[backlogStatus] : undefined

    return NextResponse.json({
      issueKey:      data.issueKey,
      summary:       data.summary,
      backlogStatus: backlogStatus ?? '不明',
      appStatus:     appStatus ?? null,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
