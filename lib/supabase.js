import { createClient } from '@supabase/supabase-js'

// publishable key 是客户端公开 key;数据表全部启用 RLS 且无策略,
// 只能通过 security definer RPC 访问,联系方式无法被批量读取。
const url =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://tvgwvtbtiwvfpiqyfivy.supabase.co'
const key =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'sb_publishable_fJHtoVpVHEfilrf4H7NHJw_vTI4mQO3'

export const supabase = createClient(url, key)

export function getDeviceId() {
  if (typeof window === 'undefined') return null
  let id = localStorage.getItem('yuelao_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('yuelao_device_id', id)
  }
  return id
}
