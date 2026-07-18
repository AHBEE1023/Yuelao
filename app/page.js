'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase, getDeviceId } from '../lib/supabase'

const ERRORS = {
  daily_limit: '今天的缘分请完啦,明天再来求一支~',
  box_empty: '这个签筒空了,先写一支签等有缘人吧!',
  banned_word: '签文里有不合适的词,月老改不了,你改一改~',
  bad_age: '年龄需要在 18 ~ 99 之间哦',
  bad_length: '有的内容太长或没填,检查一下~',
  bad_input: '信息没填对,检查一下~',
  bad_device: '设备信息异常,刷新页面再试试',
  not_drawn: '只能对你请到过的签这样做哦',
  not_owner: '只能撤回自己的签哦',
  city_empty: '这座城市的签筒还空着,换个城市,或先写一支吧~',
  no_order: '这炷香火已失效,请重新发起~',
  order_void: '这炷香火已失效,请重新发起~',
  order_expired: '香火已超时,请重新发起~',
  too_many_pending: '有未完成的香火,稍等片刻再试~',
  mock_disabled: '支付方式已切换,请刷新页面~',
  network: '网络开小差了,稍后再试~',
}

// 已请中但还没确认收下的签,存在本地:动画期间刷新/切走,付费结果不丢
const PENDING_REVEAL_KEY = 'yuelao_pending_reveal'
const GATE_KEY = 'yuelao_gate_v1'
const RITUAL_KEY = 'yuelao_ritual_seen'

// 公测反馈方式:填入你的微信号/微信群号,会显示在安全中心;留空则只显示测试期说明
const BETA_CONTACT = ''

function errMsg(code) {
  return ERRORS[code] || ERRORS.network
}

function yuan(fen) {
  if (!fen) return '0'
  return (fen / 100).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')
}

// ---- 签诗库:揭签与每日缘分签共用;分享只带签诗,不带任何个人信息 ----
const POEMS = [
  { n: '第一签', a: '众里寻他千百度', b: '蓦然回首,那人正在灯火阑珊处' },
  { n: '第七签', a: '有缘千里来相会', b: '风吹过的路口,都值得回头看看' },
  { n: '第十二签', a: '月上柳梢头', b: '人约黄昏后,别迟到' },
  { n: '第十七签', a: '金风玉露一相逢', b: '便胜却人间无数' },
  { n: '第二十一签', a: '山有木兮木有枝', b: '心悦君兮,别不告诉他' },
  { n: '第二十六签', a: '愿得一心人', b: '白首不相离' },
  { n: '第三十三签', a: '身无彩凤双飞翼', b: '心有灵犀一点通' },
  { n: '第三十八签', a: '陌上花开', b: '可缓缓归矣' },
  { n: '第四十一签', a: '一眼之缘,再看是心动', b: '三看,就该开口了' },
  { n: '第四十六签', a: '春风十里', b: '不如今天主动的你' },
  { n: '第五十二签', a: '缘分不是等来的', b: '是你伸手,月老才好牵线' },
  { n: '第五十八签', a: '好事多磨,磨完就是你的', b: '沉住气,别已读不回' },
]
const DAILY_YI = ['主动打招呼', '穿一点蓝', '发第一条消息', '约一顿饭', '把头像换亮一点', '早点睡']
const DAILY_JI = ['已读不回', '想太多', '翻旧账', '熬夜等消息', '试探来试探去', '嘴硬']

