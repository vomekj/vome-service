---
name: web-usage
description: >-
  本仓库 web 客户端业务开发完整用法：脚本、别名、API/token、路由、防连点、注意点。
  Use when editing web/ pages, stores, or client API usage in this repo.
---

# Web 用法（业务开发）

> **范围**：本仓库 `web/` 客户端业务（浏览器 Vue 站，不是 admin 后台）。

## 能做什么

| 能力 | 说明 |
|------|------|
| 用户站页面 | Vue3 + Vite + 路由 + Pinia |
| 调后端 App API | `request` / EPS `service` → service app 侧 |
| 登录态 | access/refresh token；Better Auth（`authClient`） |
| EPS | `bootEps`；开发可热更新绑定 |

## 命令

```bash
cd web
bun install
bun run dev              # Vite；需先启动 service
bun run build            # type-check + build
bun run preview
bun run type-check
```

代理：`src/config/proxy.ts`（`/dev`、`/prod` → service）。Auth 与业务 API 均走 `config.baseUrl`；线上 Nginx 需剥前缀转到后端 `/api/auth`、`/app`。

## 路径别名

| 别名 | 指向 |
|------|------|
| `@/` | `web/src/`（业务优先） |
| `/@` | `vome-core` **client** |
| `/#` | `vome-core` dist；`/#/typings/*` → typings |

## 目录习惯

```
web/src/
  pages/              # 页面（login、mine…）
  components/         # 业务组件
  stores/             # Pinia
  router/             # 路由与守卫
  api/client.ts       # request、token、bootEps
  lib/auth-client.ts  # Better Auth
  config/             # proxy、站点配置
```

- 入口 `main.ts`：`bootEps` 等
- 会话：`getAccessToken` / `ensureFreshToken` / `authClient`

## 可以用什么

### API 客户端（`@/api/client`）

| 导出 | 怎么用 |
|------|--------|
| `request<T>(path, init?)` | App 端请求；带 token、401 可刷新 |
| `service` | EPS 服务对象 |
| `apiUrl` | 拼 URL |
| `getAccessToken` / `getRefreshToken` | 读 localStorage |
| `setTokens` / `clearTokens` | 写/清 token |
| `ensureFreshToken` | 启动或进页前保证 token |
| `bootEps` | 拉 EPS |

```ts
import { request, getAccessToken } from '@/api/client'

await request('/app/user/login/refreshToken', {
  method: 'POST',
  body: JSON.stringify({ refreshToken }),
  skipRefresh: true,
})
```

路径对齐 **service `controller/app`**；开发经 Vite 代理。

### 认证

- Better Auth：`lib/auth-client.ts` → `authClient.signIn…` / `getSession`
- 自有 JWT：`setTokens` + 请求头；与后端 `/app/user/...` 约定一致
- 未登录：`redirectLogin`（带 `redirect` 查询参数）

### 路由与状态

- `router/`：路由表 + 登录守卫（跟现有模式加页）
- `stores/user.ts`：用户信息与权限列表（App 侧 perms 来自后端）

### UI

跟随现有 `web` 页面风格扩展。

- **不要**把 admin 的 `vm-crud` 壳层硬搬进 web
- **不要**另起无关设计体系；可复用本站已有组件与 Tailwind/shadcn 用法（以现有页为准）

### 请求按钮防连点（强制）

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

## 需要注意什么

1. **service 未开 / 代理错** → 登录与接口失败。
2. **web ≠ admin**：别名 `/@` 是 **client**，不是 admin CRUD。
3. **token key** 以 `api/client.ts` 为准（如 `vome_web_access`），勿另起多套。
4. **生产 API host** 看 `config`，不要写死仅本地 proxy。
5. **改 core client** 后需 `vome-core` build。
6. 提交类按钮一律防连点。
7. 业务放 `web/src`；未要求不要改 core。
