---
name: uniapp-usage
description: >-
  UniApp 客户端：vome-core/client API、EPS service、token、页面、防连点。
  Use when editing uniapp/ pages, stores, or client API usage.
---

# UniApp 用法（业务开发）

> **范围**：`uniapp/` 多端业务。客户端能力来自 **`vome-core/client`**（别名 `/@`）。

## IDE

见入口 [AGENTS.md](../AGENTS.md)：`.vscode` 移项目根；Skills 可迁 `.cursor/skills/`。

## Core（client）能力一览

| 能力 | API | 说明 |
|------|-----|------|
| 配置 | `configureClient` | baseUrl、存储适配 |
| EPS | `createEps({ side: 'app', force?, requireRoot? })` | 生成 `service` |
| 取服务 | `getService()` | 类型化调用 app 接口 |
| 请求 | 宿主 `request` | token + 刷新队列 |

对齐 **service `controller/app`**。

## 命令

```bash
cd uniapp
bun install
bun run dev:h5            # 常用；需 service 已启动
bun run dev:mp-weixin     # 微信小程序
```

代理：`src/config/proxy.ts`。线上 Nginx 剥前缀即可。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `uniapp/src/` |
| `/@` | `vome-core` **client**（`configureClient` / `createEps` / `getService`） |
| `/#` | typings / dist（以项目为准） |

## 目录

```
uniapp/src/
  pages/              # 与 pages.json 对应
  windows/
  stores/             # user（info/get）、app（壳）
  api/client.ts
  lib/auth-client.ts
  config/
  utils/              # route-auth 等
```

`main.ts`：`bootEps`、`ensureFreshToken`（以现文件为准）。`pages.json` / `manifest.json` 为 JSONC。

## API 怎么用

| 导出（`@/api/client`） | 用法 |
|------------------------|------|
| `request(path, options)` | 通用请求；自动 token、可刷新 |
| `service` | EPS：`service.xxx.yyy(...)` |
| `apiUrl(path)` | 拼 URL |
| `getAccessToken` / `getRefreshToken` | 读本地 |
| `setTokens` / `clearTokens` | 写/清（优先经 `useUserStore`） |
| `ensureFreshToken` / `refreshAccessToken` | 保证 access |
| `bootEps` | 启动拉 EPS |

```ts
import { request, service } from '@/api/client'

await request('/app/xxx', { method: 'POST', body: JSON.stringify({ ... }) })
await service.user.info.get()
```

### 用户与登录

| 项 | 用法 |
|----|------|
| `stores/user.ts` | `info`、`get()`（勿用旧名 `profile` / `fetchPerson`） |
| `stores/app.ts` | Tab / 壳状态，与 user 分离 |
| 登录页 | `pages/login/login.vue`；Better Auth / 账密跟现有扩展 |
| 未登录 | `redirectLogin` / `route-auth`，新页勿绕开 |

### 页面

- 新页：`pages/...` + `pages.json` 注册
- TabBar：改 `pages.json` tabBar
- 需要 client 能力时用 `/@`，业务代码放 `@/`

## 请求按钮防连点（强制）

登录、提交、支付等：`submitting`/`loading` + `:disabled`，`finally` 释放。

## 注意

1. service 未开 / proxy 错 → 接口失败。
2. 业务代码放 `@/`。
3. token 走现有 refresh 与存储 key，勿另起一套。
4. H5 / 小程序：存储用项目封装；原生 API 注意条件编译。
5. 升级 `vome-core`：`bun install` 后按 client API 调整。
6. H5 document title 跟现有 `lockDocumentTitle` / `globalStyle`，勿随意覆盖。

在线细文档：`/uniapp/api`、`/uniapp/auth`、`/uniapp/stores`。
