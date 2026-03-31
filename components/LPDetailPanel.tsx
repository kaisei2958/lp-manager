'use client'

import { useEffect, useState, useCallback } from 'react'
import { LP } from '@/types/lp'
import { updateLP } from '@/lib/supabase'

// ===== TYPES =====
interface BacklogIssue {
  id: number
  issueKey: string
  summary: string
  status: { id: number; name: string; lpStatus: string | null }
  assignee: string | null
  dueDate: string | null
  milestone: string | null
  priority: string | null
  description: string
  updated: string
  url: string
}

interface SlackMessage {
  ts: string
  text: string
  userName: string
  botName: string | null
  datetime: string
  files: { name: string; url: string }[]
}

interface Props {
  lp: LP
  onClose: () => void
  onUpdate: (updated: LP) => void
}

// ===== COMPONENT =====
export default function LPDetailPanel({ lp, onClose, onUpdate }: Props) {
  const [backlog, setBacklog] = useState<BacklogIssue | null>(null)
  const [backlogLoading, setBacklogLoading] = useState(false)
  const [backlogError, setBacklogError] = useState<string | null>(null)
  const [syncingToBacklog, setSyncingToBacklog] = useState(false)

  const [slackMsgs, setSlackMsgs] = useState<SlackMessage[]>([])
  const [slackLoading, setSlackLoading] = useState(false)
  const [slackError, setSlackError] = useState<string | null>(null)

  const [toast, setToast] = useState('')
  const [toastVisible, setToastVisible] = useState(false)

  function showToast(msg: string) {
    setToast(msg); setToastVisible(true)
    setTimeout(() => setToastVisible(false), 2400)
  }

  // ===== Backlog 取得 =====
  const fetchBacklog = useCallback(async () => {
    if (!lp.backlog_issue_key) return
    setBacklogLoading(true); setBacklogError(null)
    try {
      const res = await fetch(`/api/backlog?issueKey=${encodeURIComponent(lp.backlog_issue_key)}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBacklog(data)
    } catch (e) {
      setBacklogError(e instanceof Error ? e.message : 'Backlog取得失敗')
    } finally {
      setBacklogLoading(false)
    }
  }, [lp.backlog_issue_key])

  // ===== Backlogのステータスをアプリに同期 =====
  async function syncFromBacklog() {
    if (!backlog?.status.lpStatus) return
    try {
      const updated = await updateLP(lp.id, { status: backlog.status.lpStatus as LP['status'] })
      onUpdate(updated)
      showToast(`✅ ステータスを「${backlog.status.lpStatus}」に同期しました`)
    } catch {
      showToast('⚠️ 同期に失敗しました')
    }
  }

  // ===== アプリのステータスをBacklogに反映 =====
  async function pushToBacklog() {
    if (!lp.backlog_issue_key) return
    setSyncingToBacklog(true)
    try {
      const res = await fetch(`/api/backlog?issueKey=${encodeURIComponent(lp.backlog_issue_key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lpStatus: lp.status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`✅ Backlogのステータスを「${data.newStatus}」に更新しました`)
      fetchBacklog()
    } catch (e) {
      showToast('⚠️ ' + (e instanceof Error ? e.message : 'Backlog更新失敗'))
    } finally {
      setSyncingToBacklog(false)
    }
  }

  // ===== Slack 取得 =====
  const fetchSlack = useCallback(async () => {
    if (!lp.slack_channel) return
    setSlackLoading(true); setSlackError(null)
    try {
      const res = await fetch(`/api/slack?channel=${encodeURIComponent(lp.slack_channel)}&limit=20`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setSlackMsgs(data.messages ?? [])
    } catch (e) {
      setSlackError(e instanceof Error ? e.message : 'Slack取得失敗')
    } finally {
      setSlackLoading(false)
    }
  }, [lp.slack_channel])

  useEffect(() => {
    fetchBacklog()
    fetchSlack()
  }, [fetchBacklog, fetchSlack])

  // Slackのテキストを簡易整形（メンションなど）
  function formatSlackText(text: string): string {
    return text
      .replace(/<@[A-Z0-9]+>/g, '@ユーザー')
      .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
      .replace(/<([^>|]+)\|([^>]+)>/g, '$2')
      .replace(/<([^>]+)>/g, '$1')
      .replace(/\n{3,}/g, '\n\n')
  }

  return (
    <>
      {/* オーバーレイ背景 */}
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.2)', zIndex: 150 }} onClick={onClose} />

      {/* パネル本体 */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
        background: '#fff', zIndex: 160, display: 'flex', flexDirection: 'column',
        boxShadow: '-4px 0 24px rgba(0,0,0,.12)', animation: 'slideIn .2s ease',
        overflowY: 'auto',
      }}>
        <style>{`@keyframes slideIn { from { transform: translateX(40px); opacity: 0 } }`}</style>

        {/* ヘッダー */}
        <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: 'var(--text-sub)', fontWeight: 700, marginBottom: 2 }}>{lp.channel || '—'}</div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{lp.name}</div>
            <span className={`badge badge-${lp.status}`} style={{ marginTop: 6, display: 'inline-flex' }}>
              <span className="bd" />{lp.status}
            </span>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ fontSize: 18, flexShrink: 0 }}>✕</button>
        </div>

        {/* ===== BACKLOG ===== */}
        <section style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: '#1f6fba', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>Backlog</span>
              {lp.backlog_issue_key && <span style={{ color: 'var(--text-sub)', fontSize: 12 }}>{lp.backlog_issue_key}</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {lp.backlog_issue_key && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={fetchBacklog} disabled={backlogLoading}>
                  {backlogLoading ? '...' : '🔄 更新'}
                </button>
              )}
            </div>
          </div>

          {!lp.backlog_issue_key ? (
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>課題キーが未設定です。案件編集から Backlog 課題キーを入力してください。</p>
          ) : backlogLoading ? (
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>読み込み中...</p>
          ) : backlogError ? (
            <p style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {backlogError}</p>
          ) : backlog ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <a href={backlog.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, color: 'var(--blue)', fontSize: 13, textDecoration: 'none' }}>
                {backlog.summary} ↗
              </a>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <InfoRow label="Backlogステータス" value={backlog.status.name} />
                <InfoRow label="担当者" value={backlog.assignee ?? '—'} />
                <InfoRow label="期日" value={backlog.dueDate ? backlog.dueDate.slice(0, 10) : '—'} />
                <InfoRow label="マイルストーン" value={backlog.milestone ?? '—'} />
                <InfoRow label="優先度" value={backlog.priority ?? '—'} />
                <InfoRow label="最終更新" value={new Date(backlog.updated).toLocaleDateString('ja-JP')} />
              </div>
              {backlog.description && (
                <div style={{ background: 'var(--bg)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: 'var(--text-sub)', maxHeight: 80, overflow: 'auto', whiteSpace: 'pre-wrap' }}>
                  {backlog.description.slice(0, 300)}{backlog.description.length > 300 ? '...' : ''}
                </div>
              )}
              {/* 同期ボタン */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {backlog.status.lpStatus && backlog.status.lpStatus !== lp.status && (
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: '5px 12px' }} onClick={syncFromBacklog}>
                    ← Backlogから同期（{backlog.status.lpStatus}）
                  </button>
                )}
                <button
                  className="btn btn-primary" style={{ fontSize: 12, padding: '5px 12px' }}
                  onClick={pushToBacklog} disabled={syncingToBacklog}
                >
                  {syncingToBacklog ? '更新中...' : `→ Backlogに反映（${lp.status}）`}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* ===== SLACK ===== */}
        <section style={{ padding: '14px 20px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: '#4a154b', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 11 }}>Slack</span>
              {lp.slack_channel && <span style={{ color: 'var(--text-sub)', fontSize: 12 }}>#{lp.slack_channel}</span>}
            </div>
            {lp.slack_channel && (
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 12 }} onClick={fetchSlack} disabled={slackLoading}>
                {slackLoading ? '...' : '🔄 更新'}
              </button>
            )}
          </div>

          {!lp.slack_channel ? (
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>Slackチャンネルが未設定です。案件編集からチャンネル名を入力してください。</p>
          ) : slackLoading ? (
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>読み込み中...</p>
          ) : slackError ? (
            <p style={{ color: 'var(--red)', fontSize: 12 }}>⚠️ {slackError}</p>
          ) : slackMsgs.length === 0 ? (
            <p style={{ color: 'var(--text-sub)', fontSize: 12 }}>メッセージがありません</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slackMsgs.map(msg => (
                <div key={msg.ts} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{msg.botName ?? msg.userName}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-sub)' }}>{msg.datetime}</span>
                  </div>
                  <p style={{ fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
                    {formatSlackText(msg.text)}
                  </p>
                  {msg.files.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {msg.files.map(f => (
                        <span key={f.name} style={{ fontSize: 11, background: '#e8f0fe', color: 'var(--blue)', borderRadius: 4, padding: '2px 6px' }}>
                          📎 {f.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Toast */}
      <div className={`toast${toastVisible ? ' show' : ''}`}>{toast}</div>
    </>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 6, padding: '5px 8px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-sub)', fontWeight: 700, marginBottom: 1 }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 600 }}>{value}</div>
    </div>
  )
}
