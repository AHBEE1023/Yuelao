'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import './admin.css'

const FILTERS = [
  { key: 'reported', label: '待处理举报' },
  { key: 'hidden', label: '已下架' },
  { key: 'active', label: '在架' },
  { key: 'all', label: '全部' },
]

const GENDER = { male: '男', female: '女' }

export default function AdminPage() {
  const [pw, setPw] = useState(null) // 已登录的密码
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('yuelao_admin_pw') : null
    if (saved) setPw(saved)
    setReady(true)
    // 后台用浅色背景,覆盖前台喜庆红底
    document.body.classList.add('admin-mode')
    return () => document.body.classList.remove('admin-mode')
  }, [])

  function onLogin(p) {
    localStorage.setItem('yuelao_admin_pw', p)
    setPw(p)
  }
  function logout() {
    localStorage.removeItem('yuelao_admin_pw')
    setPw(null)
  }

  if (!ready) return null
  if (!pw) return <Login onLogin={onLogin} />
  return <Dashboard pw={pw} logout={logout} onInvalid={logout} />
}

function Login({ onLogin }) {
  const [val, setVal] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.rpc('yuelao_admin_login', { p_password: val })
    setBusy(false)
    if (error) return setErr('网络错误,稍后再试')
    if (data?.ok) onLogin(val)
    else setErr('密码不正确')
  }

  return (
    <main className="admin-wrap">
      <form className="admin-card login" onSubmit={submit}>
        <h1>🪢 月老盲盒 · 后台</h1>
        <p className="sub">请输入管理密码</p>
        <input
          type="password"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="管理密码"
          autoFocus
        />
        <button className="admin-btn primary" disabled={busy}>
          {busy ? '验证中…' : '登录'}
        </button>
        {err && <p className="admin-err">{err}</p>}
      </form>
    </main>
  )
}

