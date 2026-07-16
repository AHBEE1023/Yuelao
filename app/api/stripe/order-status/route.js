import { NextResponse } from 'next/server'

import { getStripe, getSupabaseAdmin } from '../../../../lib/server-clients'
import { expireCheckoutOrder, fulfillCheckoutSession } from '../../../../lib/stripe-orders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  try {
    const orderNo = request.nextUrl.searchParams.get('order_no')?.trim() ?? ''
    const deviceId = request.nextUrl.searchParams.get('device_id')?.trim() ?? ''
    if (!orderNo || orderNo.length > 100 || !deviceId || deviceId.length > 100) {
      return NextResponse.json({ ok: false, error: 'bad_input' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()
    const select = () => supabase
      .from('yuelao_orders')
      .select('kind, status, result, expires_at, stripe_session_id')
      .eq('order_no', orderNo)
      .eq('device_id', deviceId)
      .maybeSingle()

    let { data: order, error } = await select()
    if (error) throw error
    if (!order) return NextResponse.json({ ok: false, error: 'no_order' }, { status: 404 })

    if (order.status === 'pending' && order.stripe_session_id) {
      const session = await getStripe().checkout.sessions.retrieve(order.stripe_session_id)
      if (session.payment_status === 'paid') await fulfillCheckoutSession(session)
      else if (session.status === 'expired') await expireCheckoutOrder(session.id)

      const refreshed = await select()
      if (refreshed.error) throw refreshed.error
      order = refreshed.data
    }

    return NextResponse.json(
      {
        ok: true,
        order: {
          kind: order.kind,
          status: order.status,
          result: order.result,
          expires_at: order.expires_at,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('stripe_order_status_error', error?.message ?? error)
    return NextResponse.json({ ok: false, error: 'status_unavailable' }, { status: 500 })
  }
}
