-- Stripe Checkout 的外部标识只允许服务端读写。表已经启用 RLS 且无公开策略。
alter table public.yuelao_orders
  add column if not exists stripe_session_id text,
  add column if not exists stripe_payment_intent_id text;

create unique index if not exists yuelao_orders_stripe_session_idx
  on public.yuelao_orders (stripe_session_id)
  where stripe_session_id is not null;

create unique index if not exists yuelao_orders_stripe_payment_intent_idx
  on public.yuelao_orders (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

comment on column public.yuelao_orders.stripe_session_id is
  'Stripe Checkout Session ID; server-only';
comment on column public.yuelao_orders.stripe_payment_intent_id is
  'Stripe PaymentIntent ID; server-only';

-- 马来西亚 Stripe 最低收款金额为 RM2。先保留 mock 模式，待测试完成后手动切换。
update public.yuelao_pay_config
set put_fen = 200,
    draw_fen = 200,
    updated_at = now()
where id = 1;

-- 订单确认只能由持有 Supabase 后台密钥的服务端调用。
revoke execute on function public.yuelao__confirm_order(uuid)
  from public, anon, authenticated;
grant execute on function public.yuelao__confirm_order(uuid)
  to service_role;
