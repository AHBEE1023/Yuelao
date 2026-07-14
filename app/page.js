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
  not_owner: '只能撤回自己的纸条哦',
  city_empty: '这座城市暂时还没有纸条,换个城市,或先存一张吧~',
  no_order: '订单已失效,请重新发起~',
  order_void: '这笔订单已失效,请重新发起~',
  order_expired: '订单已超时,请重新发起~',
  too_many_pending: '有未完成的订单,稍等片刻再试~',
  mock_disabled: '支付方式已切换,请刷新页面~',
  network: '网络开小差了,稍后再试~',
}

// 已抽中但还没确认收下的纸条,存在本地,防止动画期间刷新/切走导致付费结果丢失
const PENDING_REVEAL_KEY = 'yuelao_pending_reveal'

function errMsg(code) {
  return ERRORS[code] || ERRORS.network
}

// 分 -> 元,去掉多余的 .00
function yuan(fen) {
  if (!fen) return '0'
  return (fen / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

const EMPTY_PRICING = {
  mode: 'mock',
  put_fen: 0,
  draw_fen: 0,
  free_puts_per_day: 0,
  free_draws_per_day: 0,
}

const EMPTY_STATS = {
  male: 0,
  female: 0,
  total_draws: 0,
  draws_left: 5,
  puts_left: 3,
  male_cities: [],
  female_cities: [],
  my_notes: [],
}

export default function Home() {
  const [tab, setTab] = useState('draw')
  const [deviceId, setDeviceId] = useState(null)
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loaded, setLoaded] = useState(false)
  const [pricing, setPricing] = useState(EMPTY_PRICING)

  useEffect(() => {
    setDeviceId(getDeviceId())
    // 载入计费配置,失败重试一次;拿不到就退回默认(收银台仍会显示订单真实金额)
    async function loadPricing(retry = true) {
      const { data, error } = await supabase.rpc('yuelao_pay_config_public')
      if (!error && data) setPricing({ ...EMPTY_PRICING, ...data })
      else if (retry) setTimeout(() => loadPricing(false), 1200)
    }
    loadPricing()
  }, [])

  async function refreshStats(id = deviceId) {
    const { data, error } = await supabase.rpc('yuelao_stats', { p_device_id: id })
    if (!error && data) setStats({ ...EMPTY_STATS, ...data })
    setLoaded(true)
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
        <DrawTab deviceId={deviceId} stats={stats} loaded={loaded} pricing={pricing} onDone={refreshStats} />
      )}
      {tab === 'put' && (
        <PutTab deviceId={deviceId} stats={stats} pricing={pricing} onDone={refreshStats} goDraw={() => setTab('draw')} />
      )}
      {tab === 'mine' && (
        <MineTab notes={stats.my_notes} deviceId={deviceId} loaded={loaded} onDone={refreshStats} />
      )}

      <ShareButton />

      <footer className="disclaimer">
        月老只负责牵线,不核实身份。
        <br />
        请勿轻信转账、投资、刷单等要求,谨防诈骗。
        <br />
        已牵起 <span className="tally">{stats.total_draws}</span> 段缘分
      </footer>
    </main>
  )
}

function ShareButton() {
  const [hint, setHint] = useState('')

  async function share() {
    const url = typeof window !== 'undefined' ? window.location.origin : ''
    const data = {
      title: '月老盲盒',
      text: '存一张纸条,抽一段缘分 🪢 快来月老盲盒碰碰运气~',
      url,
    }
    // 优先用系统分享面板(手机端可直接分享到微信等)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(data)
        return
      } catch {
        // 用户取消分享,静默处理
        return
      }
    }
    // 降级:复制链接
    try {
      await navigator.clipboard.writeText(url)
      setHint('链接已复制,发给朋友吧!')
      setTimeout(() => setHint(''), 2500)
    } catch {
      setHint(url)
    }
  }

  return (
    <div className="share-wrap">
      <button className="share-btn" onClick={share}>
        🧧 把盲盒分享给朋友
      </button>
      {hint && <div className="share-hint">{hint}</div>}
    </div>
  )
}

