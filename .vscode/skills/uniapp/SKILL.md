---
name: uniapp-usage
description: >-
  UniApp 完整用法：vome-core/client、EPS、request、storage、登录、路由鉴权、stores、Socket、防连点。
  Use when editing uniapp/ pages, stores, or client API usage.
---

# UniApp 用法（业务开发）

> **范围**：`uniapp/` 多端业务。客户端来自 **`vome-core/client`**（别名 `/@`）。与 Web 同为 `side: 'app'`，差异在 **`uni.request`** 与带过期的 **storage**。

## IDE

见 [AGENTS.md](../AGENTS.md)：`.vscode` 移到**项目根**后 snippet/tasks 才生效。

## Core（`vome-core/client`）完整 API

与 Web 相同包；别名 `/@`。

| API | 用法 |
|-----|------|
| `configureClient({ request })` | 注入宿主 `uni.request` 封装 |
| `getClientRequest()` | 取已注入 request |
| `createEps({ force?, side: 'app', requireRoot? })` | 拉 EPS |
| `bindEpsHotReload(side)` | 开发热更新（若宿主启用） |
| `getService('app')` / `service` | 类型化 `service.user.*` |
| `serviceOf` / `resolveService` / `setServicePerms` | 解析 / 权限绑定 |
| `BaseService` | EPS 叶子基类 |
| `loadEps` / `loadAllEps` / `getEps` / `findEpsEntity` / `clearEpsCache` | EPS 缓存 |

宿主封装：`request`、`apiUrl`、`bootEps`、token/storage，见下文。对齐 **service `controller/app`**。

---

## 命令与代理

```bash
cd uniapp && bun install
bun run dev:h5            # 常用；需 service 已启动
bun run dev:mp-weixin     # 微信小程序
```

H5 代理与 Web 同模式：`config/proxy.ts` + Vite `server.proxy`。

| 场景 | H5 | 小程序 |
|------|-----|--------|
| baseUrl | `/dev` 代理 | 常改 `config` / 用 `host` 绝对地址 |
| 合法域名 | 本地代理即可 | 微信后台配置 request 域名 |
| Auth Cookie | Better Auth 可用 | **勿依赖 Cookie** |

## 路径别名与目录

| 别名 | 指向 |
|------|------|
| `@/` | `uniapp/src/` |
| `/@` | `vome-core` **client** |

```
uniapp/src/
  pages/              # 与 pages.json 对应
  windows/
  stores/             # user / app / theme
  api/client.ts
  lib/auth-client.ts
  utils/storage.ts
  utils/route-auth.ts
  utils/socket.ts
  config/
```

`pages.json` / `manifest.json` 为 JSONC。`main.ts`：`bootEps`、`ensureFreshToken`、`setupRouteAuthGuard`、`connectWs`（以现文件为准）。

## 初始化（api/client.ts）

```ts
import { configureClient, createEps, getService } from '/@'

configureClient({ request })
export const service = getService('app')

export async function bootEps(force = false) {
  return createEps({ force, side: 'app', requireRoot: false })
}
```

Vite：`createEpsVitePlugin({ side: 'app', dtsSide: 'app' })`。

## Token 与 storage

`utils/storage.ts` 前缀 **`vome_uni_`**，支持过期秒数：

```ts
storage.set('token', access, expireSeconds)
storage.set('refreshToken', refresh, refreshExpire)
storage.isExpired('token')
```

| 逻辑 key | 说明 |
|----------|------|
| `token` | access |
| `refreshToken` | refresh（可写 7 天兜底） |
| `userInfo` | 用户缓存 |

推荐：`useUserStore().setToken`（按服务端 `expire` / `refreshExpire` 写入）。`migrateLegacyTokens()` 可将旧 `vome_app_access` / `vome_app_refresh` 迁到新 key。

写入示例：

```ts
storage.set('token', token, Math.max(1, expire - 5))
storage.set('refreshToken', refresh, Math.max(1, refreshExpire - 5))
```

`getAccessToken()` 在 `isExpired('token')` 时返回空字符串。

## Refresh 队列

access 过期时**串行**刷新，避免并发多次 refresh：

```ts
ensureFreshToken()      // 导航 / 请求前
refreshAccessToken()    // POST /app/user/login/refreshToken
```

成功：`uni.$emit('session:token', data)`；失败：`redirectLogin()` → `uni.reLaunch('/pages/login/login')` 并 `session:logout`。

## request / service / apiUrl

```ts
await request<T>('/app/user/info/person', { method: 'GET', toast: false })
await service.user.info.person()
await service.user.login.refreshToken({ refreshToken })
apiUrl('/app/user/info/person')
```

| 行为 | 说明 |
|------|------|
| Header | `Authorization: Bearer` |
| 成功 | `code === 1000` → `data` |
| 鉴权失败 | 尝试 refresh 一次再重试，仍失败则跳登录 |
| 业务错误 | 默认 `uni.showToast` |
| apiUrl H5 | 相对 `config.baseUrl`（`/dev/...`）走代理 |
| apiUrl 小程序 | 无 `window` 且 baseUrl 相对时拼 `config.host` |

## 登录

### Better Auth（H5）

`lib/auth-client.ts`：

