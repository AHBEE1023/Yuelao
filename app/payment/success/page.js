'use client'

import { useEffect, useState } from 'react'

const PENDING_REVEAL_KEY = 'yuelao_pending_reveal'

export default function PaymentResultPage() {
  const [state, setState] = useState('checking')
  const [message, setMessage] = useState('正在确认支付结果…')
  const [orderNo, setOrderNo] = useState('')
  const [deviceId, setDeviceId] = useState('')

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const nextOrderNo = params.get('order_no') ?? ''
    const nextDeviceId = localStorage.getItem('yuelao_device_id') ?? ''
    const cancelled = params.get('cancelled') === '1'
    setOrderNo(nextOrderNo)
    setDeviceId(nextDeviceId)

    if (!nextOrderNo || !nextDeviceId) {
      setState('error')
      setMessage('找不到这笔订单，请返回首页重新操作。')
      return
    }

    let stopped = false
    let attempts = 0

    async function check() {
      try {
        const query = new URLSearchParams({ order_no: nextOrderNo, device_id: nextDeviceId })
        const response = await fetch(`/api/stripe/order-status?${query}`, { cache: 'no-store' })
        const data = await response.json()
        if (!response.ok || !data.ok) throw new Error(data.error)

        if (data.order.status === 'done') {
          if (data.order.kind === 'draw') {
            const note = data.order.result?.note ?? data.order.result
            if (!note?.contact) throw new Error('draw_result_missing')
            localStorage.setItem(PENDING_REVEAL_KEY, JSON.stringify(note))
            window.location.replace('/?payment=success')
            return
          }
          setState('paid')
          setMessage('支付成功，纸条已经放进盲盒！')
          return
        }

        if (data.order.status === 'void') {
          setState('error')
          setMessage(data.order.result?.refunded ? '订单未能完成，款项已自动退款。' : '订单已失效，请返回首页重新操作。')
          return
        }

        if (cancelled) {
          setState('cancelled')
          setMessage('你已取消支付，这笔订单仍可继续付款。')
          return
        }

        attempts += 1
        if (attempts >= 45) {
          setState('error')
          setMessage('支付结果仍在同步，请稍后刷新此页面。')
          return
        }
        if (!stopped) setTimeout(check, 1000)
      } catch {
        attempts += 1
        if (attempts >= 8) {
          setState('error')
          setMessage('暂时无法确认支付结果，请稍后刷新。')
        } else if (!stopped) {
          setTimeout(check, 1200)
        }
      }
    }

    check()
    return () => { stopped = true }
  }, [])

  async function retryPayment() {
    setState('checking')
    setMessage('正在打开 Stripe 安全收银台…')
    try {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_no: orderNo, device_id: deviceId }),
      })
      const data = await response.json()
      if (!response.ok || !data.url) throw new Error(data.error)
      window.location.assign(data.url)
    } catch {
      setState('error')
      setMessage('暂时无法打开收银台，请返回首页重试。')
    }
  }

  return (
    <main className="wrap">
      <header className="hero">
        <span className="knot">🪢</span>
        <h1>月老盲盒</h1>
      </header>
      <div className="form-card ok-panel" aria-live="polite">
        <span className="emoji">{state === 'paid' ? '🧧' : state === 'checking' ? '⌛' : '💌'}</span>
        <h2>{state === 'paid' ? '支付成功' : '支付结果'}</h2>
        <p>{message}</p>
        {state === 'cancelled' && (
          <button className="btn btn-red" style={{ marginTop: 16 }} onClick={retryPayment}>
            继续支付 RM2
          </button>
        )}
        <a className="btn btn-plain" style={{ display: 'inline-block', marginTop: 12, textDecoration: 'none' }} href="/">
          返回首页
        </a>
      </div>
    </main>
  )
}
