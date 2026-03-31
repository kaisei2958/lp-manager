import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Backlog ステータス名 → アプリ ステータス マッピング
const STATUS_MAP: Record<string, string> = {
  '未対応':   '依頼前',
  '処理中':   '進行中',
  '処理済み': '先方チェック',
  '完了':     '納品',
  // カスタムステータス追加可
  'WF作成':        'WF作成',
  'デザイン':      'WF作成',
  'コーディング':  'コーディング',
  '確認中':        '先方チェック',
  '配信待ち':      '配信待ち',
  '配信済み':      '納品',
  '失注':          '失注',
  '保留':          '保留',
}

interface BacklogChange {
  field: string
  new_value: string
  old_value: string
}

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  try {
    const body = await req.json()

    // type 2 = 課題の更新
    if (body.type !== 2) {
      return NextResponse.json({ message: 'ignored (not issue update)' })
    }

    const project = body.project
    const content = body.content
    if (!project || !content) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // ステータス変更を確認
    const changes: BacklogChange[] = content.changes || []
    const statusChange = changes.find(c => c.field === 'status')
    if (!statusChange) {
      return NextResponse.json({ message: 'no status change' })
    }

    const newBacklogStatus = content.status?.name || statusChange.new_value
    const appStatus = STATUS_MAP[newBacklogStatus]

    if (!appStatus) {
      return NextResponse.json({
        message: `no mapping for backlog status: "${newBacklogStatus}"`,
        hint: 'Add to STATUS_MAP in /app/api/backlog/webhook/route.ts',
      })
    }

    // Backlog 課題キーを複数形式でマッチ
    const projectKey = (project.projectKey as string) || ''
    const keyId = content.key_id as number
    const fullKey   = `${projectKey}-${keyId}`             // e.g. "S-193"
    const shortKey  = `${projectKey.toLowerCase()}${keyId}` // e.g. "s193"
    // プロジェクトキー小文字もマッチ対象に追加（例: "S246" → "s246"）
        const projectKeyLower = projectKey.toLowerCase()
    
    const { data: rows, error } = await supabase
      .from('lp_cases')
      .select('id, status, name')
      .or([
        `backlog_issue_key.eq.${fullKey}`,
        `backlog_issue_key.eq.${shortKey}`,
        `backlog_issue_key.eq.${projectKeyLower}`,
        `channel.eq.${shortKey}`,
        `channel.eq.${fullKey}`,
        `channel.eq.${projectKeyLower}`,
      ].join(','))
      .limit(1)

    if (error) {
      console.error('[backlog webhook] supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        message: `case not found`,
        triedKeys: [fullKey, shortKey],
      })
    }

    const row = rows[0]

    if (row.status === appStatus) {
      return NextResponse.json({ message: 'status already up to date', name: row.name })
    }

    const { error: updateError } = await supabase
      .from('lp_cases')
      .update({ status: appStatus })
      .eq('id', row.id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    console.log(`[backlog webhook] updated "${row.name}": ${row.status} → ${appStatus}`)

    return NextResponse.json({
      success: true,
      name: row.name,
      oldStatus: row.status,
      newStatus: appStatus,
      backlogStatus: newBacklogStatus,
    })
  } catch (e) {
    console.error('[backlog webhook] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
