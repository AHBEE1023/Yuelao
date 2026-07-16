import 'server-only'

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'

const DEFAULT_SUPABASE_URL = 'https://tvgwvtbtiwvfpiqyfivy.supabase.co'

let stripeClient
let supabaseAdminClient

export function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) throw new Error('missing_stripe_secret_key')

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2026-06-24.dahlia',
      appInfo: { name: 'Yuelao' },
    })
  }
  return stripeClient
}

export function getSupabaseAdmin() {
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secretKey) throw new Error('missing_supabase_secret_key')

  if (!supabaseAdminClient) {
    supabaseAdminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? DEFAULT_SUPABASE_URL,
      secretKey,
      {
        auth: {
          autoRefreshToken: false,
          detectSessionInUrl: false,
          persistSession: false,
        },
      },
    )
  }
  return supabaseAdminClient
}

export function getSiteUrl(request) {
  const configured = process.env.SITE_URL
  const requestOrigin = request?.nextUrl?.origin
  const automatic = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  const candidate = configured || requestOrigin || automatic

  try {
    return new URL(candidate).origin
  } catch {
    throw new Error('invalid_site_url')
  }
}
