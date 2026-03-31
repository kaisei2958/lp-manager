'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { LP, LPInsert, LPStatus, STATUS_LIST, totalHours, totalCost } from '@/types/lp'
import { fetchLPs, insertLP, updateLP, deleteLP } from '@/lib/supabase'
import LPDetailPanel from './LPDetailPanel'

// ===== MULTI-SELECT =====
function MultiSelect({ label, options, value, onChange }: {
  label: string
  options: string[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])
  }

  const displayLabel = value.length === 0
    ? `${label}：すべて`
    : value.length === 1 ? `${label}：${value[0]}` : `${label}：${value.length}件`

  return (
    <div className="multi-select" ref={ref}>
      <button
        className={`filter-sel ms-trigger${value.length > 0 ? ' ms-active' : ''}`}
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        {displayLabel} <span className="ms-arrow">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="ms-dropdown">
          {value.length > 0 && (
            <button className="ms-clear" onClick={() => onChange([])} type="button">
              ✕ クリア
            </button>
          )}
          {options.map(opt => (
            <label key={opt} className="ms-option">
              <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} />
              <span>{opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ===== UTILS =====
function fmtDate(d: string | null): string {
  if (!d) return '—'
  const [y, m, dd] = d.split('-')
  return `${y}/${m}/${dd}`
}

function deadlineInfo(deadline: string | null): { text: string; cls: string } {
  if (!deadline) return { text: '—', cls: 'dl-none' }
  const today = new Date().toISOString().slice(0, 10)
  const days = Math.ceil((new Date(deadline).getTime() - new Date(today).getTime()) / 86400000)
  let text = fmtDate(deadline)
  if (days <= 3 && days >= 0) text += ` (あと${days}日)`
  if (days < 0) text += ' (超過)'
  const cls = days <= 3 ? 'dl-near' : 'dl-ok'
  return { text, cls }
}

function emptyForm(): LPInsert {
  return {
    channel: '', name: '', status: '進行中',
    front: '', director: '', designer: '', engineer: '',
    deadline: null, delivery_date: null,
    target_hours: null,
    dir_hours: 0, des_hours: 0, eng_hours: 0,
    dir_cost: 0, des_cost: 0, eng_cost: 0, int_cost: 0,
    ad_url: false, ad_gtm: false, ad_mat: false, memo: '',
    backlog_issue_key: '', slack_channel: '',
  }
}

type SortKey = keyof LP | 'total_hours'
type TabKey = 'list' | 'dashboard'

// ===== COMPONENT =====
export default function LPManager() {
  const [lps, setLps] = useState<LP[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // UI state
  const [tab, setTab] = useState<TabKey>('list')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string[]>([])
  const [filterFront, setFilterFront] = useState<string[]>([])
  const [filterDir, setFilterDir] = useState<string[]>([])
  const [filterDesigner, setFilterDesigner] = useState<string[]>([])
  const [filterEngineer, setFilterEngineer] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)

  // Detail panel
  const [detailLP, setDetailLP] = useState<LP | null>(null)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<LPInsert>(emptyForm())

  // Confirm
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Toast
  const [toastMsg, setToastMsg] = useState('')
  const [toastVisible, setToastVisible] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Slack AI 要約
  const [summaryLP, setSummaryLP] = useState<LP | null>(null)
  const [summaryText, setSummaryText] = useState('')
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)

  // ===== DATA =====
  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await fetchLPs()
      setLps(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'データの読み込みに失敗しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ===== TOAST =====
  function toast(msg: string) {
    setToastMsg(msg)
    setToastVisible(true)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToastVisible(false), 2200)
  }

  // ===== FILTER / SORT =====
  // スペース区切りでAND検索
  const tokens = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const filtered = lps.filter(l => {
    if (tokens.length > 0) {
      const haystack = `${l.channel} ${l.name} ${l.front} ${l.director} ${l.designer} ${l.engineer}`.toLowerCase()
      if (!tokens.every(t => haystack.includes(t))) return false
    }
    if (filterStatus.length > 0 && !filterStatus.includes(l.status)) return false
    if (filterFront.length > 0 && !filterFront.includes(l.front)) return false
    if (filterDir.length > 0 && !filterDir.includes(l.director)) return false
    if (filterDesigner.length > 0 && !filterDesigner.includes(l.designer)) return false
    if (filterEngineer.length > 0 && !filterEngineer.includes(l.engineer)) return false
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    const av = sortKey === 'total_hours' ? totalHours(a) : (a[sortKey as keyof LP] ?? '')
    const bv = sortKey === 'total_hours' ? totalHours(b) : (b[sortKey as keyof LP] ?? '')
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sortDir
    return (String(av) < String(bv) ? -1 : String(av) > String(bv) ? 1 : 0) * sortDir
  })

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 1 ? -1 : 1))
    else { setSortKey(key); setSortDir(1) }
  }

  function sortIcon(key: SortKey) {
    if (sortKey !== key) return <span className="sort-icon">▲</span>
    return <span className="sort-icon" style={{ opacity: 1 }}>{sortDir === 1 ? '▲' : '▼'}</span>
  }

  // Unique persons for filters
  const fronts    = [...new Set(lps.map(l => l.front).filter(Boolean))].sort()
  const dirs      = [...new Set(lps.map(l => l.director).filter(Boolean))].sort()
  const designers = [...new Set(lps.map(l => l.designer).filter(Boolean))].sort()
  const engineers = [...new Set(lps.map(l => l.engineer).filter(Boolean))].sort()

  // ===== MODAL =====
  function openAdd() {
    setEditId(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  function openEdit(lp: LP) {
    setEditId(lp.id)
    setForm({
      channel: lp.channel, name: lp.name, status: lp.status,
      front: lp.front, director: lp.director, designer: lp.designer, engineer: lp.engineer,
      deadline: lp.deadline, delivery_date: lp.delivery_date,
      target_hours: lp.target_hours,
      dir_hours: lp.dir_hours, des_hours: lp.des_hours, eng_hours: lp.eng_hours,
      dir_cost: lp.dir_cost, des_cost: lp.des_cost, eng_cost: lp.eng_cost, int_cost: lp.int_cost,
      ad_url: lp.ad_url, ad_gtm: lp.ad_gtm, ad_mat: lp.ad_mat, memo: lp.memo,
      backlog_issue_key: lp.backlog_issue_key ?? '',
      slack_channel: lp.slack_channel ?? '',
    })
    setModalOpen(true)
  }

  function setF<K extends keyof LPInsert>(key: K, val: LPInsert[K]) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    if (!form.name.trim()) { toast('案件名を入力してください'); return }
    setSaving(true)
    try {
      if (editId) {
        const updated = await updateLP(editId, form)
        setLps(lps => lps.map(l => l.id === editId ? updated : l))
        toast('✅ 更新しました')
      } else {
        const created = await insertLP(form)
        setLps(lps => [created, ...lps])
        toast('✅ 案件を追加しました')
      }
      setModalOpen(false)
      // 詳細パネルが開いていたら更新
      if (detailLP && editId === detailLP.id) {
        setDetailLP(editId ? (lps.find(l => l.id === editId) ?? null) : null)
      }
    } catch (e: unknown) {
      toast('⚠️ ' + (e instanceof Error ? e.message : '保存に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  // ===== SLACK AI 要約 =====
  async function fetchSlackSummary(lp: LP) {
    setSummaryLP(lp)
    setSummaryText('')
    setSummaryError(null)
    setSummaryLoading(true)
    try {
      const slackRes = await fetch(`/api/slack?channel=${encodeURIComponent(lp.slack_channel)}&limit=30`)
      const slackData = await slackRes.json()
      if (!slackRes.ok || slackData.error) throw new Error(slackData.error || 'Slackメッセージの取得に失敗しました')

      const summaryRes = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: slackData.messages, caseName: lp.name }),
      })
      const summaryData = await summaryRes.json()
      if (!summaryRes.ok || summaryData.error) throw new Error(summaryData.error || 'AI要約の生成に失敗しました')
      setSummaryText(summaryData.summary)
    } catch (e) {
      setSummaryError(e instanceof Error ? e.message : '要約に失敗しました')
    } finally {
      setSummaryLoading(false)
    }
  }

  // ===== BACKLOG 手動同期 =====
  async function syncBacklog(lp: LP) {
    setSaving(true)
    try {
      const res = await fetch(`/api/backlog/sync?key=${encodeURIComponent(lp.backlog_issue_key)}`)
      const data = await res.json()
      if (!res.ok || data.error) { toast('⚠️ ' + (data.error || 'Backlog同期に失敗しました')); return }
      if (data.appStatus && data.appStatus !== lp.status) {
        const { id: _id, created_at: _ca, ...lpInsert } = lp as LP & { created_at: string }
        const updated = await updateLP(lp.id, { ...lpInsert, status: data.appStatus as LPStatus })
        setLps(prev => prev.map(l => l.id === lp.id ? updated : l))
        toast(`✅ ステータスを「${data.appStatus}」に更新しました`)
      } else if (data.appStatus === lp.status) {
        toast('✅ ステータスは最新です')
      } else {
        toast(`⚠️ Backlogステータス「${data.backlogStatus}」のマッピングがありません`)
      }
    } catch (e) {
      toast('⚠️ ' + (e instanceof Error ? e.message : 'Backlog同期に失敗しました'))
    } finally {
      setSaving(false)
    }
  }

  // ===== DELETE =====
  function askDelete(id: string) {
    setDeleteId(id)
    setConfirmOpen(true)
  }

  async function handleDelete() {
    if (!deleteId) return
    try {
      await deleteLP(deleteId)
      setLps(lps => lps.filter(l => l.id !== deleteId))
      toast('🗑️ 削除しました')
    } catch (e: unknown) {
      toast('⚠️ ' + (e instanceof Error ? e.message : '削除に失敗しました'))
    } finally {
      setConfirmOpen(false)
      setDeleteId(null)
    }
  }

  // ===== STATS =====
  const today = new Date().toISOString().slice(0, 10)
  const cnt = (s: string) => lps.filter(l => l.status === s).length
  const nearCount = lps.filter(l => {
    if (!l.deadline) return false
    const days = Math.ceil((new Date(l.deadline).getTime() - new Date(today).getTime()) / 86400000)
    return days >= 0 && days <= 3
  }).length

  // ===== DASHBOARD DATA =====
  const statusList = STATUS_LIST
  const byCnt = statusList.map(s => ({ s, n: lps.filter(l => l.status === s).length })).filter(x => x.n > 0)
  const maxN = Math.max(...byCnt.map(x => x.n), 1)
  const byFront = fronts.map(f => ({ f, n: lps.filter(l => l.front === f).length })).sort((a, b) => b.n - a.n).slice(0, 8)
  const maxF = Math.max(...byFront.map(x => x.n), 1)
  const activeCount = lps.filter(l => ['進行中', 'コーディング', '先方チェック', '配信待ち'].includes(l.status)).length
  const totalTH = lps.reduce((s, l) => s + (l.target_hours || 0), 0)
  const overCount = lps.filter(l => l.target_hours && totalHours(l) > l.target_hours).length

  // ===== DELETE LP NAME =====
  const deleteName = deleteId ? lps.find(l => l.id === deleteId)?.name : ''

  // ===== RENDER =====
  if (loading) return <div className="app"><div className="loading">⏳ 読み込み中...</div></div>

  return (
    <div className="app">
      {/* HEADER */}
      <header className="header">
        <span className="logo">LP工数管理 <small>ランディングページ管理システム</small></span>
        <div className="header-spacer" />
        <button className="btn btn-primary" onClick={openAdd}>＋ 案件を追加</button>
      </header>

      {error && <div className="error-banner">⚠️ {error} <button onClick={load} style={{ marginLeft: 8, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>再読み込み</button></div>}

      {/* TABS */}
      <div className="tabs">
        <button className={`tab${tab === 'list' ? ' active' : ''}`} onClick={() => setTab('list')}>📋 一覧</button>
        <button className={`tab${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>📊 ダッシュボード</button>
      </div>

      {tab === 'list' && (
        <>
          {/* STATS */}
          <div className="stats">
            <div className="stat"><span className="stat-val c-blue">{lps.length}</span><span className="stat-label">総案件数</span></div>
            <div className="stat"><span className="stat-val c-blue">{cnt('進行中') + cnt('コーディング')}</span><span className="stat-label">制作中</span></div>
            <div className="stat"><span className="stat-val c-orange">{cnt('先方チェック') + cnt('配信待ち')}</span><span className="stat-label">確認・待機中</span></div>
            <div className="stat"><span className="stat-val c-green">{cnt('納品')}</span><span className="stat-label">納品済</span></div>
            <div className="stat"><span className="stat-val c-red">{cnt('失注')}</span><span className="stat-label">失注</span></div>
            {nearCount > 0 && <div className="stat"><span className="stat-val c-red">{nearCount}</span><span className="stat-label">期日間近</span></div>}
          </div>

          {/* TOOLBAR */}
          <div className="toolbar">
            <div className="search-wrap">
              <span className="search-icon">🔍</span>
              <input className="search-input" type="text" placeholder="スペース区切りでAND検索（案件名・CH・担当者）" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <MultiSelect label="ステータス" options={STATUS_LIST} value={filterStatus} onChange={setFilterStatus} />
            <MultiSelect label="フロント" options={fronts} value={filterFront} onChange={setFilterFront} />
            <MultiSelect label="Dir" options={dirs} value={filterDir} onChange={setFilterDir} />
            <MultiSelect label="Design" options={designers} value={filterDesigner} onChange={setFilterDesigner} />
            <MultiSelect label="Eng" options={engineers} value={filterEngineer} onChange={setFilterEngineer} />
            <div className="toolbar-right">
              <span className="count-label">{sorted.length} 件 / 全 {lps.length} 件</span>
            </div>
          </div>

          {/* TABLE */}
          <div className="table-area">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th onClick={() => toggleSort('channel')} className={sortKey === 'channel' ? 'sorted' : ''}>CH {sortIcon('channel')}</th>
                    <th onClick={() => toggleSort('name')} className={sortKey === 'name' ? 'sorted' : ''} style={{ minWidth: 160 }}>案件名 {sortIcon('name')}</th>
                    <th onClick={() => toggleSort('status')} className={sortKey === 'status' ? 'sorted' : ''}>ステータス {sortIcon('status')}</th>
                    <th onClick={() => toggleSort('front')} className={sortKey === 'front' ? 'sorted' : ''}>フロント {sortIcon('front')}</th>
                    <th onClick={() => toggleSort('director')} className={sortKey === 'director' ? 'sorted' : ''}>Dir {sortIcon('director')}</th>
                    <th onClick={() => toggleSort('designer')} className={sortKey === 'designer' ? 'sorted' : ''}>Design {sortIcon('designer')}</th>
                    <th onClick={() => toggleSort('engineer')} className={sortKey === 'engineer' ? 'sorted' : ''}>Eng {sortIcon('engineer')}</th>
                    <th onClick={() => toggleSort('deadline')} className={sortKey === 'deadline' ? 'sorted' : ''}>納期 {sortIcon('deadline')}</th>
                    <th onClick={() => toggleSort('delivery_date')} className={sortKey === 'delivery_date' ? 'sorted' : ''}>配信日 {sortIcon('delivery_date')}</th>
                    <th onClick={() => toggleSort('target_hours')} className={sortKey === 'target_hours' ? 'sorted' : ''} style={{ textAlign: 'right' }}>目標工数 {sortIcon('target_hours')}</th>
                    <th onClick={() => toggleSort('total_hours')} className={sortKey === 'total_hours' ? 'sorted' : ''} style={{ textAlign: 'right' }}>工数合計 {sortIcon('total_hours')}</th>
                    <th>広告共有</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.length === 0 ? (
                    <tr><td colSpan={13}><div className="empty"><div className="empty-icon">📋</div><p>該当する案件がありません</p></div></td></tr>
                  ) : sorted.map(l => {
                    const { text: dlText, cls: dlCls } = deadlineInfo(l.deadline)
                    const th = totalHours(l)
                    const thOver = l.target_hours != null && th > l.target_hours
                    const checks = `${l.ad_url ? '✅' : '☐'}URL ${l.ad_gtm ? '✅' : '☐'}GTM ${l.ad_mat ? '✅' : '☐'}素材`
                    const isActive = detailLP?.id === l.id
                    return (
                      <tr key={l.id}
                        onClick={() => setDetailLP(isActive ? null : l)}
                        style={{ cursor: 'pointer', background: isActive ? '#f0f4ff' : undefined }}
                      >
                        <td className="td-ch">{l.channel || '—'}</td>
                        <td className="td-name">
                          {l.name}
                          {(l.backlog_issue_key || l.slack_channel) && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-sub)' }}>
                              {l.backlog_issue_key && '🔗'}
                              {l.slack_channel && ' 💬'}
                            </span>
                          )}
                        </td>
                        <td><span className={`badge badge-${l.status}`}><span className="bd" />{l.status}</span></td>
                        <td className="td-person">{l.front || '—'}</td>
                        <td className="td-person">{l.director || '—'}</td>
                        <td className="td-person">{l.designer || '—'}</td>
                        <td className="td-person">{l.engineer || '—'}</td>
                        <td className={dlCls}>{dlText}</td>
                        <td className="dl-ok">{fmtDate(l.delivery_date)}</td>
                        <td className="td-num">{l.target_hours ?? '—'}</td>
                        <td className={`td-num${thOver ? ' over' : ''}`}>{th || '—'}</td>
                        <td className="td-checks">{checks}</td>
                        <td>
                          <div className="row-actions" onClick={e => e.stopPropagation()}>
                            {l.backlog_issue_key && (
                              <button className="btn-icon" onClick={() => syncBacklog(l)} title={`Backlog同期 (${l.backlog_issue_key})`} disabled={saving}>🔗</button>
                            )}
                            {l.slack_channel && (
                              <button className="btn-icon" onClick={() => fetchSlackSummary(l)} title={`Slack要約 (#${l.slack_channel})`}>💬</button>
                            )}
                            <button className="btn-icon" onClick={() => openEdit(l)} title="編集">✏️</button>
                            <button className="btn-icon del" onClick={() => askDelete(l.id)} title="削除">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'dashboard' && (
        <div className="dashboard">
          <div className="dash-grid">
            {/* KPI */}
            <div className="dash-card">
              <h3>KPI サマリー</h3>
              <div className="kpi-grid">
                <div className="kpi-item"><div className="kpi-val">{lps.length}</div><div className="kpi-label">総案件数</div></div>
                <div className="kpi-item"><div className="kpi-val">{activeCount}</div><div className="kpi-label">進行中案件</div></div>
                <div className="kpi-item"><div className="kpi-val">{totalTH}h</div><div className="kpi-label">目標工数合計</div></div>
                <div className="kpi-item"><div className="kpi-val" style={{ color: overCount > 0 ? 'var(--red)' : 'var(--green)' }}>{overCount}</div><div className="kpi-label">工数超過案件</div></div>
              </div>
            </div>
            {/* Status */}
            <div className="dash-card">
              <h3>ステータス別 案件数</h3>
              {byCnt.map(x => (
                <div className="bar-row" key={x.s}>
                  <span className="bar-label">{x.s}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${x.n / maxN * 100}%` }} /></div>
                  <span className="bar-val">{x.n}件</span>
                </div>
              ))}
            </div>
            {/* Front */}
            <div className="dash-card">
              <h3>フロント別 担当案件数</h3>
              {byFront.map(x => (
                <div className="bar-row" key={x.f}>
                  <span className="bar-label">{x.f}</span>
                  <div className="bar-track"><div className="bar-fill" style={{ width: `${x.n / maxF * 100}%`, background: '#34a853' }} /></div>
                  <span className="bar-val">{x.n}件</span>
                </div>
              ))}
            </div>
            {/* 工数消化率 */}
            <div className="dash-card">
              <h3>案件別 工数消化率</h3>
              {lps.filter(l => l.target_hours).sort((a, b) => (totalHours(b) / (b.target_hours || 1)) - (totalHours(a) / (a.target_hours || 1))).slice(0, 10).map(l => {
                const rate = Math.round(totalHours(l) / (l.target_hours || 1) * 100)
                const color = rate >= 100 ? 'var(--red)' : rate >= 80 ? 'var(--orange)' : 'var(--blue)'
                return (
                  <div className="bar-row" key={l.id}>
                    <span className="bar-label" title={l.name}>{l.name.slice(0, 13)}{l.name.length > 13 ? '…' : ''}</span>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(rate, 100)}%`, background: color }} /></div>
                    <span className="bar-val">{rate}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT MODAL */}
      <div className={`overlay${modalOpen ? ' open' : ''}`} onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}>
        <div className="modal">
          <div className="modal-head">
            <span className="modal-title">{editId ? '案件を編集' : '案件を追加'}</span>
            <button className="modal-close" onClick={() => setModalOpen(false)}>✕</button>
          </div>
          <div className="modal-body">
            <div className="form-section full">基本情報</div>
            <div className="form-group">
              <label>チャンネルID</label>
              <input type="text" value={form.channel} onChange={e => setF('channel', e.target.value)} placeholder="s001" />
            </div>
            <div className="form-group">
              <label>案件名 *</label>
              <input type="text" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="〇〇建設_モデルハウスLP" />
            </div>
            <div className="form-group">
              <label>ステータス</label>
              <select value={form.status} onChange={e => setF('status', e.target.value as LPStatus)}>
                {STATUS_LIST.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group" />
            <div className="form-group">
              <label>納期</label>
              <input type="date" value={form.deadline || ''} onChange={e => setF('deadline', e.target.value || null)} />
            </div>
            <div className="form-group">
              <label>配信日</label>
              <input type="date" value={form.delivery_date || ''} onChange={e => setF('delivery_date', e.target.value || null)} />
            </div>

            <div className="form-section full">担当者</div>
            <div className="form-group">
              <label>フロント</label>
              <input type="text" value={form.front} onChange={e => setF('front', e.target.value)} placeholder="担当者名" />
            </div>
            <div className="form-group">
              <label>ディレクター</label>
              <input type="text" value={form.director} onChange={e => setF('director', e.target.value)} placeholder="担当者名" />
            </div>
            <div className="form-group">
              <label>デザイン</label>
              <input type="text" value={form.designer} onChange={e => setF('designer', e.target.value)} placeholder="担当者名" />
            </div>
            <div className="form-group">
              <label>エンジニア</label>
              <input type="text" value={form.engineer} onChange={e => setF('engineer', e.target.value)} placeholder="担当者名" />
            </div>

            <div className="form-section full">工数 (h)</div>
            <div className="form-group">
              <label>目標工数</label>
              <input type="number" value={form.target_hours ?? ''} onChange={e => setF('target_hours', e.target.value ? Number(e.target.value) : null)} placeholder="90" />
            </div>
            <div className="form-group">
              <label>Dir工数</label>
              <input type="number" step="0.5" value={form.dir_hours || ''} onChange={e => setF('dir_hours', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Design工数</label>
              <input type="number" step="0.5" value={form.des_hours || ''} onChange={e => setF('des_hours', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Eng工数</label>
              <input type="number" step="0.5" value={form.eng_hours || ''} onChange={e => setF('eng_hours', Number(e.target.value))} placeholder="0" />
            </div>

            <div className="form-section full">原価 (円)</div>
            <div className="form-group">
              <label>Dir原価</label>
              <input type="number" value={form.dir_cost || ''} onChange={e => setF('dir_cost', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Design原価</label>
              <input type="number" value={form.des_cost || ''} onChange={e => setF('des_cost', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>Eng原価</label>
              <input type="number" value={form.eng_cost || ''} onChange={e => setF('eng_cost', Number(e.target.value))} placeholder="0" />
            </div>
            <div className="form-group">
              <label>社内原価</label>
              <input type="number" value={form.int_cost || ''} onChange={e => setF('int_cost', Number(e.target.value))} placeholder="0" />
            </div>

            <div className="form-section full">広告共有</div>
            <div className="form-group full">
              <div className="checks-group">
                <label className="check-row"><input type="checkbox" checked={form.ad_url} onChange={e => setF('ad_url', e.target.checked)} /><span>URL共有済</span></label>
                <label className="check-row"><input type="checkbox" checked={form.ad_gtm} onChange={e => setF('ad_gtm', e.target.checked)} /><span>GTM共有済</span></label>
                <label className="check-row"><input type="checkbox" checked={form.ad_mat} onChange={e => setF('ad_mat', e.target.checked)} /><span>素材共有済</span></label>
              </div>
            </div>

            <div className="form-section full">外部サービス連携</div>
            <div className="form-group">
              <label>🔗 Backlog 課題キー</label>
              <input id="fBacklogKey" type="text" value={form.backlog_issue_key} onChange={e => setF('backlog_issue_key', e.target.value)} placeholder="LP-123" />
            </div>
            <div className="form-group">
              <label>💬 Slackチャンネル</label>
              <input id="fSlackChannel" type="text" value={form.slack_channel} onChange={e => setF('slack_channel', e.target.value)} placeholder="lp-s318 または C12345678" />
            </div>

            <div className="form-section full">メモ</div>
            <div className="form-group full">
              <textarea value={form.memo} onChange={e => setF('memo', e.target.value)} placeholder="備考・特記事項など" />
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)}>キャンセル</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      </div>

      {/* CONFIRM */}
      <div className={`overlay${confirmOpen ? ' open' : ''}`}>
        <div className="confirm-box">
          <h3>案件を削除しますか？</h3>
          <p>「{deleteName}」を削除します。<br />この操作は取り消せません。</p>
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)}>キャンセル</button>
            <button className="btn btn-danger" onClick={handleDelete}>削除する</button>
          </div>
        </div>
      </div>

      {/* SLACK AI 要約 モーダル */}
      {summaryLP && (
        <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) setSummaryLP(null) }}>
          <div className="modal">
            <div className="modal-head">
              <span className="modal-title">💬 Slack要約 — {summaryLP.name}</span>
              <button className="modal-close" onClick={() => setSummaryLP(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ minHeight: 200 }}>
              {summaryLoading && (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-sub)' }}>
                  ⏳ AIがSlackチャンネルを分析中...
                </div>
              )}
              {summaryError && (
                <div style={{ padding: 16, color: 'var(--red)', background: '#fff5f5', borderRadius: 8, margin: 8 }}>
                  ⚠️ {summaryError}
                </div>
              )}
              {summaryText && !summaryLoading && (
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, padding: '4px 8px', fontSize: 14 }}>
                  {summaryText}
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setSummaryLP(null)}>閉じる</button>
              {!summaryLoading && (
                <button className="btn btn-primary" onClick={() => fetchSlackSummary(summaryLP)}>
                  🔄 再取得
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      <div className={`toast${toastVisible ? ' show' : ''}`}>{toastMsg}</div>

      {/* DETAIL PANEL */}
      {detailLP && (
        <LPDetailPanel
          lp={detailLP}
          onClose={() => setDetailLP(null)}
          onUpdate={updated => {
            setLps(lps => lps.map(l => l.id === updated.id ? updated : l))
            setDetailLP(updated)
          }}
        />
      )}
    </div>
  )
}
