---
name: web-usage
description: >-
  Web 客户端完整用法：vome-core/client、EPS、request、token、Better Auth、stores、路由、Socket、防连点。
  Use when editing web/ pages, stores, or client API usage.
---

# Web 用法（业务开发）

> **范围**：`web/` C 端 Vue 站（不是 admin）。客户端来自 **`vome-core/client`**（别名 `/@`）。

## IDE

Snippets / Skills 约定见 [AGENTS.md](../AGENTS.md)：把 `.vscode` **移到项目根**后 snippet/tasks 才生效。

## Core（`vome-core/client`）完整 API

别名 `/@`。Web / UniApp 共用同一套 client 导出。

| API | 用法 |
|-----|------|
| `configureClient({ request })` | 注入宿主请求函数（必做） |
| `getClientRequest()` | 取已注入的 request |
| `createEps({ force?, side, requireRoot? })` | 拉 EPS；Web/Uni 用 `side: 'app'` |
| `bindEpsHotReload(side)` | 开发期 EPS 热更新（Web 常用） |
| `getService(side?)` / `service` | 类型化 API 树 |
| `serviceOf` / `resolveService` | 按路径解析叶子 |
| `setServicePerms` | 绑定权限到 service 树（少用） |
| `BaseService` | EPS 叶子方法基类 |
| `loadEps` / `loadAllEps` / `getEps` / `findEpsEntity` / `clearEpsCache` | EPS 缓存与查询 |

宿主再封装（不在 core，但业务必用）：`request`、`apiUrl`、`bootEps`、`getAccessToken` / `setTokens` / `ensureFreshToken` 等，见下文。

---

## 命令与代理

```bash
cd web && bun install && bun run dev   # 需先启动 service；常见端口 9900
```

`src/config/proxy.ts`：

| 前缀 | 目标 | rewrite |
|------|------|---------|
| `/dev/` | `http://127.0.0.1:3000` | 去掉 `/dev` |
| `/prod/` | 同上（可改） | 去掉 `/prod` |

与 `config.baseUrl`（`/dev` 或 `/prod`）对齐。线上 Nginx 剥前缀转到 `/api/auth`、`/app`。

## 路径别名与目录

| 别名 | 指向 |
|------|------|
| `@/` | `web/src/` |
| `/@` | `vome-core` **client**（不是 admin CRUD） |

```
web/src/
  pages/              # login、home、mine…
  components/
  stores/             # user / app / theme
  router/
  api/client.ts       # request、token、bootEps、service
  lib/auth-client.ts  # Better Auth
  lib/socket.ts       # Socket.IO
  config/
```

## 启动初始化

`main.ts`：

```ts
await bootEps()  // createEps({ side: 'app', requireRoot: false })
```

`api/client.ts`：

```ts
import { configureClient, createEps, getService, bindEpsHotReload } from '/@'

configureClient({ request })
bindEpsHotReload('app')
export const service = getService('app')

export async function bootEps(force = false) {
  return createEps({ force, side: 'app', requireRoot: false })
}
```

Vite：`createEpsVitePlugin({ side: 'app', dtsSide: 'app' })` → `build/eps.json`、`typings/eps.d.ts`。

有 token 时可 `connectWs()`（见下文 Socket）。

## Token

| Key | 存储 | 说明 |
|-----|------|------|
| `vome_web_access` | localStorage | access |
| `vome_web_refresh` | localStorage | refresh |
| `vome_web_user` | localStorage | 用户缓存（`useUserStore`） |

```ts
getAccessToken() / getRefreshToken()
setTokens(access, refresh)
clearTokens()
ensureFreshToken()  // 无 access 时用 refresh 换新
```

刷新：`POST /app/user/login/refreshToken`，body `{ refreshToken }`。

## request

```ts
await request<T>('/app/user/info/person', { method: 'GET', toast: false })
```

| 行为 | 说明 |
|------|------|
| Header | `Authorization: Bearer <access>` |
| 成功 | 业务码 **`code === 1000`**，返回 `data` |
| 401 / 鉴权文案 | 清 token → `/login?redirect=...`；可用 `skipRefresh: true` 跳过刷新逻辑 |
| 错误提示 | 开发默认 `console.warn`；`toast: false` 可关 |

## service（EPS）

优先链式调用（根为 app 模块，无 Admin 的 `base` 前缀）：

```ts
import { service } from '@/api/client'

const person = await service.user.info.person()
await service.user.login.refreshToken({ refreshToken })
await service.user.info.logout({})
```

失败时可回退 `request('/app/...')`。`apiUrl('/app/...')` 开发拼成 `/dev/app/...`；绝对 `http(s)://` 原样返回。

## Better Auth

`lib/auth-client.ts`：

