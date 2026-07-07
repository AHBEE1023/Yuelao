'use client'

import { useEffect, useState } from 'react'
import { supabase, getDeviceId } from '../lib/supabase'

const ERRORS = {
  daily_limit: '今天的次数用完啦,明天再来碰碰运气吧~',
  box_empty: '这个盒子暂时空啦,先存一张纸条等有缘人吧!',
  banned_word: '内容里有不太合适的词,改一改再试试~',
  bad_age: '年龄需要在 18 ~ 99 之间哦',
  bad_length: '有的内容太长或没填,检查一下~',
  bad_input: '信息没填对,检查一下~',
  bad_device: '设备信息异常,刷新页面再试试',
  not_drawn: '只能举报你抽到过的纸条哦',
  network: '网络开小差了,稍后再试~',
}

function errMsg(code) {
  return ERRORS[code] || ERRORS.network
}

export default function Home() {
  const [tab, setTab] = useState('draw')
  const [deviceId, setDeviceId] = useState(null)
  const [stats, setStats] = useState({ male: 0, female: 0, total_draws: 0, my_notes: [] })

  useEffect(() => {
    setDeviceId(getDeviceId())
  }, [])

  async function refreshStats(id = deviceId) {
    const { data, error } = await supabase.rpc('yuelao_stats', { p_device_id: id })
    if (!error && data) setStats(data)
  }

  useEffect(() => {
    if (deviceId) refreshStats(deviceId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId])

  return (
    <main className="wrap">
      <header className="hero">
        <span className="knot">🪢</span>
        <h1>月老盲盒</h1>
        <p>存一张纸条 · 抽一段缘分</p>
      </header>

      <nav className="tabs">
        <button className={tab === 'draw' ? 'active' : ''} onClick={() => setTab('draw')}>
          抽纸条
        </button>
        <button className={tab === 'put' ? 'active' : ''} onClick={() => setTab('put')}>
          存纸条
        </button>
        <button className={tab === 'mine' ? 'active' : ''} onClick={() => { setTab('mine'); refreshStats() }}>
          我的纸条
        </button>
      </nav>

      {tab === 'draw' && (
        <DrawTab deviceId={deviceId} stats={stats} onDone={refreshStats} />
      )}
      {tab === 'put' && (
        <PutTab deviceId={deviceId} onDone={refreshStats} goDraw={() => setTab('draw')} />
      )}
      {tab === 'mine' && <MineTab notes={stats.my_notes} />}

      <footer className="disclaimer">
        月老只负责牵线,不核实身份。
        <br />
        请勿轻信转账、投资、刷单等要求,谨防诈骗。
        <br />
        累计 {stats.total_draws} 次缘分被抽走
      </footer>
    </main>
  )
}

function DrawTab({ deviceId, stats, onDone }) {
  const [shaking, setShaking] = useState(null) // 'male' | 'female'
  const [note, setNote] = useState(null)
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)
  const [reported, setReported] = useState(false)

  async function draw(gender) {
    if (!deviceId || shaking) return
    setToast('')
    setShaking(gender)
    const started = Date.now()
    const { data, error } = await supabase.rpc('yuelao_draw_note', {
      p_device_id: deviceId,
      p_gender: gender,
    })
    // 让盒子至少摇 0.8 秒,有开盲盒的仪式感
    const wait = Math.max(0, 800 - (Date.now() - started))
    setTimeout(() => {
      setShaking(null)
      if (error || !data) {
        setToast(errMsg('network'))
      } else if (!data.ok) {
        setToast(errMsg(data.error))
      } else {
        setCopied(false)
        setReported(false)
        setNote(data.note)
        onDone()
      }
    }, wait)
  }

  async function copyContact() {
    try {
      await navigator.clipboard.writeText(note.contact)
      setCopied(true)
    } catch {
      // 部分浏览器限制剪贴板,用户可手动长按复制
    }
  }

  async function report() {
    if (reported) return
    const { data } = await supabase.rpc('yuelao_report_note', {
      p_device_id: deviceId,
      p_note_id: note.id,
      p_reason: 'user_report',
    })
    if (data?.ok) setReported(true)
  }

  return (
    <section>
      <div className="boxes">
        <button
          className={`box ${shaking === 'male' ? 'shaking' : ''}`}
          onClick={() => draw('male')}
        >
          <span className="emoji">💙</span>
          <h3>男生盒</h3>
          <div className="count">{stats.male} 张纸条在等待</div>
        </button>
        <button
          className={`box ${shaking === 'female' ? 'shaking' : ''}`}
          onClick={() => draw('female')}
        >
          <span className="emoji">❤️</span>
          <h3>女生盒</h3>
          <div className="count">{stats.female} 张纸条在等待</div>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <p className="hint">
        点一下盒子,月老为你抽一张纸条
        <br />
        每天最多抽 5 次 · 不会抽到重复的人
      </p>

      {note && (
        <div className="overlay" onClick={() => setNote(null)}>
          <div className="note-card" onClick={(e) => e.stopPropagation()}>
            <div className="top">
              <h2>{note.nickname}</h2>
              <span className="meta">
                {note.age} 岁 · {note.city}
              </span>
            </div>
            {note.hobbies && (
              <div className="field">
                <b>爱好</b>
                {note.hobbies}
              </div>
            )}
            {note.message && (
              <div className="field">
                <b>留言</b>
                {note.message}
              </div>
            )}
            <div className="contact-row">
              <span className="cid">{note.contact}</span>
              <button className="btn btn-red" onClick={copyContact}>
                {copied ? '已复制' : '复制微信'}
              </button>
            </div>
            <p className="safety">⚠️ 添加好友后注意保护隐私,涉及金钱一律是骗子。</p>
            <div className="card-actions">
              <button className="btn btn-plain" onClick={report} disabled={reported}>
                {reported ? '已举报' : '举报此纸条'}
              </button>
              <button className="btn btn-red" onClick={() => setNote(null)}>
                收下这段缘分
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

const EMPTY_FORM = {
  gender: 'male',
  seeking: 'female',
  nickname: '',
  age: '',
  city: '',
  hobbies: '',
  contact: '',
  message: '',
}

function PutTab({ deviceId, onDone, goDraw }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e) {
    e.preventDefault()
    if (busy || !deviceId) return
    setErr('')
    setBusy(true)
    const { data, error } = await supabase.rpc('yuelao_submit_note', {
      p_device_id: deviceId,
      p_gender: form.gender,
      p_seeking: form.seeking,
      p_nickname: form.nickname.trim(),
      p_age: parseInt(form.age, 10) || 0,
      p_city: form.city.trim(),
      p_hobbies: form.hobbies.trim(),
      p_contact: form.contact.trim(),
      p_message: form.message.trim(),
    })
    setBusy(false)
    if (error || !data) {
      setErr(errMsg('network'))
    } else if (!data.ok) {
      setErr(errMsg(data.error))
    } else {
      setDone(true)
      onDone()
    }
  }

  if (done) {
    return (
      <div className="form-card ok-panel">
        <span className="emoji">🧧</span>
        <h2>纸条已放进盒子!</h2>
        <p>
          月老已经把你的纸条收好啦,
          <br />
          等有缘人抽中就能联系你。
          <br />
          可以在「我的纸条」里看它被抽了几次。
        </p>
        <button
          className="btn btn-red"
          style={{ marginTop: 16 }}
          onClick={() => {
            setDone(false)
            setForm(EMPTY_FORM)
            goDraw()
          }}
        >
          我也去抽一张
        </button>
      </div>
    )
  }

  return (
    <form className="form-card" onSubmit={submit}>
      <h2>把自己放进盲盒 💌</h2>
      <p className="sub">每天最多存 3 张 · 联系方式只有抽中的人能看到</p>

      <div className="row2">
        <div className="fgroup">
          <label>我是</label>
          <div className="seg">
            <button type="button" className={form.gender === 'male' ? 'on' : ''} onClick={() => set('gender', 'male')}>
              男生
            </button>
            <button type="button" className={form.gender === 'female' ? 'on' : ''} onClick={() => set('gender', 'female')}>
              女生
            </button>
          </div>
        </div>
        <div className="fgroup">
          <label>想认识</label>
          <div className="seg">
            <button type="button" className={form.seeking === 'male' ? 'on' : ''} onClick={() => set('seeking', 'male')}>
              男生
            </button>
            <button type="button" className={form.seeking === 'female' ? 'on' : ''} onClick={() => set('seeking', 'female')}>
              女生
            </button>
          </div>
        </div>
      </div>

      <div className="row2">
        <div className="fgroup">
          <label>昵称</label>
          <input value={form.nickname} onChange={(e) => set('nickname', e.target.value)} maxLength={20} placeholder="怎么称呼你" required />
        </div>
        <div className="fgroup">
          <label>年龄</label>
          <input value={form.age} onChange={(e) => set('age', e.target.value)} type="number" min={18} max={99} placeholder="18+" required />
        </div>
      </div>

      <div className="fgroup">
        <label>城市</label>
        <input value={form.city} onChange={(e) => set('city', e.target.value)} maxLength={20} placeholder="你在哪座城市" required />
      </div>

      <div className="fgroup">
        <label>微信号</label>
        <input value={form.contact} onChange={(e) => set('contact', e.target.value)} maxLength={50} placeholder="抽中你的人会看到" required />
      </div>

      <div className="fgroup">
        <label>爱好(选填)</label>
        <input value={form.hobbies} onChange={(e) => set('hobbies', e.target.value)} maxLength={60} placeholder="爬山、看展、打游戏…" />
      </div>

      <div className="fgroup">
        <label>想说的话(选填)</label>
        <textarea value={form.message} onChange={(e) => set('message', e.target.value)} maxLength={140} rows={3} placeholder="给抽到这张纸条的人留句话吧" />
      </div>

      <button className="btn submit-btn" disabled={busy}>
        {busy ? '放入中…' : '放进盲盒'}
      </button>
      {err && <p className="err">{err}</p>}
    </form>
  )
}

function MineTab({ notes }) {
  if (!notes || notes.length === 0) {
    return (
      <div className="empty">
        你还没有存过纸条
        <br />
        去「存纸条」把自己放进盲盒吧 💌
      </div>
    )
  }
  return (
    <section>
      {notes.map((n) => (
        <div className="mine-item" key={n.id}>
          <div>
            <div className="name">
              {n.nickname}
              <span style={{ fontWeight: 400, fontSize: 12, marginLeft: 8, color: '#9c7f6e' }}>
                {n.gender === 'male' ? '男生盒' : '女生盒'}
              </span>
            </div>
            <div className="sub">
              {new Date(n.created_at).toLocaleDateString('zh-CN')} 放入
              {n.status === 'hidden' ? ' · 已因举报下架' : ''}
            </div>
          </div>
          <div className="badge">被抽走 {n.draw_count} 次</div>
        </div>
      ))}
    </section>
  )
}
