/**
 * 开发环境配置（覆盖 default.ts）
 *
 * 特点：drizzle-kit push、详细日志、开启初始化与 EPS 代码生成
 * 仅在 NODE_ENV=dev 时加载
 */
import type { EnvConfig } from '../../typings/config/env'

const config: EnvConfig = {
  /** Drizzle 数据库连接 */
  db: {
    type: 'postgresql',
    host: '8.134.209.56',
    port: 5432,
    username: 'xbaokj',
    password: 'xbaokj123',
    database: 'vome',
    pool: {
      max: 10,
      idleTimeout: 60,
      maxLifetime: 1800,
      connectionTimeout: 10,
      heartbeatInterval: 30,
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
    /** 是否生成 EPS（Entity Path Service）接口描述 */
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
