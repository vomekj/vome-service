---
name: web-usage
description: >-
  Web 客户端：vome-core/client API、EPS service、token、路由、防连点。
  Use when editing web/ pages, stores, or client API usage.
---

# Web 用法（业务开发）

> **范围**：`web/` C 端 Vue 站（不是 admin）。客户端能力来自 **`vome-core/client`**（别名 `/@`）。

## IDE

Snippets / Skills 约定见入口 [AGENTS.md](../AGENTS.md)；`.vscode` 需移到**项目根**才生效。

## Core（client）能力一览

| 能力 | API | 说明 |
|------|-----|------|
| 配置客户端 | `configureClient` | baseUrl、token 存取等 |
| EPS | `createEps({ side: 'app', force? })` | 拉接口描述，生成类型化 `service` |
| 取服务 | `getService()` / 宿主导出的 `service` | `service.user.info.get()` 等 |
| 请求封装 | 宿主 `request`（基于 client） | 带 token、401 刷新 |

业务路径对齐 **service `controller/app`**。

## 命令

```bash
cd web
bun install
bun run dev              # 需先启动 service
```

代理：`src/config/proxy.ts`。Auth 与业务均走 `config.baseUrl`；线上 Nginx 剥前缀转到 `/api/auth`、`/app`。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `web/src/` |
| `/@` | `vome-core` **client**（不是 admin CRUD） |
| `/#` | core 相关 typings / dist（以项目为准） |

## 目录

```
web/src/
  pages/              # login、mine…
  components/
  stores/             # Pinia：user（info/get）、app（壳层）
  router/
  api/client.ts       # request、token、bootEps、service
  lib/auth-client.ts  # Better Auth
  config/
```

启动：`main.ts` 里 `bootEps()`（内部 `createEps({ side: 'app' })`）再挂载应用。

## API 怎么用

| 导出（`@/api/client`） | 用法 |
|------------------------|------|
| `request<T>(path, init?)` | App 请求；自动 token；可 `skipRefresh` |
| `service` | EPS 对象，如 `service.user.info.get()` |
| `apiUrl` | 拼完整 URL |
| `getAccessToken` / `getRefreshToken` | 读存储 |
| `setTokens` / `clearTokens` | 写/清 |
| `ensureFreshToken` | 进页前保证 access 可用 |
| `bootEps` / `createEps` | 拉/刷新 EPS |

```ts
import { request, service, getAccessToken } from '@/api/client'

await request('/app/user/login/refreshToken', {
  method: 'POST',
  body: JSON.stringify({ refreshToken }),
  skipRefresh: true,
})

await service.user.info.get()
```

### 用户 Store

| 字段 / 方法 | 说明 |
|-------------|------|
| `info` | 当前用户信息（勿用已删除的 `profile`） |
| `get()` | 拉取用户（勿用已删除的 `fetchPerson`） |
| token 相关 | 与 `api/client` 同一套 key |

`appStore` 管 Tab / 布局等壳状态，**不要**与 `userStore` 合并。

### 认证

- Better Auth：`authClient.signIn…` / `getSession`（`lib/auth-client.ts`）
- 自有 JWT：`setTokens` + 请求头；对齐后端 `/app/user/...`
- 未登录：`redirectLogin`（带 `redirect` 查询参数）

### 路由

跟现有 `router/` 加页 + 登录守卫；不要绕开 token 校验。

### UI

跟随现有 web 风格。**不要**把 admin 的 `vm-crud` 硬搬进 web。

## 请求按钮防连点（强制）

```ts
const submitting = ref(false)
async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  try {
    await request(...)
  } finally {
    submitting.value = false
  }
}
```

## 注意

1. service 未开 / 代理错 → 登录与接口失败。
2. `/@` 是 **client**，不是 admin。
3. token key 以 `api/client.ts` 为准，勿另起多套。
4. 生产 host 看 `config`，不要写死仅本地 proxy。
5. 升级 `vome-core` 后 `bun install`，按 client API 调整调用。

在线细文档：`/web/api`、`/web/auth`、`/web/stores`。