// 收银台:mock 模式下展示模拟支付;真支付接入后此处改为展示网关二维码
function Cashier({ deviceId, order, onPaid, onClose }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const title = order.kind === 'draw' ? '抽一张纸条' : '把纸条放进盲盒'

  async function pay() {
    if (busy) return
    setBusy(true)
    setErr('')
    const { data, error } = await supabase.rpc('yuelao_pay_order', {
      p_device_id: deviceId,
      p_order_no: order.order_no,
    })
    setBusy(false)
    if (error || !data) {
      setErr(errMsg('network'))
      return
    }
    onPaid(data)
  }

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="cashier" onClick={(e) => e.stopPropagation()}>
        <div className="cashier-title">{title}</div>
        <div className="cashier-amt">
          <span className="cashier-cur">¥</span>
          {yuan(order.amount_fen)}
        </div>
        <div className="cashier-qr" aria-hidden="true">
          <span>模拟收银台</span>
        </div>
        <p className="cashier-note">当前为测试收银台(模拟支付),不会真实扣款。</p>
        <button className="btn submit-btn cashier-pay" onClick={pay} disabled={busy}>
          {busy ? '支付中…' : `模拟支付 ¥${yuan(order.amount_fen)}`}
        </button>
        {err && <p className="err">{err}</p>}
        <button className="btn btn-plain cashier-cancel" onClick={onClose} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  )
}

