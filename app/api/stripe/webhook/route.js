import { NextResponse } from 'next/server'

import { getStripe } from '../../../../lib/server-clients'
import { expireCheckoutOrder, fulfillCheckoutSession } from '../../../../lib/stripe-orders'

export const runtime = 'nodejs'

export async function POST(request) {
  const signature = request.headers.get('stripe-signature')
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!signature || !webhookSecret) {
    return NextResponse.json({ received: false }, { status: 400 })
  }

  let event
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, webhookSecret)
  } catch (error) {
    console.error('stripe_webhook_signature_error', error?.message ?? error)
    return NextResponse.json({ received: false }, { status: 400 })
  }

  try {
    if (
      (event.type === 'checkout.session.completed' && event.data.object.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const result = await fulfillCheckoutSession(event.data.object)
      if (!result.ok && !result.refunded) throw new Error(result.error)
    } else if (event.type === 'checkout.session.expired') {
      await expireCheckoutOrder(event.data.object.id)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    // 返回 500 让 Stripe 自动重试，数据库确认与退款都使用幂等键。
    console.error('stripe_webhook_processing_error', event.id, error?.message ?? error)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}
