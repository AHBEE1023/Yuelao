import { NextResponse } from 'next/server'

import { getSiteUrl, getStripe, getSupabaseAdmin } from '../../../../lib/server-clients'
import { expireCheckoutOrder, fulfillCheckoutSession } from '../../../../lib/stripe-orders'

export const runtime = 'nodejs'

function jsonError(error, status = 400) {
  return NextResponse.json({ ok: false, error }, { status })
}

export async function POST(request) {
  try {
    const body = await request.json()
    const orderNo = typeof body.order_no === 'string' ? body.order_no.trim() : ''
    const deviceId = typeof body.device_id === 'string' ? body.device_id.trim() : ''
    if (!orderNo || orderNo.length > 100 || !deviceId || deviceId.length > 100) return jsonError('bad_input')

    const supabase = getSupabaseAdmin()
    const [{ data: config, error: configError }, { data: order, error: orderError }] = await Promise.all([
      supabase.from('yuelao_pay_config').select('mode').eq('id', 1).single(),
      supabase
        .from('yuelao_orders')
        .select('id, order_no, kind, amount_fen, status, expires_at, stripe_session_id')
        .eq('order_no', orderNo)
        .eq('device_id', deviceId)
        .maybeSingle(),
    ])

    if (configError || orderError) throw configError || orderError
    if (config?.mode !== 'stripe') return jsonError('stripe_disabled', 409)
    if (!order) return jsonError('no_order', 404)

    const baseUrl = getSiteUrl(request)
    const encodedOrderNo = encodeURIComponent(order.order_no)
    const resultUrl = `${baseUrl}/payment/success?order_no=${encodedOrderNo}`

    if (order.status === 'done') return NextResponse.json({ ok: true, url: resultUrl })
    if (order.status !== 'pending') return jsonError('order_void', 409)
    if (order.expires_at && new Date(order.expires_at).getTime() <= Date.now()) {
      const { error: expireError } = await supabase
        .from('yuelao_orders')
        .update({ status: 'void', result: { ok: false, error: 'order_expired' } })
        .eq('id', order.id)
        .eq('status', 'pending')
      if (expireError) throw expireError
      return jsonError('order_expired', 409)
    }
    if (!Number.isInteger(order.amount_fen) || order.amount_fen < 200) {
      return jsonError('amount_below_stripe_minimum', 409)
    }

    const stripe = getStripe()
    if (order.stripe_session_id) {
      const existing = await stripe.checkout.sessions.retrieve(order.stripe_session_id)
      if (existing.payment_status === 'paid') {
        await fulfillCheckoutSession(existing)
        return NextResponse.json({ ok: true, url: resultUrl })
      }
      if (existing.status === 'open' && existing.url) {
        return NextResponse.json({ ok: true, url: existing.url })
      }
      if (existing.status === 'expired') await expireCheckoutOrder(existing.id)
      return jsonError('order_void', 409)
    }

    // Stripe Checkout 的 expires_at 至少要在 30 分钟后，数据库订单同步延长到 31 分钟。
    const expiresAtUnix = Math.floor(Date.now() / 1000) + 31 * 60
    const expiresAt = new Date(expiresAtUnix * 1000).toISOString()
    const { error: expiryError } = await supabase
      .from('yuelao_orders')
      .update({ expires_at: expiresAt })
      .eq('id', order.id)
      .eq('status', 'pending')
    if (expiryError) throw expiryError

    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: order.id,
        expires_at: expiresAtUnix,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'myr',
              unit_amount: order.amount_fen,
              product_data: {
                name: order.kind === 'draw' ? '月老盲盒 · 抽一张纸条' : '月老盲盒 · 存一张纸条',
              },
            },
          },
        ],
        metadata: { order_id: order.id, order_no: order.order_no },
        payment_intent_data: { metadata: { order_id: order.id, order_no: order.order_no } },
        success_url: `${resultUrl}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${resultUrl}&cancelled=1`,
      },
      { idempotencyKey: `yuelao-checkout-${order.id}` },
    )

    if (!session.url) throw new Error('stripe_session_missing_url')
    const { error: saveError } = await supabase
      .from('yuelao_orders')
      .update({ stripe_session_id: session.id, expires_at: expiresAt })
      .eq('id', order.id)
      .eq('status', 'pending')

    if (saveError) {
      await stripe.checkout.sessions.expire(session.id)
      throw saveError
    }

    return NextResponse.json({ ok: true, url: session.url })
  } catch (error) {
    console.error('stripe_checkout_error', error?.message ?? error)
    return jsonError('checkout_unavailable', 500)
  }
}
