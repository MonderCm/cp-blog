# cp-blog

> 个人竞赛刷题主页 — 聚合 **Codeforces / AtCoder / 牛客** 三平台的 rating、提交记录和比赛日历。

## 功能

- **三平台 Rating 卡片**:当前 rating、最高 rating、近 N 场曲线
- **提交日志 + 热力图**:按日期聚合的 GitHub 风格 heatmap
- **比赛日历**:抓取三平台未来比赛
- **难度分布 / Top Tags / 连续打卡**:基于提交记录的衍生指标
- **动态壁纸背景**:可在设置里上传 / 替换
- **定时刷新**:`/api/cron/refresh` 由外部 cron 触发(默认每 4 小时)

## 技术栈

| 层 | 选择 |
|----|------|
| 框架 | **Next.js 16.2.6**(App Router,⚠️ 与 15/14 有破坏性差异) |
| UI | React 19 + Tailwind v4 + framer-motion |
| 图表 | recharts 3 |
| 存储 | PostgreSQL + Prisma 5 |
| 爬虫 | Node + Playwright(牛客需要无头浏览器拿数据) |

## 本地启动

```bash
# 1. 装依赖
npm install

# 2. 配置 .env(填 DATABASE_URL)
echo 'DATABASE_URL="postgresql://user:pass@localhost:5432/cpblog"' > .env

# 3. 初始化 DB
npx prisma migrate dev

# 4. 启动
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 目录结构

```
src/
├── app/
│   ├── page.tsx             # 入口(PROFILE 常量在这里改)
│   ├── layout.tsx
│   └── api/
│       ├── contests/        # 比赛日历
│       ├── cron/refresh/    # 定时刷新触发器
│       ├── submissions/     # 提交记录
│       ├── user/            # rating 数据
│       ├── upload-avatar/
│       └── wallpaper-info/
├── components/              # 8 个组件,HomePageClient 为主入口
└── lib/
    ├── cf-api.ts            # Codeforces 客户端
    ├── atc-api.ts           # AtCoder 客户端
    ├── nc-api.ts            # 牛客客户端
    └── prisma.ts            # PrismaClient 单例
prisma/   # schema (User / RatingPoint / Submission / Contest)
scripts/  # 独立爬虫(Python + Node)
```

## 配置个人信息

目前 PROFILE 硬编码在 `src/app/page.tsx`:

```ts
const PROFILE = {
  name: "mus",
  cfUsername: "Nerve_For",
  atcUsername: "Qi_Ye",
  ncUid: "597018199",
  // ...
};
```

替换成自己的 handle 即可。

## ⚠️ Next.js 版本提醒

本项目使用 **Next 16.2.6**,部分 API(如 `cookies()`/`headers()`/动态路由参数)是异步的,与训练数据里 14/15 的写法不同。改代码前请阅读 `node_modules/next/dist/docs/` 中的对应章节。
