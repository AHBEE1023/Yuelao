# 月老盲盒 🪢

线上版「月老盲盒 / 脱单盲盒」:**存一张纸条,抽一段缘分**。

- 💌 **存纸条**:留下昵称、年龄、城市、爱好、微信号和一句话,放进男生盒或女生盒
- 💰 **RM2 付费玩法**:存入与抽取均通过 Stripe Checkout 以马币收费(价格/免费额度后台可配),经过服务端订单与支付校验后才执行,联系方式付费抽中才可见
- 🎁 **抽纸条**:从异性盒子里随机抽一张,抽中才能看到对方联系方式;可**按城市筛选**同城缘分,界面实时显示今日剩余次数
- 🔗 **分享**:一键调起系统分享面板(手机可直接分享到微信),不支持时自动复制链接
- 📱 **可安装(PWA)**:支持"添加到主屏幕",像原生 App 一样全屏打开,配月老红线专属图标
- 🛠️ **运营后台**(`/admin`):密码登录,查看数据概览、审核被举报的纸条、一键下架/恢复、修改密码
- 📋 **我的纸条**:查看自己存过的纸条被抽走了几次,并可随时**撤回**(撤回后不再进入盒子)
- 🚩 **举报**:抽到不合适的纸条可按理由(广告 / 虚假 / 骚扰 / 其他)举报,3 个设备举报即自动下架

## 技术栈

- **前端**:Next.js 15 (App Router) + React 19,纯 CSS,无 UI 库
- **服务端**:Next.js Route Handlers + Supabase (Postgres)
- **支付**:Stripe Checkout + 签名 Webhook,币种 MYR

## 防滥用设计

所有业务规则都在数据库端强制执行(security definer RPC),前端只是调用方:

| 规则 | 实现 |
| --- | --- |
| 联系方式不可被爬取 | 三张表全部启用 RLS 且**无任何策略**,anon key 无法直接读写表,只能调 RPC;抽中一张才返回一个联系方式 |
| 每设备每天最多抽 5 次 / 存 3 张 | RPC 内按 `device_id` + 北京时间日期计数 |
| 不会抽到自己 / 不会重复抽到同一人 | 抽取 SQL 排除自己的纸条和已抽记录(唯一索引兜底) |
| 广告与违规内容 | RPC 内敏感词 + 链接过滤,命中直接拒绝 |
| 举报下架 | 只能举报自己抽到过的纸条,3 个不同设备举报即自动隐藏 |
| 撤回纸条 | 只能撤回自己设备存放的纸条;撤回不返还当日额度,避免刷额度 |

数据库对象全部使用 `yuelao_` 前缀:表 `yuelao_notes` / `yuelao_draws` / `yuelao_reports` / `yuelao_admin`,
用户函数 `yuelao_submit_note` / `yuelao_draw_note` / `yuelao_report_note` / `yuelao_withdraw_note` / `yuelao_stats`,
后台函数 `yuelao_admin_login` / `yuelao_admin_overview` / `yuelao_admin_list` / `yuelao_admin_set_status` / `yuelao_admin_set_password`。

## 付费与订单

存入/抽取通过订单系统收费,所有金额与"执行动作"都在服务端确认:

- 表 `yuelao_pay_config`(价格/免费额度/支付方式)、`yuelao_orders`(订单)。
- `yuelao_create_order` 先校验(敏感词、字段、每日上限、盒子是否有可抽的纸条)再定价;
  免费额度内直接完成,否则返回待支付订单。
- 支付确认后才真正插入纸条 / 执行抽取:确认逻辑集中在内部函数 `yuelao__confirm_order`
  (加行锁、幂等重放、抽空自动作废),由 `yuelao_create_order` 免费路径、`yuelao_pay_order`
  (mock 确认入口)和 Stripe webhook **共用同一套逻辑**,避免回调重试导致重复执行。
- `yuelao_create_order` 按 `device_id` 事务级串行(`pg_advisory_xact_lock`),消除免费额度/每日
  上限的并发竞态;待支付订单默认 15 分钟过期,打开 Stripe Checkout 后与收银台同步延长到
  31 分钟;订单计入每日上限并有堆积上限,防止刷单与锁价套利。
- Stripe Checkout Session 与 PaymentIntent ID 记录在订单上并建立唯一索引;Webhook 先验签,再校验
  `MYR` 币种、金额、订单及 Session 绑定关系。支付成功但订单无法完成时会发起幂等退款。
- 内部确认 RPC 仅授予 `service_role`;Stripe 密钥和 Supabase 后台密钥只存在 Vercel 服务端。
- 当前默认仍为 `mock` 模拟收银台。部署、迁移与 Webhook 测试完成后,才把
  `yuelao_pay_config.mode` 切换为 `stripe`,避免未配置完整时影响线上用户。

后台「计费设置」可随时调整存入/抽取价格与每日免费次数,并查看今日/累计收入。

## 运营后台

访问 `/admin`,用管理密码登录。密码以 bcrypt 哈希存在 `yuelao_admin` 表(RLS 开启无策略,
公开 key 读不到哈希);所有后台 RPC 都在数据库端校验密码后才返回数据或执行操作。
初始密码由部署者设置,登录后可在后台「改密码」处修改(新密码至少 8 位)。
建表与函数的完整 SQL 见 Supabase 项目里名为 `create_yuelao_blind_box` 的 migration。

## 本地运行

```bash
npm install
npm run dev
```

Supabase 的 URL 和 publishable key(本就是公开的客户端 key)在 `lib/supabase.js`
里有默认值。Stripe Checkout 还需要复制 `.env.example` 为 `.env.local`,填写
`SUPABASE_SECRET_KEY`、`STRIPE_SECRET_KEY` 和 `STRIPE_WEBHOOK_SECRET`。所有后台密钥都不得
使用 `NEXT_PUBLIC_` 前缀或提交到 Git。

## 部署

部署到 Vercel 前后按以下顺序操作:

1. 在 Supabase SQL Editor 执行 `supabase/migrations/*_stripe_myr_checkout.sql`。
2. 在 Vercel 设置 `SUPABASE_SECRET_KEY` 与 Stripe 测试模式的 `STRIPE_SECRET_KEY`。
3. 部署后在 Stripe Workbench 创建 Webhook Endpoint:
   `https://你的域名/api/stripe/webhook`。监听
   `checkout.session.completed`、`checkout.session.async_payment_succeeded`、
   `checkout.session.expired`,并把签名密钥设为 Vercel 的 `STRIPE_WEBHOOK_SECRET`。
4. 重新部署,使用 Stripe 测试卡完整测试存入、抽取、取消支付和重复 Webhook。
5. 测试通过后执行:

```sql
update public.yuelao_pay_config
set mode = 'stripe', put_fen = 200, draw_fen = 200, updated_at = now()
where id = 1;
```

价格字段沿用旧名称 `*_fen`,在 MYR 模式下实际表示 sen;`200` 即 RM2。切换正式模式前,
把 Vercel 密钥替换成 Stripe Live key,并为正式模式 Endpoint 设置对应的 Live webhook secret。

## 免责声明

月老只负责牵线,不核实身份。请勿轻信转账、投资、刷单等要求,谨防诈骗。
