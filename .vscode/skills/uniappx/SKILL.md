---
name: uniappx-usage
description: >-
  UniApp X（蒸汽）用法：HBuilder 扁平工程、EPS、登录、语种、Tab 壳、ucss。
  Use when editing uniappx/ pages, stores, or client API usage.
---

# UniApp X 用法（业务开发）

> **范围**：`uniappx/`（**不是**经典 `uniapp/`）。HBuilder 扁平工程 + 蒸汽模式；客户端 **`vome-core/client`**（包名直引，无 `@core` 别名）。与 Web / 经典 UniApp 同为 `side: 'app'`。

官方：https://doc.dcloud.net.cn/uni-app-x/  
合集 Agent 约定：根目录 `.cursor/skills/uniappx/SKILL.md`（更全的红线与分端差异）。

## IDE

见 [AGENTS.md](../AGENTS.md)：`.vscode` 移到**项目根**后 snippet/tasks 才生效。

## 与经典 UniApp 对照（业务侧）

| 项 | 经典 `uniapp/` | `uniappx/` |
|----|----------------|------------|
| 启动 | `bun run dev:h5`（npm Vite） | `bun run dev` → **本机 HBuilderX cli** `launch web` |
| 目录 | `src/` | **根目录扁平**（`pages/`、`components/`…） |
| 依赖解析 | tsconfig `@` / `/@` | **包名** `vome-core/client`（HX 不读 `@core`） |
| UI | tt-shaduni | 轻量 `components/vm-*` + Remix 本地 ttf |
| App 渲染 | WebView | **蒸汽原生管线**（Web/小程序暂仍 VDOM） |

## 命令

```bash
cd uniappx && bun install
# 须本机 HBuilderX / HBuilderV
export HBUILDERX_PATH="/Applications/HBuilderX.app"   # macOS 示例
bun run dev                 # Web，端口见 manifest web.devServer.port（默认 6800）
bun run build               # 发行 H5 → unpackage/
bun run build:mp-weixin
bun run build:app-android
bun run build:app-ios
```

**禁止**在 `uniappx/` 根自建只含 proxy 的 `vite.config.*`（会冲掉 HX 自带 vue/uni 插件）。  
Service：`config/dev.ts` / `prod.ts` 的 `host` / `baseUrl` 直连（默认 `http://127.0.0.1:3000`）。真机/小程序勿用 `127.0.0.1`。

## 目录要点

```
uniappx/
  manifest.json        # uni-app-x + vapor；web.devServer.port
  pages.json
  index.html           # 入口脚本 /main（勿写 /main.js）
  main.ts / App.vue
  pages/**/*.vue       # 组合式 only
  components/vm-*.vue
  stores/ api/ config/ locales/
  static/fonts/remixicon.ttf
  scripts/hx-run.ts
```

easycom：`^vm-(.*)` → `/components/vm-$1.vue`。

## Core（`vome-core/client`）

```ts
import { configureClient, createEps, getService } from 'vome-core/client'

configureClient({ request })
export const service = getService('app')

export async function bootEps(force = false) {
  return createEps({ force, side: 'app', requireRoot: false })
}
```

| API | 用法 |
|-----|------|
| `configureClient({ request })` | 注入宿主 `uni.request` 封装 |
| `createEps({ side: 'app' })` | 拉 EPS |
| `getService('app')` / `service` | 类型化 `service.user.*` |

生命周期用全局 `onLaunch` / `onShow` 等，**不要** `import from '@dcloudio/uni-app'`。  
环境判断用 **`import.meta.env.DEV`**，禁止 `process.env.NODE_ENV`。

## Token / storage / request

`utils/storage.ts` + `api/client.ts`：与经典 UniApp 同类（Bearer、`ensureFreshToken`、refresh 队列、`code === 1000`）。

```ts
await request<T>('/app/user/info/person', { method: 'GET', toast: false })
await service.user.info.person()
apiUrl('/app/user/info/person')   // baseUrl 绝对地址直连 Service
```

登录页密码：`POST /app/user/login/password`（body 字段 **`account`**）。成功后 `goTabShell('mine')`。

## 语种

`stores/locale.ts` → `createLocaleStore`：

- `scopeKey: 'uniappx'`（Service HOST 白名单须含）
- storageKey：`locale`
- 静态包：`locales/zh-CN.json`；HTTP 同步路径对齐 `/static/locales/…`

## Tab / Header（勿叠 DOM）

- Tab **只走** `pages/tabbar` 壳：窄屏 `vm-tabbar`，宽屏壳内 `vm-header`（`useTopNav` / `useTabbarChrome`）。
- `openPage` / `goTabShell` 遇 Tab 路径只进壳 + `setActive`。
- **禁止**按窗口宽度 resize 热切壳 ↔ 子页。
- 业务页包 `<vm-page>`（挂 `theme-light` / `theme-dark`）。

## Stores

| Store | 职责 |
|-------|------|
| `user` | token、`info`、登录 / 登出 |
| `app` | Tab、`isMobile` / `useTopNav`、安全区 |
| `theme` | light/dark（Web 可 View Transition） |
| `locale` | `scopeKey: uniappx` |

## CSS（ucss 安全）

- flex 默认 **竖向**；横向须 `flex-direction: row`
- `display` 仅 `flex` / `none`；文字放 `<text>`
- 页面滚动用 `scroll-view` / `list-view`
- 图标：`vm-ri-icon` + `/static/fonts/remixicon.ttf`（勿原样 `@import` npm remixicon.css）

## 请求按钮

触发 HTTP 的按钮须 `submitting` / `loading` 锁并 `disabled`，见仓库 `request-button-guard` skill。

## Agent 自检

- 新建页 → `.vue` + `<script setup>` + ucss 安全布局 + 需要主题时包 `vm-page`
- 勿用经典 `@dcloudio/vite-plugin-uni` 冒充 App 蒸汽包
- 改通用约定时同步 `docs/vomekj/uniappx/` 与根 `.cursor/skills/uniappx/SKILL.md`
