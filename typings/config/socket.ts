/** Socket.IO 配置 */
export interface SocketIOConfig {
  /** Engine path，默认 `/socket.io/` */
  path?: string
  /** 可升级协议，默认 `['websocket']` */
  upgrades?: string[]
  /** 多进程 Redis 适配器，默认 true */
  redisAdapter?: boolean
}
