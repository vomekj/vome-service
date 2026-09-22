/**
 * 开发环境配置（覆盖 default.ts）
 *
 * 特点：drizzle-kit push、详细日志、开启初始化与 EPS 代码生成
 * 仅在 NODE_ENV=dev 时加载
 */
import type { EnvConfig } from '../../typings/config/env'

const config: EnvConfig = {
  system: {
    /**
     * C 端语言包 origin（开发）
     * 源包在各自 src/locales/；HTTP：web → /locales/…；uniapp → /static/locales/…
     * 是否同步由 vome.eps 控制
     */
    localeOrigins: {
      web: 'http://127.0.0.1:9900',
      uniapp: 'http://127.0.0.1:6600',
    },
  },

  /** Drizzle 数据库连接 */
  db: {
    type: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    username: 'postgres',
    password: 'postgres',
    database: 'vome',
    pool: {
      max: 10,
      idleTimeout: 1800,
      maxLifetime: 0,
      connectionTimeout: 10,
      heartbeatInterval: 30,
      keepAlive: true,
      keepAliveInitialDelay: 10,
    },
    schema: '**/modules/*/entity/*.ts',
    migrations: './drizzle',
    /** 开发环境允许 drizzle-kit push 同步 schema */
    push: true,
  },

  /** 日志输出 */
  logging: {
    level: 'error',
    transport: 'console',
  },

  /** 开发环境 Vome 初始化开关 */
  vome: {
    /** 是否生成 EPS；亦作「同步前端语言包」开关 */
    eps: true,
    /** 初始化判断依据：db 以数据库状态为准 */
    initJudge: 'db',
    /** 启动时是否执行数据库初始化脚本 */
    initDB: true,
    /** 启动时是否初始化菜单数据 */
    initMenu: true,
  },
}

export default config
