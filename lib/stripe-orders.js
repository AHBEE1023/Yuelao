import 'server-only'

import { getStripe, getSupabaseAdmin } from './server-clients'

function paymentIntentId(session) {
  if (typeof session.payment_intent === 'string') return session.payment_intent
  return session.payment_intent?.id ?? null
}

export async function fulfillCheckoutSession(session) {
  const orderId = session?.metadata?.order_id
  if (!orderId || session.mode !== 'payment' || session.payment_status !== 'paid') {
    return { ok: false, error: 'unpaid_or_invalid_session' }
  }

  const supabase = getSupabaseAdmin()
  const { data: order, error: orderError } = await supabase
    .from('yuelao_orders')
    .select('id, order_no, amount_fen, status, result, stripe_session_id')
    .eq('id', orderId)
    .maybeSingle()

  if (orderError) throw orderError
  if (!order) return { ok: false, error: 'order_not_found' }
  if (order.stripe_session_id !== session.id) return { ok: false, error: 'session_mismatch' }
  if (session.currency?.toLowerCase() !== 'myr' || session.amount_total !== order.amount_fen) {
    return { ok: false, error: 'amount_mismatch' }
  }

  const intentId = paymentIntentId(session)
  if (intentId) {
    const { error } = await supabase
      .from('yuelao_orders')
      .update({ stripe_payment_intent_id: intentId })
      .eq('id', order.id)
    if (error) throw error
  }

  if (order.status === 'done') return { ok: true, result: order.result, replay: true }
  if (order.status === 'void') return refundFailedOrder(session, order, 'order_void')

  const { data: result, error: confirmError } = await supabase.rpc('yuelao__confirm_order', {
    p_order_id: order.id,
  })
  if (confirmError) throw confirmError
  if (result?.ok) return { ok: true, result }

  return refundFailedOrder(session, order, result?.error ?? 'order_confirmation_failed')
}

async function refundFailedOrder(session, order, reason) {
  const intentId = paymentIntentId(session)
  if (!intentId) throw new Error('missing_payment_intent_for_refund')

  const stripe = getStripe()
  const refund = await stripe.refunds.create(
    {
      payment_intent: intentId,
      metadata: { order_id: order.id, order_no: order.order_no, reason },
    },
    { idempotencyKey: `yuelao-refund-${session.id}` },
  )

  const result = { ok: false, error: reason, refunded: true, refund_id: refund.id }
  const { error } = await getSupabaseAdmin()
    .from('yuelao_orders')
    .update({ status: 'void', result, stripe_payment_intent_id: intentId })
    .eq('id', order.id)
    .neq('status', 'done')
  if (error) throw error

  return result
}

export async function expireCheckoutOrder(sessionId) {
  const { error } = await getSupabaseAdmin()
    .from('yuelao_orders')
    .update({ status: 'void', result: { ok: false, error: 'order_expired' } })
    .eq('stripe_session_id', sessionId)
    .eq('status', 'pending')
  if (error) throw error
}
