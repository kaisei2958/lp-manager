import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

interface SlackMessage {
  ts: string
  text: string
  userName: string
  datetime: string
}

export async function POST(req: NextRequest) {
  try {
    const { messages, caseName } = await req.json() as {
      messages: SlackMessage[]
      caseName: string
    }

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'メッセージがありません' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY を Vercel 環境変数に設定してください' },
        { status: 500 }
      )
    }

    const anthropic = new Anthropic({ apiKey })

    // メッセージを整形（最新30件、古い順）
    const formatted = messages
      .slice(0, 30)
      .reverse()
      .map(m => `[${m.datetime}] ${m.userName}: ${m.text}`)
      .join('\n')

    const prompt = `以下は「${caseName}」に関するSlackチャンネルの最近のメッセージです。

---
${formatted}
---

このLPプロジェクトの現状を以下の形式で日本語で簡潔に要約してください：

**📊 現在の進捗**
（今どこまで進んでいるか、何が完了しているか）

**⚠️ 課題・ブロッカー**
（問題点、待ちの状況、未解決の事項。なければ「なし」）

**✅ 次のアクション**
（次にやるべきことを箇条書きで2〜3項目）

実務担当者が1分で状況を把握できる要約にしてください。`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = response.content[0].type === 'text' ? response.content[0].text : ''

    return NextResponse.json({ summary })
  } catch (e) {
    console.error('[ai/summarize] error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
