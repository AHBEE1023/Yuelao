# 月老盲盒 🪢

线上版「月老盲盒 / 脱单盲盒」:**存一张纸条,抽一段缘分**。

- 💌 **存纸条**:留下昵称、年龄、城市、爱好、微信号和一句话,放进男生盒或女生盒
- 💰 **付费玩法**:存入与抽取均可收费(价格/免费额度后台可配),经过服务端订单校验后才执行,联系方式付费抽中才可见
- 🎁 **抽纸条**:从异性盒子里随机抽一张,抽中才能看到对方联系方式;可**按城市筛选**同城缘分,界面实时显示今日剩余次数
- 🔗 **分享**:一键调起系统分享面板(手机可直接分享到微信),不支持时自动复制链接
- 📱 **可安装(PWA)**:支持"添加到主屏幕",像原生 App 一样全屏打开,配月老红线专属图标
- 🛠️ **运营后台**(`/admin`):密码登录,查看数据概览、审核被举报的纸条、一键下架/恢复、修改密码
- 📋 **我的纸条**:查看自己存过的纸条被抽走了几次,并可随时**撤回**(撤回后不再进入盒子)
- 🚩 **举报**:抽到不合适的纸条可按理由(广告 / 虚假 / 骚扰 / 其他)举报,3 个设备举报即自动下架

## 技术栈

- **前端**:Next.js 15 (App Router) + React 19,纯 CSS,无 UI 库
- **后端**:Supabase (Postgres),无独立服务端

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
  (mock 确认入口)、以及未来真支付 webhook **共用同一套逻辑**,避免网关重试导致重复执行。
- `yuelao_create_order` 按 `device_id` 事务级串行(`pg_advisory_xact_lock`),消除免费额度/每日
  上限的并发竞态;待支付订单 15 分钟过期、计入每日上限并有堆积上限,防止刷单与锁价套利。
- **上线切换须同步**:付费前端上线时,必须同时收回旧的免费 `yuelao_submit_note` /
  `yuelao_draw_note` 对 anon 的执行权限(当前线上仍是免费前端,故这两个接口暂时保留授权;
  收回与前端切换同步进行,避免出现"能绕过付费"的空窗)。
- **接入真支付**:把 `yuelao_pay_config.mode` 改为 `wechat`/`alipay`/`stripe`,并实现对应网关下单 +
  webhook 验签(需商户号、API 密钥、ICP 备案域名);当前默认 `mock` 模拟收银台,便于开发联调。

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
里有默认值,开箱即用;也可以复制 `.env.example` 为 `.env.local` 覆盖,
指向你自己的 Supabase 项目。

## 部署

标准 Next.js 应用,直接部署到 Vercel 即可,无需配置任何环境变量
(如需指向别的 Supabase 项目,设置 `NEXT_PUBLIC_SUPABASE_URL` 和
`NEXT_PUBLIC_SUPABASE_ANON_KEY`)。

## 免责声明

月老只负责牵线,不核实身份。请勿轻信转账、投资、刷单等要求,谨防诈骗。
