import type { AnyElysia } from 'elysia'
import { Server as Engine } from '@socket.io/bun-engine'
import { createAdapter } from '@socket.io/redis-adapter'
import { Server, type Socket as IoSocket } from 'socket.io'
import { Ioc, VomeConfig } from '/#/server'
import type { SocketIOConfig } from '../../../typings/config/socket'
import { JwtService } from '../auth/jwt'
import { createQueueRedis, getSharedQueueRedis } from '../queue/connection'

let io: Server | undefined
let engine: Engine | undefined
let subClient: ReturnType<typeof createQueueRedis> | undefined
let listenOpts: Record<string, unknown> = {}

function socketConfig(): SocketIOConfig {
  return (VomeConfig.socketIO ?? {}) as SocketIOConfig
}

function extractToken(socket: IoSocket): string {
  const auth = socket.handshake.auth as { token?: string } | undefined
  if (auth?.token) return String(auth.token).trim()

  const q = socket.handshake.query?.token
  if (typeof q === 'string' && q.trim()) return q.trim()
  if (Array.isArray(q) && q[0]) return String(q[0]).trim()

  const raw =
    socket.handshake.headers.authorization ||
    socket.handshake.headers.Authorization
  if (typeof raw !== 'string' || !raw.trim()) return ''
  const v = raw.trim()
  if (/^bearer\s+/i.test(v)) return v.slice(7).trim()
  return v
}

async function verifyAccessToken(token: string) {
  const jwt = Ioc.get(JwtService)
  try {
    const admin = await jwt.admin.verify(token)
    if (admin) return { audience: 'admin' as const, payload: admin }
  } catch {
    // try web
  }
  try {
    const web = await jwt.web.verify(token)
    if (web) return { audience: 'web' as const, payload: web }
  } catch {
    // fallthrough
  }
  return null
}

/**
 * Socket.IO 生命周期（Bun Engine + 可选 Redis adapter）
 *
 * - 握手必须带有效 JWT（auth.token / Authorization / query.token）
 * - 连接成功后 emit `data`「连接成功」
 */
async function bootstrap() {
  if (io) return

  const cfg = socketConfig()
  const path = cfg.path || '/socket.io/'

  engine = new Engine({
    path,
    cors: {
      origin: true,
      credentials: true,
    },
  })

  io = new Server()
  io.bind(engine)

  if (cfg.redisAdapter !== false) {
    const pubClient = getSharedQueueRedis()
    subClient = pubClient.duplicate()
    await Promise.all([pubClient.ping(), subClient.ping()])
    io.adapter(createAdapter(pubClient, subClient))
    console.info('[Socket] redis adapter ready')
  }

  io.use(async (socket, next) => {
    try {
      const token = extractToken(socket)
      if (!token) {
        next(new Error('unauthorized'))
        return
      }
      const auth = await verifyAccessToken(token)
      if (!auth) {
        next(new Error('unauthorized'))
        return
      }
      socket.data.audience = auth.audience
      socket.data.payload = auth.payload
      next()
    } catch (e) {
      next(e instanceof Error ? e : new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    socket.emit('data', '连接成功')
  })

  // bun-engine.handler() 会带 maxRequestBodySize=1e6；那是引擎默认值，不得并入 HTTP listen
  const raw = { ...(engine.handler() as Record<string, unknown>) }
  delete raw.maxRequestBodySize
  listenOpts = raw
  console.info(`[Socket] ready path=${path}`)
}

function apply(app: AnyElysia): AnyElysia {
  if (!engine) {
    throw new Error('[Socket] 请先 Socket.bootstrap()')
  }
  const path = socketConfig().path || '/socket.io/'
  return app.all(path, ({ request, server }) =>
    engine!.handleRequest(request, server!),
  )
}

function listenOptions(): Record<string, unknown> {
  return listenOpts
}

function getIO(): Server | undefined {
  return io
}

async function close() {
  if (io) {
    await new Promise<void>((resolve) => {
      io!.close(() => resolve())
    })
    io = undefined
  }
  engine = undefined
  listenOpts = {}
  if (subClient) {
    await subClient.quit().catch(() => subClient?.disconnect())
    subClient = undefined
  }
}

export const Socket = {
  bootstrap,
  apply,
  listenOptions,
  getIO,
  close,
}