function hashStr(s) {
  let h = 5381
  for (let i = 0; i < (s || '').length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h
}
function poemFor(seed) {
  return POEMS[hashStr(String(seed)) % POEMS.length]
}

const EMPTY_PRICING = {
  mode: 'mock',
  put_fen: 0,
  draw_fen: 0,
  free_puts_per_day: 0,
  free_draws_per_day: 0,
  lamp_fen: 660,
}

const EMPTY_WALL = { matched_month: 0, matched_total: 0, answered: 0, lamps_month: 0, lamps_total: 0 }

const EMPTY_STATS = {
  male: 0,
  female: 0,
  total_draws: 0,
  draws_left: 5,
  puts_left: 3,
  male_cities: [],
  female_cities: [],
  my_notes: [],
  my_hearts: 0,
  pending_followup: null,
  wall: EMPTY_WALL,
}

export default function Home() {
  const [tab, setTab] = useState('draw')
  const [deviceId, setDeviceId] = useState(null)
  const [stats, setStats] = useState(EMPTY_STATS)
  const [loaded, setLoaded] = useState(false)
  const [pricing, setPricing] = useState(EMPTY_PRICING)
  const [gateOk, setGateOk] = useState(true) // 先乐观,挂载后读本地
  const [showGate, setShowGate] = useState(false)
  const [showSafe, setShowSafe] = useState(false)
  const [showWall, setShowWall] = useState(false)
  const [showMarket, setShowMarket] = useState(false)
  const [followupNote, setFollowupNote] = useState(null) // {note_id, nickname, days}

  useEffect(() => {
    setDeviceId(getDeviceId())
    try {
      setGateOk(!!localStorage.getItem(GATE_KEY))
    } catch {}
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

  // 七日回访:每支签只问一次;本次会话关掉就不再弹
  useEffect(() => {
    const fu = stats.pending_followup
    if (!fu || !fu.note_id) return
    try {
      if (sessionStorage.getItem('yuelao_fu_' + fu.note_id)) return
    } catch {}
    setFollowupNote(fu)
  }, [stats.pending_followup])

  function dismissFollowup() {
    if (followupNote) {
      try {
        sessionStorage.setItem('yuelao_fu_' + followupNote.note_id, '1')
      } catch {}
    }
    setFollowupNote(null)
  }

  // 写签/请签前的准入(18+ 与敏感信息单独同意);浏览不拦
  function requireGate(then) {
    if (gateOk) return then()
    setShowGate(true)
  }

  return (
    <main className="app">
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark">缘</span>
          月老盲盒
          <span className="beta-tag">公测</span>
        </span>
        <button className="shield" onClick={() => setShowSafe(true)}>
          安全
        </button>
      </header>

      <div className="page">
        {tab === 'draw' && (
          <DrawTab
            deviceId={deviceId}
            stats={stats}
            loaded={loaded}
            pricing={pricing}
            onDone={refreshStats}
            requireGate={requireGate}
            openWall={() => setShowWall(true)}
            openMarket={() => setShowMarket(true)}
            wall={stats.wall || EMPTY_WALL}
          />
        )}
        {tab === 'put' && (
          <PutTab
            deviceId={deviceId}
            stats={stats}
            pricing={pricing}
            onDone={refreshStats}
            goDraw={() => setTab('draw')}
            requireGate={requireGate}
          />
        )}
        {tab === 'mine' && (
          <MineTab
            stats={stats}
            deviceId={deviceId}
            loaded={loaded}
            onDone={refreshStats}
            goPut={() => setTab('put')}
            goDraw={() => setTab('draw')}
          />
        )}

        <footer className="disclaimer">
          月老只负责牵线,不核实身份;凡开口谈钱,一律是骗子。
          <br />
          已牵起 <b className="tally">{stats.total_draws}</b> 段缘分 ·{' '}
          <button className="linklike" onClick={() => setShowSafe(true)}>
            安全中心
          </button>
        </footer>
      </div>

      <nav className="tabbar">
        <button className={tab === 'draw' ? 'on' : ''} onClick={() => setTab('draw')}>
          <span className="glyph">签</span>求签
        </button>
        <button className={tab === 'put' ? 'on' : ''} onClick={() => setTab('put')}>
          <span className="glyph">写</span>写签
        </button>
        <button
          className={tab === 'mine' ? 'on' : ''}
          onClick={() => {
            setTab('mine')
            refreshStats()
          }}
        >
          <span className="glyph">缘</span>我的签
        </button>
      </nav>

      {showGate && (
        <Gate
          onDone={() => {
            setGateOk(true)
            setShowGate(false)
          }}
          onClose={() => setShowGate(false)}
        />
      )}
      {showSafe && <SafeSheet onClose={() => setShowSafe(false)} />}
      {showWall && (
        <WallSheet
          deviceId={deviceId}
          wall={stats.wall || EMPTY_WALL}
          lampFen={pricing.lamp_fen}
          onDone={refreshStats}
          onClose={() => setShowWall(false)}
        />
      )}
      {showMarket && <MarketSheet stats={stats} pricing={pricing} onClose={() => setShowMarket(false)} />}
      {followupNote && (
        <Followup
          deviceId={deviceId}
          fu={followupNote}
          onClose={dismissFollowup}
          onGood={() => {
            dismissFollowup()
            setShowWall(true)
          }}
          onDone={refreshStats}
        />
      )}
    </main>
  )
}

// ---- 七日回访:每支签只问一次,回答匿名汇入灵验率 ----
function Followup({ deviceId, fu, onClose, onGood, onDone }) {
  const [busy, setBusy] = useState(false)
  const [scamMode, setScamMode] = useState(false)
  const [hint, setHint] = useState('')

  async function answer(a) {
    if (busy) return
    setBusy(true)
    const { data } = await supabase.rpc('yuelao_followup', {
      p_device_id: deviceId,
      p_note_id: fu.note_id,
      p_answer: a,
    })
    setBusy(false)
    if (!data?.ok) {
      onClose()
      return
    }
    onDone()
    if (a === 'good') {
      onGood()
    } else if (a === 'slow') {
      setHint('不急,好缘分要文火慢炖')
      setTimeout(onClose, 1400)
    } else {
      setScamMode(true)
    }
  }

  async function report(reason) {
    await supabase.rpc('yuelao_report_note', {
      p_device_id: deviceId,
      p_note_id: fu.note_id,
      p_reason: reason,
    })
    setHint('已举报。核实后将下架并退香火钱。')
    setTimeout(onClose, 1600)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="fu" onClick={(e) => e.stopPropagation()}>
        <span className="fu-badge f-title">月老</span>
        <h2 className="f-title">第七日 · 月老来问</h2>
        <p className="fu-sub f-hand">红线牵起第 {fu.days} 天,和{fu.nickname}聊得如何?</p>
        {!scamMode ? (
          <>
            <button className="fu-opt good" onClick={() => answer('good')} disabled={busy}>
              <i>😊</i>
              <span>
                <b>聊得不错,谢谢月老</b>
                <em>替你高兴!去点一盏还愿灯?</em>
              </span>
            </button>
            <button className="fu-opt" onClick={() => answer('slow')} disabled={busy}>
              <i>😐</i>
              <span>
                <b>还在慢慢来</b>
                <em>不急,好缘分要文火慢炖</em>
              </span>
            </button>
            <button className="fu-opt bad" onClick={() => answer('scam')} disabled={busy}>
              <i>⚠️</i>
              <span>
                <b>遇到了骗子</b>
                <em>立即举报 · 核实后退香火钱并封禁对方</em>
              </span>
            </button>
          </>
        ) : (
          <div className="report-box">
            <span className="report-title">对方哪里不对?</span>
            <div className="report-reasons">
              {['骗钱诈骗', '广告推广', '骚扰不适', '其他'].map((r) => (
                <button key={r} className="btn-ghost sm" onClick={() => report(r)}>
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
        {hint && <div className="share-hint">{hint}</div>}
        <p className="fu-note">回访只此一次,不再打扰;你的回答将匿名汇入「灵验率」,帮后来人判断。</p>
      </div>
    </div>
  )
}

// ---- 灵验墙 + 还愿灯 ----
function WallSheet({ deviceId, wall, lampFen, onDone, onClose }) {
  const [cashier, setCashier] = useState(null)
  const [busy, setBusy] = useState(false)
  const [thanks, setThanks] = useState(false)
  const [err, setErr] = useState('')
  const rate = wall.answered > 0 ? Math.round((wall.matched_total / wall.answered) * 100) : null

  async function buyLamp() {
    if (busy || cashier) return
    setErr('')
    setBusy(true)
    const { data, error } = await supabase.rpc('yuelao_create_order', {
      p_device_id: deviceId,
      p_kind: 'lamp',
    })
    setBusy(false)
    if (error || !data) return setErr(errMsg('network'))
    if (!data.ok) return setErr(errMsg(data.error))
    if (data.done) {
      setThanks(true)
      onDone()
    } else {
      setCashier(data)
    }
  }

  function onLampPaid(data) {
    setCashier(null)
    if (!data.ok) return setErr(errMsg(data.error))
    setThanks(true)
    onDone()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="wall" onClick={(e) => e.stopPropagation()}>
        <div className="safe-head">
          <h2 className="f-title">灵验墙</h2>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="wall-sub">
          本月牵成 <b>{wall.matched_month}</b> 对
          {rate !== null && (
            <>
              {' '}
              · 灵验率 <b>{rate}%</b>
            </>
          )}{' '}
          · 口径:七日回访答「聊得不错」
        </p>
        <div className="lamp-hero">
          <i className="lamp-art" aria-hidden="true">
            <em className="glow" />
            <em className="flame" />
            <em className="body" />
            <em className="base" />
          </i>
          <b>本月已点亮 {wall.lamps_month} 盏还愿灯</b>
          <p>缘分成了?回来点一盏灯——谢月老,也照亮还在等的人。灯会在灵验墙亮一个月。</p>
          {thanks ? (
            <div className="lamp-thanks">🏮 你的灯已挂上灵验墙,愿你们长长久久</div>
          ) : (
            <button className="btn-primary" onClick={buyLamp} disabled={busy}>
              {busy ? '点灯中…' : `点一盏还愿灯 · ¥${yuan(lampFen)}`}
            </button>
          )}
          {err && <p className="err">{err}</p>}
        </div>
        <p className="fu-note">还愿全凭心意,不点灯也不影响任何功能;回答与灯都匿名展示。</p>
        {cashier && <Shrine deviceId={deviceId} order={cashier} onPaid={onLampPaid} onClose={() => setCashier(null)} />}
      </div>
    </div>
  )
}

// ---- 今日行情:定价与供需公示(全员一价,不设暗价) ----
function MarketSheet({ stats, pricing, onClose }) {
  const scarce =
    stats.male === stats.female ? null : stats.male < stats.female ? '男生签筒' : '女生签筒'
  return (
    <div className="overlay" onClick={onClose}>
      <div className="wall" onClick={(e) => e.stopPropagation()}>
        <div className="safe-head">
          <h2 className="f-title">今日签筒行情</h2>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="wall-sub">供需透明公示 · 全员一价,不设暗价</p>
        <div className="mkt-grid">
          <div className="mkt-card">
            <b>写签</b>
            <em className="f-title">¥{yuan(pricing.put_fen)}</em>
            {pricing.free_puts_per_day > 0 && <i>每日前 {pricing.free_puts_per_day} 次免费</i>}
          </div>
          <div className="mkt-card">
            <b>请签</b>
            <em className="f-title">¥{yuan(pricing.draw_fen)}</em>
            {pricing.free_draws_per_day > 0 && <i>每日前 {pricing.free_draws_per_day} 次免费</i>}
          </div>
        </div>
        <div className="mkt-supply">
          <b>筒内存量</b>
          <div className="mkt-row">
            <span className="pill blue">男生签筒 · {stats.male} 支</span>
            <span className="pill rouge">女生签筒 · {stats.female} 支</span>
          </div>
          {scarce && <p>{scarce}紧俏——写一支自己的签,让筒里的缘分流动起来。</p>}
        </div>
        <p className="fu-note">未请中自动退香火钱;价格调整会在这里提前公示,不看人下菜。</p>
      </div>
    </div>
  )
}

// ---- 准入三关:18+ 与「微信号单独同意」;拒绝不影响浏览,写签/请签必须过 ----
function Gate({ onDone, onClose }) {
  const [age, setAge] = useState(false)
  const [consent, setConsent] = useState(false)

  function confirm() {
    if (!age || !consent) return
    try {
      localStorage.setItem(GATE_KEY, JSON.stringify({ age18: true, consent: true, at: Date.now() }))
    } catch {}
    onDone()
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="gate" onClick={(e) => e.stopPropagation()}>
        <h2 className="f-title">进庙之前,两件事</h2>
        <p className="gate-sub">监管的要求,也是我们自己的规矩</p>
        <label className={`gate-item ${age ? 'ok' : ''}`}>
          <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} />
          <span>
            <b>我已年满 18 岁</b>
            <i>未成年人不能使用月老盲盒</i>
          </span>
        </label>
        <label className={`gate-item ${consent ? 'ok' : ''}`}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            <b>微信号 · 单独同意</b>
            <i>微信号属敏感个人信息:仅为「被请中后展示给对方」这一个目的加密存放,可随时撤签删除</i>
          </span>
        </label>
        <p className="gate-law">依据《个人信息保护法》第 28/29 条。拒绝不影响浏览签诗,但无法写签、请签。</p>
        <button className="btn-primary" disabled={!age || !consent} onClick={confirm}>
          都确认了 · 进庙
        </button>
        <button className="linklike center" onClick={onClose}>
          暂不同意 · 先逛逛
        </button>
      </div>
    </div>
  )
}

// ---- 安全中心:骗局案例 + 可验证的平台规则 + 反诈专线 ----
function SafeSheet({ onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="safe" onClick={(e) => e.stopPropagation()}>
        <div className="safe-head">
          <h2 className="f-title">安全中心</h2>
          <button className="x" onClick={onClose}>
            ✕
          </button>
        </div>
        <p className="safe-sub">所有规则和处置,都摆在明面上</p>
        <div className="safe-card beta">
          <b className="beta-t">🧪 公测测试中</b>
          <ul>
            <li>当前为模拟支付,<b>不会真实扣款</b>,请放心体验完整流程</li>
            <li>测试期数据可能被重置;填真实微信号会被请中的人看到,介意可先填小号</li>
            <li>玩得开心或遇到问题,都欢迎告诉月老 —— 你的每条反馈都会被看到</li>
          </ul>
          {BETA_CONTACT && <div className="beta-contact">反馈方式:{BETA_CONTACT}</div>}
        </div>
        <div className="safe-card">
          <b className="danger-t">骗局案例库</b>
          <div className="case">
            <span className="pill rouge">杀猪盘</span>先嘘寒问暖,再带你投资/炒币——聊感情不聊钱,谈钱就举报
          </div>
          <div className="case">
            <span className="pill rouge">刷单兼职</span>说带你赚钱、做任务返利的,全是托
          </div>
          <div className="case">
            <span className="pill rouge">借钱应急</span>刚加上就开口借钱,一律不借,直接举报
          </div>
        </div>
        <div className="safe-card green">
          <b>平台规则(每一条都可验证)</b>
          <ul>
            <li>手写签文,月老逐条审核,广告微商直接拒收</li>
            <li>每支签最多被请走 3 次,随后自动下架</li>
            <li>微信号封存于封条之下,只有付费请中的人能看一次</li>
            <li>3 个设备举报即自动下架;处置后退香火钱</li>
          </ul>
        </div>
        <p className="hotline">涉及财产损失,请立即拨打 110 或全国反诈专线 96110</p>
      </div>
    </div>
  )
}

// ---- 香火台(收银):mock 模式模拟支付;真支付接入后换网关,不改流程 ----
function Shrine({ deviceId, order, onPaid, onClose }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const isDraw = order.kind === 'draw'
  const isLamp = order.kind === 'lamp'

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
      <div className="shrine" onClick={(e) => e.stopPropagation()}>
        <div className="shrine-head">
          <span className="f-title shrine-title">
            {isLamp ? '添灯油 · 点一盏还愿灯' : isDraw ? '添香火 · 请月老抽签' : '添香火 · 托月老收签'}
          </span>
          <button className="x" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>
        <p className="shrine-sub">
          {isLamp
            ? '谢月老 · 灯挂灵验墙一个月'
            : isDraw
              ? `请一支 · ${order.gender === 'male' ? '男生签筒' : '女生签筒'}${order.city ? ` · 同城${order.city}` : ''}`
              : '把你的签放进签筒'}
        </p>
        <div className="incense" aria-hidden="true">
          <i className="glow" />
          <i className="stick s1" />
          <i className="stick s2" />
          <i className="stick s3" />
          <i className="bowl-top" />
          <i className="bowl" />
        </div>
        <div className="shrine-amt">
          <span className="cur f-title">¥</span>
          <span className="num f-title">{yuan(order.amount_fen)}</span>
        </div>
        <div className="wyg">
          <b>你将获得</b>
          <p>
            {isLamp
              ? '一盏还愿灯,匿名挂上灵验墙一个月;全凭心意,不影响任何功能。'
              : isDraw
                ? '随机请走 1 支真人手写签,请中才见微信;不会请到自己或请过的人;筒空自动退香火钱。'
                : '你的签放进签筒,被请走时对方才能看到微信;可随时在「我的签」撤回。'}
          </p>
        </div>
        <p className="fair">请中才付 · 未请中自动退 · 当前为模拟支付,不会真实扣款</p>
        <button className="btn-primary" onClick={pay} disabled={busy}>
          {busy ? '香火点燃中…' : `敬上香火 · ¥${yuan(order.amount_fen)}`}
        </button>
        {err && <p className="err">{err}</p>}
        <button className="linklike center" onClick={onClose} disabled={busy}>
          取消
        </button>
      </div>
    </div>
  )
}

// ---- 每日缘分签:永远免费,分享只带签诗 ----
function DailySign({ deviceId }) {
  const [hint, setHint] = useState('')
  const today = new Date()
  const dayKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`
  const seed = hashStr(dayKey + (deviceId || ''))
  const poem = POEMS[seed % POEMS.length]
  const score = 60 + (seed % 40)
  const yi1 = DAILY_YI[seed % DAILY_YI.length]
  const yi2 = DAILY_YI[hashStr(dayKey + 'yi2' + (deviceId || '')) % DAILY_YI.length]
  const ji1 = DAILY_JI[hashStr(dayKey + 'ji' + (deviceId || '')) % DAILY_JI.length]

  async function share() {
    const text = `【月老盲盒 · 今日缘分签】\n${poem.a},${poem.b}。\n今日爱情运 ${score}/100 · 宜:${yi1} · 忌:${ji1}\n${typeof window !== 'undefined' ? window.location.origin : ''}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: '今日缘分签', text })
        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setHint('签诗已复制,发给朋友吧(不含任何个人信息)')
      setTimeout(() => setHint(''), 2500)
    } catch {}
  }

  return (
    <div className="daily">
      <div className="daily-head">
        <b>今日缘分签</b>
        <span>免费 · 不扣香火钱</span>
      </div>
      <div className="daily-poem f-title">{poem.a}</div>
      <div className="daily-luck">
        今日爱情运 <b className="f-title">{score}</b> / 100
      </div>
      <div className="daily-tags">
        <span className="pill green">宜 · {yi1}</span>
        {yi2 !== yi1 && <span className="pill blue">宜 · {yi2}</span>}
        <span className="pill rouge">忌 · {ji1}</span>
      </div>
      <button className="btn-ghost" onClick={share}>
        分享今日签诗卡(不含个人信息)
      </button>
      {hint && <div className="share-hint">{hint}</div>}
    </div>
  )
}

// ---- 求签(首页)----
function DrawTab({ deviceId, stats, loaded, pricing, onDone, requireGate, openWall, openMarket, wall }) {
  const [shaking, setShaking] = useState(null) // 'male' | 'female'
  const [note, setNote] = useState(null)
  const [toast, setToast] = useState('')
  const [city, setCity] = useState('')
  const [cashier, setCashier] = useState(null)
  const [pending, setPending] = useState(false)
  const [ritualSeen, setRitualSeen] = useState(false)
  const [skipNow, setSkipNow] = useState(false)

  const outOfDraws = loaded && stats.draws_left <= 0
  const drawFen = pricing.draw_fen

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PENDING_REVEAL_KEY)
      if (saved) setNote(JSON.parse(saved))
      setRitualSeen(!!localStorage.getItem(RITUAL_KEY))
    } catch {}
  }, [])

  function dismissNote() {
    try {
      localStorage.removeItem(PENDING_REVEAL_KEY)
    } catch {}
    setNote(null)
  }

  const cities = []
  for (const c of [...(stats.male_cities || []), ...(stats.female_cities || [])]) {
    if (c && !cities.includes(c)) cities.push(c)
  }
  const activeCity = cities.includes(city) ? city : ''

  // 摇筒 → 揭签:结果先落盘,动画只是播放
  function revealCeremony(gender, drawnNote) {
    try {
      localStorage.setItem(PENDING_REVEAL_KEY, JSON.stringify(drawnNote))
      localStorage.setItem(RITUAL_KEY, '1')
    } catch {}
    setSkipNow(false)
    setShaking(gender)
    const t = setTimeout(() => {
      setShaking(null)
      setNote(drawnNote)
      onDone()
    }, 800)
    // 跳过仪式:立即揭
    if (skipRef) skipRef.cancel = () => {
      clearTimeout(t)
      setShaking(null)
      setNote(drawnNote)
      onDone()
    }
  }
  const skipRef = useMemo(() => ({ cancel: null }), [])

  async function draw(gender) {
    if (!deviceId || shaking || pending || cashier) return
    if (outOfDraws) {
      setToast(errMsg('daily_limit'))
      return
    }
    requireGate(async () => {
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
        revealCeremony(gender, data.note)
      } else {
        setCashier({ ...data, gender, city: activeCity })
      }
    })
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

  const maleEmpty = loaded && stats.male === 0
  const femaleEmpty = loaded && stats.female === 0

  return (
    <section className="draw">
      <div className="plaques" aria-hidden="true">
        <i className="pl p1">
          <em className="f-hand">求良缘</em>
        </i>
        <i className="pl p2">
          <em className="f-hand">盼相遇</em>
        </i>
        <i className="pl p3">
          <em className="f-hand">愿心安</em>
        </i>
      </div>

      <div className="lead">
        <h1 className="f-title">求一支姻缘签</h1>
        <p>签筒里都是真人手写的纸条,月老逐条审过</p>
      </div>

      {cities.length > 0 && (
        <div className="city-filter">
          <span>同城缘分</span>
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

      <div className="altar">
        <Tong
          gender="male"
          label="男生签筒"
          count={stats.male}
          loaded={loaded}
          empty={maleEmpty}
          shaking={shaking === 'male'}
          disabled={outOfDraws || pending}
          onClick={() => draw('male')}
        />
        <Tong
          gender="female"
          label="女生签筒"
          count={stats.female}
          loaded={loaded}
          empty={femaleEmpty}
          shaking={shaking === 'female'}
          disabled={outOfDraws || pending}
          onClick={() => draw('female')}
        />
        <i className="slab" aria-hidden="true" />
      </div>

      {shaking && ritualSeen && !skipNow && (
        <button
          className="skip-ritual"
          onClick={() => {
            setSkipNow(true)
            skipRef.cancel && skipRef.cancel()
          }}
        >
          跳过仪式
        </button>
      )}

      {toast && <div className="toast">{toast}</div>}

      <p className="rule-line">
        {outOfDraws ? (
          <>今天的缘分请完啦,明天再来~</>
        ) : (
          <>
            {drawFen > 0 && (
              <>
                请签 <b>¥{yuan(drawFen)}</b> ·{' '}
              </>
            )}
            今日还可请 <b>{loaded ? stats.draws_left : 5}</b> 次 · 未请中自动退香火钱
          </>
        )}
      </p>
      {pricing.free_draws_per_day > 0 && !outOfDraws && (
        <p className="free-pill">
          <i />每日前 {pricing.free_draws_per_day} 次免费 · 未请中自动退香火钱
        </p>
      )}

      <div className="trust">
        <div className="trust-list">
          <span>每支签最多被请走 3 次,随后自动下架</span>
          <span>手写签文 · 月老逐条审核,广告微商直接拒收</span>
          <span>凡开口谈钱一律是骗子 · 一键举报即封</span>
        </div>
        <i className="stamp f-title" aria-hidden="true">
          月老
          <br />
          已审
        </i>
      </div>

      <div className="entry-row">
        <button className="entry" onClick={openWall}>
          <b>🏮 灵验墙</b>
          <span>本月牵成 {wall.matched_month} 对 ›</span>
        </button>
        <button className="entry" onClick={openMarket}>
          <b>📜 今日行情</b>
          <span>价格与供需公示 ›</span>
        </button>
      </div>

      <DailySign deviceId={deviceId} />

      {cashier && <Shrine deviceId={deviceId} order={cashier} onPaid={onDrawPaid} onClose={() => setCashier(null)} />}

      {note && <Reveal note={note} deviceId={deviceId} drawFen={drawFen} onClose={dismissNote} onDrawAgain={draw} />}
    </section>
  )
}

function Tong({ gender, label, count, loaded, empty, shaking, disabled, onClick }) {
  return (
    <button
      className={`tong ${gender} ${shaking ? 'shaking' : ''} ${empty ? 'empty' : ''}`}
      onClick={onClick}
      disabled={disabled || empty}
    >
      <span className="sticks" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
      <span className="tong-rim" aria-hidden="true" />
      <span className="tong-body" aria-hidden="true" />
      <span className="tong-band f-title">{label}</span>
      <span className="tong-count">
        {!loaded ? (
          <span className="skeleton count-skel" aria-label="清点中" />
        ) : empty ? (
          '筒空了 · 明日再来'
        ) : (
          `${count} 支签在筒里`
        )}
      </span>
    </button>
  )
}

// ---- 揭签:签诗 → 手写签 → 封条(反诈叮咛)→ 撕开 → 复制 → 变身再求一支 ----
function Reveal({ note, deviceId, drawFen, onClose, onDrawAgain }) {
  const [stage, setStage] = useState('sealed') // sealed | oath | open
  const [copied, setCopied] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reported, setReported] = useState(false)
  const [hearted, setHearted] = useState(false)
  const [hint, setHint] = useState('')
  const poem = poemFor(note.id)

  async function copyContact() {
    try {
      await navigator.clipboard.writeText(note.contact)
      setCopied(true)
    } catch {}
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
      setHint('已举报。核实后将下架并退香火钱。')
      setTimeout(() => setHint(''), 3000)
    }
  }

  async function heart() {
    if (hearted) return
    const { data } = await supabase.rpc('yuelao_heart_signal', {
      p_device_id: deviceId,
      p_note_id: note.id,
    })
    if (data?.ok) {
      setHearted(true)
      setHint('心动信号已回传,TA 会知道红线接上了')
      setTimeout(() => setHint(''), 3000)
    }
  }

  async function sharePoem() {
    const text = `【月老盲盒 · 姻缘签 · ${poem.n}】\n${poem.a},${poem.b}。\n${typeof window !== 'undefined' ? window.location.origin : ''}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: '姻缘签', text })
        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setHint('签诗已复制(不含任何个人信息)')
      setTimeout(() => setHint(''), 2500)
    } catch {}
  }

  function drawAgain() {
    const g = note.gender
    onClose()
    setTimeout(() => onDrawAgain(g), 60)
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="stickhead" aria-hidden="true">
        <i className="knob" />
        <i className="shaft" />
      </div>
      <div className="scroll" onClick={(e) => e.stopPropagation()}>
        <i className="stamp corner f-title" aria-hidden="true">
          月老
          <br />
          已审
        </i>
        <div className="qh">姻缘签 · {poem.n}</div>
        <div className="poem f-title">{poem.a}</div>
        <div className="poem-b">{poem.b}</div>
        <div className="scroll-div" />
        <div className="who">
          <b className="f-hand">{note.nickname}</b>
          <span>
            {note.age} 岁 · {note.city}
            {note.seeking ? ` · 想认识${note.seeking === 'male' ? '男生' : '女生'}` : ''}
          </span>
        </div>
        {note.hobbies && <p className="hand f-hand">爱好 · {note.hobbies}</p>}
        {note.message && <p className="hand quote f-hand">「{note.message}」</p>}

        {stage === 'sealed' && (
          <>
            <div className="seal-strip">
              <b className="f-title">封</b>
              <i />
              微信号封存于此 · 撕开可见
            </div>
            <p className="warn">撕开前请记住:凡开口谈钱,一律是骗子</p>
            <button className="btn-primary" onClick={() => setStage('oath')}>
              撕开封条 · 见微信
            </button>
          </>
        )}

        {stage === 'oath' && (
          <div className="oath">
            <b>月老只说一次:</b>
            <p>
              谈到<b>转账、投资、刷单、借钱</b>,不管理由多动人,一律是诈骗——立即停手,回来举报,香火钱退你。
            </p>
            <button className="btn-primary" onClick={() => setStage('open')}>
              我已记下 · 解封
            </button>
          </div>
        )}

        {stage === 'open' && (
          <>
            <div className="torn" aria-hidden="true">
              <i className="half l" />
              <i className="half r" />
            </div>
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
            <div className="contact-box">
              <span className="clabel">TA 的微信</span>
              <b className="cid f-hand">{note.contact}</b>
              {copied ? (
                <button className="btn-primary morph" onClick={drawAgain}>
                  再求一支{drawFen > 0 ? ` · ¥${yuan(drawFen)}` : ''}
                </button>
              ) : (
                <button className="btn-primary" onClick={copyContact}>
                  复制微信号
                </button>
              )}
              {copied && <span className="copied-tip">✓ 已复制</span>}
            </div>
            <p className="warn">凡开口谈钱,一律是骗子 · 有异常一键举报</p>
            <div className="heart-box">
              <b>加上好友了?</b>
              <p>回传一个匿名心动信号,写签的人会知道红线接上了。</p>
              <button className={`btn-ghost rouge ${hearted ? 'done' : ''}`} onClick={heart} disabled={hearted}>
                {hearted ? '✓ 心动信号已回传' : '已添加 · 回传心动信号'}
              </button>
            </div>
            <button className="linklike center" onClick={sharePoem}>
              把这支签的签诗做成卡片分享 ›(不含任何个人信息)
            </button>
          </>
        )}

        {hint && <div className="share-hint">{hint}</div>}

        <div className="scroll-foot">
          {reporting ? (
            <div className="report-box">
              <span className="report-title">这支签哪里不对?</span>
              <div className="report-reasons">
                {['广告推广', '虚假信息', '骚扰不适', '其他'].map((r) => (
                  <button key={r} className="btn-ghost sm" onClick={() => report(r)}>
                    {r}
                  </button>
                ))}
              </div>
              <button className="linklike" onClick={() => setReporting(false)}>
                取消
              </button>
            </div>
          ) : (
            <>
              <button className="linklike" onClick={() => setReporting(true)} disabled={reported}>
                {reported ? '已举报,谢谢' : '举报此签'}
              </button>
              {typeof note.draw_count === 'number' && (
                <span className="draw-quota">这支签已被请走 {Math.min(note.draw_count, 3)}/3 次</span>
              )}
              <button className="linklike strong" onClick={onClose}>
                收下这段缘分
              </button>
            </>
          )}
        </div>
      </div>
    </div>
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

// ---- 写签 ----
function PutTab({ deviceId, stats, pricing, onDone, goDraw, requireGate }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const [cashier, setCashier] = useState(null)

  const putFen = pricing.put_fen

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function submit(e) {
    e.preventDefault()
    if (busy || !deviceId || cashier) return
    requireGate(async () => {
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
        setDone(true)
        onDone()
      } else {
        setCashier(data)
      }
    })
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
      <div className="letter ok-panel">
        <i className="hangline" aria-hidden="true" />
        <span className="ok-knot" aria-hidden="true" />
        <h2 className="f-title">你的红线已挂上</h2>
        <p>
          月老已把你的签收进筒里。
          <br />
          被请走时,对方才能看到你的微信;
          <br />
          有人回传心动信号,「我的签」会告诉你。
        </p>
        <button
          className="btn-primary"
          onClick={() => {
            setDone(false)
            setForm(EMPTY_FORM)
            goDraw()
          }}
        >
          我也去求一支
        </button>
      </div>
    )
  }

  return (
    <form className="letter" onSubmit={submit}>
      <h2 className="f-title">写一支自己的签</h2>
      <p className="sub">
        {putFen > 0 && (
          <>
            写一支 <b>¥{yuan(putFen)}</b> ·{' '}
          </>
        )}
        今日还可写 {stats.puts_left} 支 · 手写你的真心,月老替你封存
      </p>

      <div className="privcard">🔒 不公开 · 不可爬 · 满 3 次自动下架 · 随时可撤签</div>

      <div className="seg-row">
        <div className="fgroup">
          <label>我是</label>
          <div className="seg">
            <button type="button" className={form.gender === 'male' ? 'on m' : ''} onClick={() => set('gender', 'male')}>
              男生
            </button>
            <button
              type="button"
              className={form.gender === 'female' ? 'on f' : ''}
              onClick={() => set('gender', 'female')}
            >
              女生
            </button>
          </div>
        </div>
        <div className="fgroup">
          <label>想认识</label>
          <div className="seg">
            <button type="button" className={form.seeking === 'male' ? 'on m' : ''} onClick={() => set('seeking', 'male')}>
              男生
            </button>
            <button
              type="button"
              className={form.seeking === 'female' ? 'on f' : ''}
              onClick={() => set('seeking', 'female')}
            >
              女生
            </button>
          </div>
        </div>
      </div>

      <div className="lrow2">
        <div className="lrow">
          <label>昵称</label>
          <input
            className="f-hand"
            value={form.nickname}
            onChange={(e) => set('nickname', e.target.value)}
            maxLength={20}
            placeholder="怎么称呼你"
            required
          />
        </div>
        <div className="lrow">
          <label>年龄</label>
          <input
            className="f-hand"
            value={form.age}
            onChange={(e) => set('age', e.target.value)}
            type="number"
            min={18}
            max={99}
            placeholder="18+"
            required
          />
        </div>
      </div>

      <div className="lrow">
        <label>城市</label>
        <input
          className="f-hand"
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          maxLength={20}
          placeholder="你在哪座城市"
          required
        />
      </div>

      <div className="lrow hl">
        <label>微信号</label>
        <input
          className="f-hand"
          value={form.contact}
          onChange={(e) => set('contact', e.target.value)}
          maxLength={50}
          placeholder="封存于封条之下"
          required
        />
        <i className="lnote">仅请中你的人可见 · 可随时撤签删除</i>
      </div>

      <div className="lrow">
        <label>爱好(选填)</label>
        <input
          className="f-hand"
          value={form.hobbies}
          onChange={(e) => set('hobbies', e.target.value)}
          maxLength={60}
          placeholder="爬山、看展、打游戏…"
        />
      </div>

      <div className="lrow">
        <label>想说的话(选填)</label>
        <textarea
          className="f-hand"
          value={form.message}
          onChange={(e) => set('message', e.target.value)}
          maxLength={140}
          rows={3}
          placeholder="给请到这支签的人留句话吧"
        />
      </div>

      {form.nickname.trim() && <p className="sign-off f-hand">—— 落款 · {form.nickname.trim()}</p>}

      <button className="btn-primary seal-btn" disabled={busy}>
        <i className="seal-sq f-title">印</i>
        {busy ? '封存中…' : putFen > 0 ? `盖印投筒 · ¥${yuan(putFen)}` : '盖印投筒'}
      </button>
      {err && <p className="err">{err}</p>}

      {cashier && <Shrine deviceId={deviceId} order={cashier} onPaid={onPutPaid} onClose={() => setCashier(null)} />}
    </form>
  )
}

// ---- 我的签 · 缘分簿 ----
function MineTab({ stats, deviceId, loaded, onDone, goPut, goDraw }) {
  const [busyId, setBusyId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const notes = stats.my_notes || []
  const totalDraws = notes.reduce((s, n) => s + (n.draw_count || 0), 0)
  const hearts = stats.my_hearts || 0

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
  if (notes.length === 0) {
    return (
      <div className="empty">
        <span className="empty-art">💌</span>
        <div className="empty-title">你还没有交给月老一支签</div>
        <div className="empty-sub">写下自己,才有人能请到你</div>
        <button className="btn-primary" style={{ marginTop: 14 }} onClick={goPut}>
          去写一支签
        </button>
      </div>
    )
  }
  return (
    <section className="mine">
      <h2 className="f-title mine-title">我的签 · 缘分簿</h2>
      <div className="receipt">
        <div className="receipt-line">
          你的红线被牵起 <b className="f-title">{totalDraws}</b> 次
        </div>
        <div className="receipt-sub">
          {hearts > 0 ? (
            <>
              <i className="dot" />其中 <b>{hearts}</b> 人向你回传了心动信号,留意微信好友申请
            </>
          ) : totalDraws > 0 ? (
            '有人读过你的签,缘分在路上了'
          ) : (
            '等第一个人来请你的签'
          )}
        </div>
      </div>

      <button className="hook f-hand" onClick={goDraw}>
        想知道是谁请走了你?去求一支签,也许正是 TA ›
      </button>

      {notes.map((n) => {
        const full = (n.draw_count || 0) >= 3
        return (
          <div className="signitem" key={n.id}>
            <div className="si-main">
              <div className="name">
                <b className="f-hand">{n.nickname}</b>
                <span className={`pill ${n.gender === 'male' ? 'blue' : 'rouge'}`}>
                  {n.gender === 'male' ? '男生签筒' : '女生签筒'}
                </span>
                {n.status === 'hidden' && <span className="pill gray">已下架</span>}
              </div>
              <div className="sub">{new Date(n.created_at).toLocaleDateString('zh-CN')} 投入</div>
            </div>
            <div className="si-right">
              <span className="pill gold">
                被请走 {Math.min(n.draw_count || 0, 3)}/3{full ? ' · 已请满' : ''}
              </span>
              {(n.hearts || 0) > 0 && <span className="pill rouge">心动 ×{n.hearts}</span>}
              {n.status === 'active' &&
                (confirmId === n.id ? (
                  <div className="confirm-row">
                    <button className="btn-tiny danger" onClick={() => withdraw(n.id)} disabled={busyId === n.id}>
                      {busyId === n.id ? '撤签中' : '确认撤签'}
                    </button>
                    <button className="btn-tiny" onClick={() => setConfirmId(null)}>
                      取消
                    </button>
                  </div>
                ) : (
                  <button className="btn-tiny" onClick={() => setConfirmId(n.id)}>
                    撤签
                  </button>
                ))}
            </div>
          </div>
        )
      })}
      <p className="mine-note">
        满 3 次自动下架是为了保护你:不会有几百个陌生人拿到同一个微信号。想继续,再写一支就好。撤签不返还当日次数。
      </p>
    </section>
  )
}
