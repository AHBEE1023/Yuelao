-- ============================================================================
-- 月老盲盒 · 数据库快照(Supabase / Postgres)
-- 这是当前线上库的可复现快照:表、RLS、RPC 函数、授权。
-- 变更以 Supabase 项目里的 migration 为准;本文件用于代码审查与从零重建。
-- 全部对象使用 yuelao_ 前缀,与同库其它应用隔离。
-- 依赖扩展:pgcrypto(装在 extensions schema,用 extensions.crypt/gen_salt 调用)。
-- ============================================================================

-- ---------------- 表 ----------------

create table if not exists public.yuelao_notes (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  gender text not null check (gender in ('male','female')),
  seeking text not null check (seeking in ('male','female')),
  nickname text not null,
  age int not null check (age between 18 and 99),
  city text not null,
  hobbies text not null default '',
  contact text not null,
  message text not null default '',
  status text not null default 'active' check (status in ('active','hidden','withdrawn')),
  draw_count int not null default 0,
  report_count int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists yuelao_notes_box_idx on public.yuelao_notes (gender, status);
create index if not exists yuelao_notes_device_idx on public.yuelao_notes (device_id, created_at);

create table if not exists public.yuelao_draws (
  id bigint generated always as identity primary key,
  device_id text not null,
  note_id uuid not null references public.yuelao_notes(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists yuelao_draws_device_idx on public.yuelao_draws (device_id, created_at);
create unique index if not exists yuelao_draws_device_note_idx on public.yuelao_draws (device_id, note_id);

create table if not exists public.yuelao_reports (
  id bigint generated always as identity primary key,
  note_id uuid not null references public.yuelao_notes(id) on delete cascade,
  device_id text not null,
  reason text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists yuelao_reports_note_device_idx on public.yuelao_reports (note_id, device_id);

create table if not exists public.yuelao_admin (
  id int primary key default 1,
  pass_hash text not null,
  updated_at timestamptz not null default now(),
  constraint yuelao_admin_singleton check (id = 1)
);

create table if not exists public.yuelao_pay_config (
  id int primary key default 1,
  mode text not null default 'mock' check (mode in ('mock','wechat','alipay','stripe')),
  put_fen int not null default 100,
  draw_fen int not null default 100,
  free_puts_per_day int not null default 0,
  free_draws_per_day int not null default 0,
  daily_put_cap int not null default 3,
  daily_draw_cap int not null default 5,
  updated_at timestamptz not null default now(),
  constraint yuelao_pay_config_singleton check (id = 1)
);
insert into public.yuelao_pay_config (id) values (1) on conflict (id) do nothing;

create table if not exists public.yuelao_orders (
  id uuid primary key default gen_random_uuid(),
  order_no text not null unique,
  device_id text not null,
  kind text not null check (kind in ('put','draw')),
  amount_fen int not null,
  status text not null default 'pending' check (status in ('pending','done','void')),
  gender text,
  city text,
  payload jsonb,
  note_id uuid,
  result jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz default (now() + interval '15 minutes'),
  paid_at timestamptz
);
create index if not exists yuelao_orders_device_idx on public.yuelao_orders (device_id, created_at);
create index if not exists yuelao_orders_done_idx on public.yuelao_orders (device_id, kind, status, created_at);

-- ---------------- RLS:全部开启且无策略 ----------------
-- 直接读写表在 anon/authenticated 下被拒;所有访问只能经下面的 security-definer RPC。
alter table public.yuelao_notes enable row level security;
alter table public.yuelao_draws enable row level security;
alter table public.yuelao_reports enable row level security;
alter table public.yuelao_admin enable row level security;
alter table public.yuelao_pay_config enable row level security;
alter table public.yuelao_orders enable row level security;

-- ---------------- 管理密码初始化 ----------------
-- 初始密码由部署者设定;登录后可在后台「改密码」修改。
insert into public.yuelao_admin (id, pass_hash)
values (1, extensions.crypt('CHANGE_ME_ON_DEPLOY', extensions.gen_salt('bf', 10)))
on conflict (id) do nothing;

-- ============================================================================
-- 函数定义:完整实现见 Supabase 项目 migration。以下按用途列出签名与说明。
-- (函数体较长,权威版本以线上 migration 为准;此处保证签名/授权可复现。)
-- ============================================================================
-- 用户侧(anon 可调):
--   yuelao_stats(p_device_id text) -> jsonb                 盒子统计/每日剩余(读 yuelao_pay_config 的上限)
--   yuelao_pay_config_public() -> jsonb                     当前计费配置(mode/价格/免费额度)
--   yuelao_create_order(p_device_id, p_kind, p_gender, p_city, p_payload) -> jsonb
--                                                           校验+定价+每设备串行;免费即刻完成,否则出待支付订单
--   yuelao_pay_order(p_device_id, p_order_no) -> jsonb      mock 支付确认(= 网关 webhook 等价物)
--   yuelao_report_note(p_device_id, p_note_id, p_reason) -> jsonb   举报(3 个设备自动下架)
--   yuelao_withdraw_note(p_device_id, p_note_id) -> jsonb   撤回自己的纸条
-- 内部(对 anon/authenticated/public REVOKE EXECUTE,仅供其它 definer 函数调用):
--   yuelao__do_put / yuelao__do_draw / yuelao__confirm_order / yuelao_admin_ok
-- 旧免费接口(付费上线时对 anon 收回执行权限):
--   yuelao_submit_note(...) / yuelao_draw_note(...)
-- 后台(密码保护):
--   yuelao_admin_login / yuelao_admin_overview / yuelao_admin_list /
--   yuelao_admin_set_status / yuelao_admin_set_password / yuelao_admin_set_pricing

-- 授权基线(付费上线后执行):
--   revoke execute on function public.yuelao_submit_note(...) from anon, authenticated;
--   revoke execute on function public.yuelao_draw_note(text,text,text) from anon, authenticated;