function Dashboard({ pw, logout, onInvalid }) {
  const [overview, setOverview] = useState(null)
  const [filter, setFilter] = useState('reported')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [showPw, setShowPw] = useState(false)

  async function loadOverview() {
    const { data } = await supabase.rpc('yuelao_admin_overview', { p_password: pw })
    if (data && !data.ok && data.error === 'bad_password') return onInvalid()
    if (data?.ok) setOverview(data)
  }

  async function loadList(f = filter) {
    setLoading(true)
    const { data } = await supabase.rpc('yuelao_admin_list', { p_password: pw, p_filter: f })
    if (data && !data.ok && data.error === 'bad_password') return onInvalid()
    setItems(data?.items || [])
    setLoading(false)
  }

  useEffect(() => {
    loadOverview()
    loadList('reported')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pick(f) {
    setFilter(f)
    loadList(f)
  }

  async function setStatus(id, status) {
    setBusyId(id)
    const { data } = await supabase.rpc('yuelao_admin_set_status', {
      p_password: pw,
      p_note_id: id,
      p_status: status,
    })
    setBusyId(null)
    if (data?.ok) {
      await Promise.all([loadList(), loadOverview()])
    }
  }

  const yuan = (fen) => '¥' + ((fen || 0) / 100).toFixed(2).replace(/\.00$/, '')
  const cards = overview
    ? [
        { label: '待处理举报', value: overview.reported_pending, hot: overview.reported_pending > 0 },
        { label: '在架纸条', value: overview.active },
        { label: '已下架', value: overview.hidden },
        { label: '今日新增', value: overview.notes_today },
        { label: '今日抽取', value: overview.draws_today },
        { label: '累计牵线', value: overview.total_draws },
        { label: '今日收入', value: yuan(overview.revenue_today_fen) },
        { label: '累计收入', value: yuan(overview.revenue_fen) },
      ]
    : []

  return (
    <main className="admin-wrap">
      <div className="admin-top">
        <h1>🪢 月老盲盒 · 后台</h1>
        <div className="admin-top-actions">
          <button className="admin-btn ghost" onClick={() => setShowPw(true)}>
            改密码
          </button>
          <button className="admin-btn ghost" onClick={logout}>
            退出
          </button>
        </div>
      </div>

      <div className="admin-cards">
        {cards.map((c) => (
          <div className={`admin-stat ${c.hot ? 'hot' : ''}`} key={c.label}>
            <div className="v">{c.value}</div>
            <div className="l">{c.label}</div>
          </div>
        ))}
      </div>

      {overview?.pricing && (
        <PricingCard pw={pw} pricing={overview.pricing} onSaved={loadOverview} onInvalid={onInvalid} />
      )}

      <div className="admin-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? 'on' : ''}
            onClick={() => pick(f.key)}
          >
            {f.label}
          </button>
        ))}
        <button className="admin-refresh" onClick={() => { loadList(); loadOverview() }}>
          ↻ 刷新
        </button>
      </div>

      {loading ? (
        <p className="admin-empty">加载中…</p>
      ) : items.length === 0 ? (
        <p className="admin-empty">
          {filter === 'reported' ? '没有待处理的举报 🎉' : '这里空空如也'}
        </p>
      ) : (
        <div className="admin-list">
          {items.map((n) => (
            <div className={`admin-note ${n.status}`} key={n.id}>
              <div className="an-head">
                <span className="an-name">{n.nickname}</span>
                <span className="an-meta">
                  {GENDER[n.gender]} · {n.age} · {n.city}
                </span>
                {n.report_count > 0 && <span className="an-flag">举报 {n.report_count}</span>}
                {n.status === 'hidden' && <span className="an-hidden">已下架</span>}
              </div>
              {n.reasons && n.reasons.length > 0 && (
                <div className="an-reasons">
                  {n.reasons.map((r, i) => (
                    <span className="an-reason" key={i}>
                      {r || '未注明'}
                    </span>
                  ))}
                </div>
              )}
              {n.hobbies && <div className="an-line">爱好:{n.hobbies}</div>}
              {n.message && <div className="an-line">留言:{n.message}</div>}
              <div className="an-line contact">微信:{n.contact} · 被抽 {n.draw_count} 次</div>
              <div className="an-actions">
                {n.status === 'active' ? (
                  <button
                    className="admin-btn danger sm"
                    onClick={() => setStatus(n.id, 'hidden')}
                    disabled={busyId === n.id}
                  >
                    {busyId === n.id ? '处理中' : '下架'}
                  </button>
                ) : (
                  <button
                    className="admin-btn primary sm"
                    onClick={() => setStatus(n.id, 'active')}
                    disabled={busyId === n.id}
                  >
                    {busyId === n.id ? '处理中' : '恢复上架'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showPw && <ChangePw pw={pw} onClose={() => setShowPw(false)} onChanged={onInvalid} />}
    </main>
  )
}

function PricingCard({ pw, pricing, onSaved, onInvalid }) {
  const [putYuan, setPutYuan] = useState((pricing.put_fen / 100).toString())
  const [drawYuan, setDrawYuan] = useState((pricing.draw_fen / 100).toString())
  const [freePuts, setFreePuts] = useState(String(pricing.free_puts_per_day))
  const [freeDraws, setFreeDraws] = useState(String(pricing.free_draws_per_day))
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // 元 -> 分,非法输入(NaN)判为无效,避免把价格写成 0/NULL
  function fen(v) {
    const n = Math.round(parseFloat(v) * 100)
    return Number.isFinite(n) ? n : NaN
  }
  function count(v) {
    const n = parseInt(v, 10)
    return Number.isFinite(n) ? n : NaN
  }

  async function save() {
    if (busy) return
    const putFen = fen(putYuan)
    const drawFen = fen(drawYuan)
    const fp = count(freePuts)
    const fd = count(freeDraws)
    if ([putFen, drawFen, fp, fd].some((n) => Number.isNaN(n) || n < 0)) {
      setMsg('请填写有效的数值')
      return
    }
    setBusy(true)
    setMsg('')
    const { data, error } = await supabase.rpc('yuelao_admin_set_pricing', {
      p_password: pw,
      p_put_fen: putFen,
      p_draw_fen: drawFen,
      p_free_puts: fp,
      p_free_draws: fd,
    })
    setBusy(false)
    if (data && !data.ok && data.error === 'bad_password') return onInvalid()
    if (data?.ok) {
      setMsg('已保存')
      onSaved()
      setTimeout(() => setMsg(''), 1800)
    } else if (error) {
      setMsg('网络错误,稍后再试')
    } else {
      setMsg('保存失败,检查数值')
    }
  }

  return (
    <div className="pricing-card">
      <div className="pricing-head">
        <span className="pricing-title">计费设置</span>
        <span className="pricing-mode">支付方式:{pricing.mode === 'mock' ? '模拟支付(测试)' : pricing.mode}</span>
      </div>
      <div className="pricing-grid">
        <label>存入价格(元)<input type="number" min="0" step="0.5" value={putYuan} onChange={(e) => setPutYuan(e.target.value)} /></label>
        <label>抽取价格(元)<input type="number" min="0" step="0.5" value={drawYuan} onChange={(e) => setDrawYuan(e.target.value)} /></label>
        <label>每日免费存<input type="number" min="0" step="1" value={freePuts} onChange={(e) => setFreePuts(e.target.value)} /></label>
        <label>每日免费抽<input type="number" min="0" step="1" value={freeDraws} onChange={(e) => setFreeDraws(e.target.value)} /></label>
      </div>
      <div className="pricing-foot">
        <span className="pricing-msg">{msg}</span>
        <button className="admin-btn primary sm" onClick={save} disabled={busy}>
          {busy ? '保存中…' : '保存计费'}
        </button>
      </div>
    </div>
  )
}

function ChangePw({ pw, onClose, onChanged }) {
  const [np, setNp] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setMsg('')
    const { data } = await supabase.rpc('yuelao_admin_set_password', {
      p_password: pw,
      p_new: np,
    })
    setBusy(false)
    if (data?.ok) {
      setMsg('已修改,请用新密码重新登录')
      setTimeout(onChanged, 1200)
    } else if (data?.error === 'weak_password') {
      setMsg('新密码至少 8 位')
    } else {
      setMsg('修改失败')
    }
  }

  return (
    <div className="admin-overlay" onClick={onClose}>
      <form className="admin-card" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>修改管理密码</h2>
        <input
          type="password"
          value={np}
          onChange={(e) => setNp(e.target.value)}
          placeholder="新密码(至少 8 位)"
          autoFocus
        />
        <div className="an-actions" style={{ marginTop: 12 }}>
          <button type="button" className="admin-btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="admin-btn primary" disabled={busy}>
            {busy ? '提交中…' : '确认修改'}
          </button>
        </div>
        {msg && <p className="admin-err">{msg}</p>}
      </form>
    </div>
  )
}
