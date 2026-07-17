---
name: uniapp-usage
description: >-
  本仓库 uniapp 客户端业务开发完整用法：脚本、别名、API/token、页面、防连点、注意点。
  Use when editing uniapp/ pages, stores, or client API usage in this repo.
---

# UniApp 用法（业务开发）

> **范围**：本仓库 `uniapp/` 客户端业务。

## 能做什么

| 能力 | 说明 |
|------|------|
| 多端 | H5 / 微信小程序等（见 `package.json` scripts） |
| 调后端 App API | `request` / `service`（EPS）→ service 的 `/app` 或 `/api` 侧 |
| 登录态 | token + refresh；Better Auth（`auth-client`）按现有页扩展 |
| 路由鉴权 | `utils/route-auth` 等与 `ensureFreshToken` |

## 命令

```bash
cd uniapp
bun install
bun run dev:h5            # H5（常用）
bun run dev:mp-weixin     # 微信小程序
bun run build:h5          # 其它端见 package.json
bun run type-check
```

需 **service 已启动**。代理：`src/config/proxy.ts`（`/dev`、`/prod`）。Auth 与业务均走 `config.baseUrl`；线上 Nginx 剥前缀即可。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `uniapp/src/`（业务优先） |
| `/@` | `vome-core` **client**（`configureClient` / `createEps` / `getService`） |
| `/#` | `vome-core` dist；`/#/typings/*` → typings |

## 目录习惯

```
uniapp/src/
  pages/              # 与 pages.json 对应
  windows/            # 自定义窗体等
  stores/             # Pinia（如 user）
  api/client.ts       # request、token、bootEps、service
  lib/auth-client.ts  # Better Auth 客户端
  config/             # proxy、config
  utils/              # route-auth 等
```

- `pages.json` / `manifest.json`：JSONC（仓库已配 files.associations）
- 启动：`main.ts` 里 `bootEps`、`ensureFreshToken`（以现文件为准）

## 可以用什么

### API 客户端（`@/api/client`）

| 导出 | 怎么用 |
|------|--------|
| `request(path, options)` | 通用请求；自动带 token、可刷新 |
| `service` | EPS 生成的类型化服务（`getService()`） |
| `apiUrl(path)` | 拼完整 URL |
| `getAccessToken` / `getRefreshToken` | 读本地 token |
| `setTokens` / `clearTokens` | 写入/清理（优先走 `useUserStore`） |
| `ensureFreshToken` / `refreshAccessToken` | 保证可用 access |
| `bootEps` | 启动时拉 EPS |

业务页示例：

```ts
import { request, service } from '@/api/client'

await request('/app/xxx', { method: 'POST', body: JSON.stringify({ ... }) })
// 或
await service.xxx.yyy(...)
```

路径与 **service 的 app 控制器**一致；开发走 uni/vite 代理到本机 service。

### 用户与登录

- Store：`stores/user.ts`（token、用户信息）
- 登录页：`pages/login/login.vue`（跟现有 Better Auth / 账密流程扩展）
- 未登录跳转：`redirectLogin` / `route-auth` 逻辑，新增页勿绕开

### 页面

- 新页面：加 `pages/...` + 在 `pages.json` 注册
- TabBar：改 `pages.json` tabBar 配置
- 组件：优先复用现有；需要框架 client 能力时用 `/@`

### 请求按钮防连点（强制）

登录、提交、支付等会打接口的按钮：`submitting`/`loading` + `:disabled`，`finally` 释放。

## 需要注意什么

1. **service 未开 / proxy 指错** → 登录与接口失败。
2. **业务代码放 `@/`**；不要改 `packages/vome-core` 来满足单页需求。
3. **token 过期**：走现有 refresh 队列，勿另起一套存储 key。
4. **H5 与小程序差异**：存储用项目 `storage` 封装；原生 API 注意条件编译。
5. **改 core client 后**需 `vome-core` build。
6. **document title**（H5）：以项目已有 `lockDocumentTitle` / `globalStyle` 为准，勿随意覆盖。
7. 提交类按钮一律防连点。