function DrawTab({ deviceId, stats, loaded, pricing, onDone }) {
  const [shaking, setShaking] = useState(null) // 'male' | 'female' — 摇盒
  const [opening, setOpening] = useState(null) // 'male' | 'female' — 开盖那一拍
  const [note, setNote] = useState(null)
  const [toast, setToast] = useState('')
  const [copied, setCopied] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [city, setCity] = useState('')
  const [cashier, setCashier] = useState(null) // 待支付的抽取订单
  const [pending, setPending] = useState(false) // 正在创建订单

  const outOfDraws = loaded && stats.draws_left <= 0
  const drawFen = pricing.draw_fen

  // 恢复:若上次抽中的纸条因刷新/切走未及展示,重新弹出(付费结果不丢)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PENDING_REVEAL_KEY)
      if (saved) setNote(JSON.parse(saved))
    } catch {
      // 解析失败忽略
    }
  }, [])

  function dismissNote() {
    try {
      localStorage.removeItem(PENDING_REVEAL_KEY)
    } catch {}
    setNote(null)
  }

  // 两个盒子里出现过的城市并集,供筛选下拉;保持出现顺序(按数量已在后端排序)
  const cities = []
  for (const c of [...(stats.male_cities || []), ...(stats.female_cities || [])]) {
    if (c && !cities.includes(c)) cities.push(c)
  }
  // 选中的城市若因数据变化已不存在,回退到"全部"
  const activeCity = cities.includes(city) ? city : ''

  // 摇盒 → 开盖 → 揭晓纸条的仪式动画
  function revealCeremony(gender, drawnNote) {
    // 立即落盘:动画期间即使刷新/切走,付费抽中的纸条也不会丢
    try {
      localStorage.setItem(PENDING_REVEAL_KEY, JSON.stringify(drawnNote))
    } catch {}
    setShaking(gender)
    setTimeout(() => {
      setShaking(null)
      setCopied(false)
      setReporting(false)
      setReported(false)
      setOpening(gender)
      setTimeout(() => {
        setOpening(null)
        setNote(drawnNote)
        onDone()
      }, 240)
    }, 800)
  }

  async function draw(gender) {
    if (!deviceId || shaking || opening || pending || cashier) return
    if (outOfDraws) {
      setToast(errMsg('daily_limit'))
      return
    }
    setToast('')
    setPending(true)
    const { data, error } = await supabase.rpc('yuelao_create_order', {
      p_device_id: deviceId,
      p_kind: 'draw',
      p_gender: gender,
      p_city: activeCity || null,
    })
    setPending(false)
    if (error || !data) {
      setToast(errMsg('network'))
    } else if (!data.ok) {
      setToast(errMsg(data.error))
    } else if (data.done) {
      // 免费额度:直接揭晓
      revealCeremony(gender, data.note)
    } else {
      // 需要付费:打开收银台,支付成功后再揭晓
      setCashier({ ...data, gender })
    }
  }

  function onDrawPaid(data) {
    const gender = cashier?.gender
    setCashier(null)
    if (!data.ok) {
      setToast(errMsg(data.error))
      onDone()
      return
    }
    revealCeremony(gender, data.note)
  }

  async function copyContact() {
    try {
      await navigator.clipboard.writeText(note.contact)
      setCopied(true)
    } catch {
      // 部分浏览器限制剪贴板,用户可手动长按复制
    }
  }

  async function report(reason) {
    const { data } = await supabase.rpc('yuelao_report_note', {
      p_device_id: deviceId,
      p_note_id: note.id,
      p_reason: reason,
    })
    if (data?.ok) {
      setReported(true)
      setReporting(false)
    }
  }

  return (
    <section>
      {cities.length > 0 && (
        <div className="city-filter">
          <span>抽取范围</span>
          <select value={activeCity} onChange={(e) => setCity(e.target.value)}>
            <option value="">全部城市</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="boxes">
        <button
          className={`box ${shaking === 'male' ? 'shaking' : ''} ${opening === 'male' ? 'opening' : ''}`}
          onClick={() => draw('male')}
          disabled={outOfDraws}
        >
          <span className="box-lid" aria-hidden="true" />
          <span className="box-ribbon" aria-hidden="true" />
          <span className="box-knot" aria-hidden="true" />
          <span className="box-inner">
            <span className="emoji">💙</span>
            <h3>男生盒</h3>
            <div className="count">
              {loaded ? `${stats.male} 张纸条在等待` : <span className="skeleton count-skel" aria-label="清点中" />}
            </div>
          </span>
        </button>
        <button
          className={`box ${shaking === 'female' ? 'shaking' : ''} ${opening === 'female' ? 'opening' : ''}`}
          onClick={() => draw('female')}
          disabled={outOfDraws}
        >
          <span className="box-lid" aria-hidden="true" />
          <span className="box-ribbon" aria-hidden="true" />
          <span className="box-knot" aria-hidden="true" />
          <span className="box-inner">
            <span className="emoji">❤️</span>
            <h3>女生盒</h3>
            <div className="count">
              {loaded ? `${stats.female} 张纸条在等待` : <span className="skeleton count-skel" aria-label="清点中" />}
            </div>
          </span>
        </button>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <p className="hint">
        {outOfDraws ? (
          <>今天的缘分抽完啦,明天再来~</>
        ) : (
          <>
            点一下盒子,月老为你抽一张
            {activeCity ? <b> {activeCity} </b> : '的'}纸条
            <br />
            {drawFen > 0 && <>每抽一张 <b>¥{yuan(drawFen)}</b> · </>}
            今日还可抽 <b>{loaded ? stats.draws_left : 5}</b> 次 · 不会抽到重复的人
          </>
        )}
      </p>

      {cashier && (
        <Cashier
          deviceId={deviceId}
          order={cashier}
          onPaid={onDrawPaid}
          onClose={() => setCashier(null)}
        />
      )}

      {note && (
        <div className="overlay" onClick={dismissNote}>
          <div className="confetti" aria-hidden="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <i
                key={i}
                className="confetti-bit"
                style={{
                  left: `${(i * 8.3 + 5) % 100}%`,
                  '--dur': `${1.05 + (i % 4) * 0.18}s`,
                  '--delay': `${(i % 6) * 0.05}s`,
                  '--rot': `${(i % 2 ? 1 : -1) * (140 + i * 20)}deg`,
                  '--drift': `${(i % 2 ? 1 : -1) * (12 + (i % 3) * 9)}px`,
                }}
              />
            ))}
          </div>
          <div className="note-card" onClick={(e) => e.stopPropagation()}>
            <span className="note-seal" aria-hidden="true">囍</span>
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
              <button className={`btn btn-red${copied ? ' copied' : ''}`} onClick={copyContact}>
                {copied ? '✓ 已复制' : '复制微信'}
              </button>
            </div>
            <p className="safety">⚠️ 添加好友后注意保护隐私,涉及金钱一律是骗子。</p>

            {reporting ? (
              <div className="report-box">
                <span className="report-title">这张纸条哪里不对?</span>
                <div className="report-reasons">
                  {['广告推广', '虚假信息', '骚扰不适', '其他'].map((r) => (
                    <button key={r} className="btn btn-plain reason" onClick={() => report(r)}>
                      {r}
                    </button>
                  ))}
                </div>
                <button className="btn btn-plain" onClick={() => setReporting(false)}>
                  取消
                </button>
              </div>
            ) : (
              <div className="card-actions">
                <button
                  className="btn btn-plain"
                  onClick={() => setReporting(true)}
                  disabled={reported}
                >
                  {reported ? '已举报,谢谢' : '举报此纸条'}
                </button>
                <button className="btn btn-red" onClick={dismissNote}>
                  收下这段缘分
                </button>
              </div>
            )}
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

function PutTab({ deviceId, stats, pricing, onDone, goDraw }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [cashier, setCashier] = useState(null) // 待支付的存入订单

  const putFen = pricing.put_fen

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e) {
    e.preventDefault()
    if (busy || !deviceId || cashier) return
    setErr('')
    setBusy(true)
    const { data, error } = await supabase.rpc('yuelao_create_order', {
      p_device_id: deviceId,
      p_kind: 'put',
      p_payload: {
        gender: form.gender,
        seeking: form.seeking,
        nickname: form.nickname.trim(),
        age: parseInt(form.age, 10) || 0,
        city: form.city.trim(),
        hobbies: form.hobbies.trim(),
        contact: form.contact.trim(),
        message: form.message.trim(),
      },
    })
    setBusy(false)
    if (error || !data) {
      setErr(errMsg('network'))
    } else if (!data.ok) {
      setErr(errMsg(data.error))
    } else if (data.done) {
      // 免费额度:直接成功
      setDone(true)
      onDone()
    } else {
      // 需要付费:打开收银台
      setCashier(data)
    }
  }

  function onPutPaid(data) {
    setCashier(null)
    if (!data.ok) {
      setErr(errMsg(data.error))
      return
    }
    setDone(true)
    onDone()
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
      <p className="sub">
        {putFen > 0 && <>存一张 ¥{yuan(putFen)} · </>}
        今日还可存 {stats.puts_left} 张 · 联系方式只有抽中的人能看到
      </p>

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
        {busy ? '处理中…' : putFen > 0 ? `放进盲盒 · ¥${yuan(putFen)}` : '放进盲盒'}
      </button>
      {err && <p className="err">{err}</p>}

      {cashier && (
        <Cashier
          deviceId={deviceId}
          order={cashier}
          onPaid={onPutPaid}
          onClose={() => setCashier(null)}
        />
      )}
    </form>
  )
}

function MineTab({ notes, deviceId, loaded, onDone }) {
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)

  async function withdraw(id) {
    setBusyId(id)
    const { data } = await supabase.rpc('yuelao_withdraw_note', {
      p_device_id: deviceId,
      p_note_id: id,
    })
    setBusyId(null)
    setConfirmId(null)
    if (data?.ok) onDone()
  }

  if (!loaded) {
    return (
      <div className="empty loading" aria-busy="true">
        <div className="empty-row skeleton" />
        <div className="empty-row skeleton" />
        <div className="empty-row skeleton" />
      </div>
    )
  }
  if (!notes || notes.length === 0) {
    return (
      <div className="empty">
        <span className="empty-art">💌</span>
        <div className="empty-title">你还没有存过纸条</div>
        <div className="empty-sub">去「存纸条」把自己放进盲盒吧</div>
      </div>
    )
  }
  return (
    <section>
      {notes.map((n) => (
        <div className="mine-item" key={n.id}>
          <div className="mine-main">
            <div className="name">
              {n.nickname}
              <span className="tag">{n.gender === 'male' ? '男生盒' : '女生盒'}</span>
            </div>
            <div className="sub">
              {new Date(n.created_at).toLocaleDateString('zh-CN')} 放入
              {n.status === 'hidden' && <span className="status-pill hidden">已下架</span>}
            </div>
          </div>
          <div className="mine-right">
            <div className="badge">被抽走 {n.draw_count} 次</div>
            {n.status === 'active' &&
              (confirmId === n.id ? (
                <div className="confirm-row">
                  <button
                    className="btn-tiny danger"
                    onClick={() => withdraw(n.id)}
                    disabled={busyId === n.id}
                  >
                    {busyId === n.id ? '撤回中' : '确认撤回'}
                  </button>
                  <button className="btn-tiny" onClick={() => setConfirmId(null)}>
                    取消
                  </button>
                </div>
              ) : (
                <button className="btn-tiny" onClick={() => setConfirmId(n.id)}>
                  撤回
                </button>
              ))}
          </div>
        </div>
      ))}
      <p className="mine-note">撤回后纸条不再出现在盒子里,当日存放次数不会返还。</p>
    </section>
  )
}