```ts
export const authClient = createAuthClient({
  baseURL: authBaseURL, // H5: origin + /dev|/prod
  plugins: [jwtClient(), genericOAuthClient()],
})
```

```ts
const token = await syncBetterAuthJwt()
// 非 window / 无 fetch → 直接 null（小程序不可用 Cookie 桥）
useUserStore().setToken(payload)
```

### 微信小程序（`#ifdef MP-WEIXIN`）

1. `uni.login({ provider: 'weixin' })` 取 `code`
2. `POST /app/user/login/mini` 换 token
3. `useUserStore().setToken(payload)`

### 与 Web 对齐的接口（登录页 `pages/login/login.vue`）

| 能力 | 路径 |
|------|------|
| 密码登录 | `POST /app/user/login/password` |
| 注册 | `POST /app/user/login/register` |
| OTP | `otpCode` → `otp` |
| 社交列表 | `GET /app/user/login/socialProviders` |
| 小程序 | `POST /app/user/login/mini` |

密钥与 OAuth 只在 Service `config/`。

## 路由鉴权

`utils/route-auth.ts` → `setupRouteAuthGuard()`（`main.ts` 调用）：

对 `navigateTo` / `redirectTo` / `reLaunch` / `switchTab` 加 interceptor，导航前 **`await ensureFreshToken()`**（过期则 refresh；**不是**白名单 ACL）。

真正跳登录在请求层：401 → `redirectLogin()` → `uni.reLaunch('/pages/login/login')`。

`pages.json` **没有** `needLogin` 元数据；是否要登录由接口是否要求 token 决定。

## Stores

| Store | 文件 | 职责 |
|-------|------|------|
| `user` | `stores/user.ts` | token、`info`、`get` / `update` / `logout`；听 `session:*` |
| `app` | `stores/app.ts` | Tab、断点、`isMobile`、安全区 |
| `theme` | `stores/theme.ts` | 主题 + tt-shaduni |

`TAB_LIST` 字段为 **`url`**（pages 路径），不是 Web 的 `path`。user 与 app **勿合并**。

```ts
const user = useUserStore()
await user.get()
user.setToken({ token, refreshToken, expire, refreshExpire })
await user.logout()
```

| user 方法 | 说明 |
|-----------|------|
| `setToken` | 按 expire 写入 storage |
| `get` | 拉用户 → **`info`** |
| `update` | `updatePerson` |
| `refreshToken` | refresh 接口 |
| `logout` / `clear` | 登出 / 清本地 |

登出：清存储 → `disconnectWs()` → 回登录页。

```ts
clearTokens()
useUserStore().logout?.()
uni.reLaunch({ url: '/pages/login/login' })
```

## Socket.IO

`utils/socket.ts`（**`@wu-xj/uni-socket.io`**，勿与 Web 的 `socket.io-client` 混用）：

```ts
io(config.host, {
  autoConnect: false,
  transports: ['websocket'],
  auth: { token: getAccessToken() || '' },
})
```

| 时机 | 调用 |
|------|------|
| `main.ts` 启动 | `connectWs()` |
| 登录成功 | `reconnectWs()` |
| 登出 | `disconnectWs()` |

小程序 `host` 必须是 **wss** 可达域名，并在后台配 socket 合法域名。业务：`ws.on('event', ...)`。

## 页面

- 新页：`pages/...` + `pages.json` 注册
- TabBar：改 `pages.json` tabBar
- 业务代码放 `@/`；需要 client 能力用 `/@`

## 与 Web 差异（对照）

| 项 | UniApp | Web |
|----|--------|-----|
| 存储 | `vome_uni_*` + TTL | `vome_web_*` localStorage |
| OAuth | 主要 H5 | 全功能 H5 |
| 导航 | `uni.*` + interceptor | vue-router `beforeEach` |
| 事件 | `session:token` / `session:logout` | 无同名事件 |
| Socket 包 | `@wu-xj/uni-socket.io` | `socket.io-client` |

## 新增页面清单

1. 加 `pages/...` + `pages.json` 注册（Tab 则改 tabBar）
2. 需要登录的接口失败会 `redirectLogin`；导航前有 `ensureFreshToken`
3. 调 `service.*` / `request('/app/...')`
4. 用户：`useUserStore().info` / `get()`；壳：`useAppStore`（`TAB_LIST` 用 `url`）
5. 提交按钮加锁

## 排错

| 现象 | 排查 |
|------|------|
| H5 接口失败 | service / proxy；`baseUrl` |
| 小程序失败 | `config.host` 是否绝对地址；微信 request 合法域名 |
| token 总过期 | storage TTL；是否走 `setToken` 写入 expire；refresh 队列是否被并发打穿 |
| Socket | `config.host` + wss 域名；勿混用 Web 的 socket.io-client |
| Better Auth 小程序 | Cookie 桥不可用；走 `login/mini` |

## 请求按钮防连点（强制）

## 注意

1. service 未开 / proxy 错 → 接口失败。
2. 业务代码放 `@/`。
3. token 走现有 refresh 与存储 key，勿另起一套。
4. H5 / 小程序：存储用项目封装；原生 API 注意条件编译。
5. H5 document title 跟现有 `lockDocumentTitle` / `globalStyle`，勿随意覆盖。
6. 升级依赖：`bun install` 后按本 Skill 调整调用。
