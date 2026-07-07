# 月老盲盒 🪢

线上版「月老盲盒 / 脱单盲盒」:**存一张纸条,抽一段缘分**。

- 💌 **存纸条**:留下昵称、年龄、城市、爱好、微信号和一句话,放进男生盒或女生盒
- 🎁 **抽纸条**:从异性盒子里随机抽一张,抽中才能看到对方联系方式;可**按城市筛选**同城缘分,界面实时显示今日剩余次数
- 🔗 **分享**:一键调起系统分享面板(手机可直接分享到微信),不支持时自动复制链接
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

数据库对象全部使用 `yuelao_` 前缀:表 `yuelao_notes` / `yuelao_draws` / `yuelao_reports`,
函数 `yuelao_submit_note` / `yuelao_draw_note` / `yuelao_report_note` / `yuelao_withdraw_note` / `yuelao_stats`。
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
