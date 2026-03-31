import { NextRequest, NextResponse } from 'next/server'

const BACKLOG_SPACE = process.env.BACKLOG_SPACE_KEY   // 例: yourcompany
const BACKLOG_API_KEY = process.env.BACKLOG_API_KEY   // Backlog の個人設定 > API キー

// Backlog ステータス ID マッピング
// 1=未対応 2=処理中 3=処理済み 4=完了
const LP_TO_BACKLOG_STATUS: Record<string, number> = {
  '進行中':     2,
  'コーディング': 2,
  '先方チェック': 2,
  '配信待ち':   3,
  '納品':       4,
  '保留':       1,
  '失注':       4,
}

const BACKLOG_TO_LP_STATUS: Record<number, string> = {
  1: '保留',
  2: '進行中',
  3: '配信待ち',
  4: '納品',
}

function backlogBase() {
  return `https://${BACKLOG_SPACE}.backlog.com/api/v2`
}

// ===== GET: 課題情報を取得 =====
// /api/backlog?issueKey=LP-123
export async function GET(req: NextRequest) {
  const issueKey = req.nextUrl.searchParams.get('issueKey')
  if (!issueKey) return NextResponse.json({ error: 'issueKey is required' }, { status: 400 })
  if (!BACKLOG_SPACE || !BACKLOG_API_KEY) {
    return NextResponse.json({ error: 'Backlog env vars not set' }, { status: 500 })
  }

  try {
    const res = await fetch(
      `${backlogBase()}/issues/${issueKey}?apiKey=${BACKLOG_API_KEY}`,
      { next: { revalidate: 60 } }   // 60秒キャッシュ
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Backlog API error: ${res.status} ${text}` }, { status: res.status })
    }
    const data = await res.json()

    // 必要な情報だけ返す
    return NextResponse.json({
      id:          data.id,
      issueKey:    data.issueKey,
      summary:     data.summary,
      status: {
        id:   data.status?.id,
        name: data.status?.name,
        lpStatus: BACKLOG_TO_LP_STATUS[data.status?.id] ?? null,
      },
      assignee:    data.assignee?.name ?? null,
      dueDate:     data.dueDate ?? null,          // "2026-03-31T00:00:00Z"
      startDate:   data.startDate ?? null,
      milestone:   data.milestone?.[0]?.name ?? null,
      priority:    data.priority?.name ?? null,
      description: data.description ?? '',
      updated:     data.updated,
      url: `https://${BACKLOG_SPACE}.backlog.com/view/${data.issueKey}`,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// ===== PATCH: ステータスを更新 =====
// /api/backlog?issueKey=LP-123
// body: { lpStatus: "納品" }
export async function PATCH(req: NextRequest) {
  const issueKey = req.nextUrl.searchParams.get('issueKey')
  if (!issueKey) return NextResponse.json({ error: 'issueKey is required' }, { status: 400 })
  if (!BACKLOG_SPACE || !BACKLOG_API_KEY) {
    return NextResponse.json({ error: 'Backlog env vars not set' }, { status: 500 })
  }

  const { lpStatus } = await req.json()
  const backlogStatusId = LP_TO_BACKLOG_STATUS[lpStatus]
  if (!backlogStatusId) {
    return NextResponse.json({ error: `Unknown lpStatus: ${lpStatus}` }, { status: 400 })
  }

  try {
    const params = new URLSearchParams({
      apiKey:   BACKLOG_API_KEY,
      statusId: String(backlogStatusId),
    })
    const res = await fetch(
      `${backlogBase()}/issues/${issueKey}?${params}`,
      { method: 'PATCH' }
    )
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Backlog API error: ${res.status} ${text}` }, { status: res.status })
    }
    const data = await res.json()
    return NextResponse.json({ success: true, newStatus: data.status?.name })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