```ts
import { createAuthClient } from 'better-auth/vue'
import { jwtClient, genericOAuthClient } from 'better-auth/client/plugins'

export const authClient = createAuthClient({
  baseURL: authBaseURL, // 必须绝对地址：origin + /dev|/prod
  plugins: [jwtClient(), genericOAuthClient()],
})
```

登录页：`pages/login/index.vue`。

| 能力 | 方法 / 路径 |
|------|-------------|
| 密码登录 | `POST /app/user/login/password` |
| 注册 | `POST /app/user/login/register` |
| 发验证码 | `POST /app/user/login/otpCode` |
| 验证码登录 | `POST /app/user/login/otp` |
| 社交列表 | `GET /app/user/login/socialProviders` |
| SSO | `authClient.signIn.social({ provider, callbackURL })` → 回调 `?sso=1` → `syncBetterAuthJwt` → `setTokens` |

Session → 业务 JWT：

```ts
const token = await syncBetterAuthJwt()
// GET `${authBaseURL}/api/auth/token`（credentials: include）
if (token) useUserStore().setToken({ token, refreshToken })
```

| 层 | 机制 |
|----|------|
| Better Auth | Cookie Session、`authClient.getSession()` |
| 业务 API | `Authorization: Bearer`（`getAccessToken()`） |
| 桥接 | `syncBetterAuthJwt` → `/api/auth/token` |

OAuth / 密钥只在 **Service `config/`**；Web 只配 `baseUrl` 代理。

## 路由守卫

`router/index.ts`：

- `config.ignore.token` 中的路径（默认 `/login`）放行
- 其余无 `getAccessToken()` → `/login?redirect=<原路径>`
- 登录成功：`router.replace(redirect || '/home')`

## Stores

| Store | 文件 | 职责 |
|-------|------|------|
| `user` | `stores/user.ts` | token、`info`、`get` / `update` / `logout` |
| `app` | `stores/app.ts` | `TAB_LIST`、窗口宽、`isMobile`、当前 Tab |
| `theme` | `stores/theme.ts` | 亮/暗/跟随系统 |

也可用 auto-import 的 `userStore` / `appStore`（Proxy）。**user 与 app 职责不同，勿合并。**

localStorage 键：`vome_web_access` / `vome_web_refresh` / `vome_web_user` / `vome_web_active` / `vome_web_theme`。Token 只经 `api/client.ts` 读写。

```ts
const user = useUserStore()
await user.get()            // 拉用户信息 → info
user.setToken({ token, refreshToken })
await user.logout()         // 清 token + 断 Socket + 跳登录

const app = useAppStore()
app.setActive('mine')
```

| user 方法 | 说明 |
|-----------|------|
| `setToken` | 写 access / refresh |
| `get` | `service.user.info.person`（字段名是 **`info`**，方法是 **`get`**） |
| `update` | `updatePerson` |
| `refreshToken` | 调 refresh 接口 |
| `logout` / `clear` | 登出 / 仅清本地 |

登出：

```ts
await useUserStore().logout()
// 可选：await authClient.signOut()
router.push('/login')
```

## Socket.IO

`lib/socket.ts`（`socket.io-client`）：

```ts
io(config.host, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: { token: getAccessToken() || '' },
})
```

| 项 | 说明 |
|----|------|
| URL | **`config.host`**（如 `http://127.0.0.1:3000`），**不是** `/dev` |
| 鉴权 | `auth.token` = access JWT |
| 启动有 token | `connectWs()` |
| 登录 / 换 token | `reconnectWs()` |
| 登出 | `disconnectWs()` |

生产用 wss 域名并改 `prod.ts` 的 `host`。业务可再 `socket.on('your-event', ...)`。

## 新增页面清单

1. 在 `pages/` 加页面组件
2. `router/` 注册路由；需登录的走现有守卫（非 `ignore.token`）
3. 调接口用 `service.*` 或 `request('/app/...')`，路径对齐 service `controller/app`
4. 用户态用 `useUserStore().info` / `get()`；壳层用 `useAppStore`
5. 提交按钮加 `submitting` 锁

## 排错

| 现象 | 排查 |
|------|------|
| 登录/接口全失败 | service 未开；`proxy.ts` 目标端口；`config.baseUrl` 与代理前缀不一致 |
| EPS 无方法 | `bootEps` 是否成功；后端是否挂了对应 app 控制器；强制 `bootEps(true)` |
| 401 循环跳登录 | refresh 接口是否 `skipRefresh`；token key 是否被清掉 |
| Socket 连不上 | 是否用了 `config.host`（不要走 `/dev`）；CORS / 防火墙 |

## UI

跟随现有 web 页面风格。**不要**把 admin 的 `vm-crud` 硬搬进 web。

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
5. 升级依赖：`bun install` 后按本 Skill 调整调用。
