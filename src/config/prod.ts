/**
 * 生产环境配置（覆盖 default.ts）
 *
 * 特点：禁止 push、文件日志、关闭所有启动初始化
 * 仅在 NODE_ENV=prod 时加载
 */
import type { EnvConfig } from '../../typings/config/env'

const config: EnvConfig = {
  /** Drizzle 数据库连接 */
  db: {
    type: 'postgresql',
    host: '127.0.0.1',
    port: 5432,
    username: 'postgres',
    password: 'change-me',
    database: 'vome',
    pool: {
      max: 20,
      idleTimeout: 60,
      maxLifetime: 1800,
      connectionTimeout: 10,
      heartbeatInterval: 30,
    },
    schema: '**/modules/*/entity/*.ts',
    migrations: './drizzle',
    /** 生产禁止 push，表结构变更走 drizzle-kit migrate */
    push: false,
  },

  /** 生产环境关闭 API 文档 */
  openapi: {
    enable: false,
  },

  /** 日志输出到文件（仅写文件，不输出到命令行） */
  logging: {
    level: 'info',
    transport: 'file',
    /** 相对宿主项目根目录，实际路径为 <cwd>/logging/ */
    dir: 'logging',
    /** 按文件名日期保留天数，一天一个 YYYY-MM-DD.log */
    maxDays: 30,
  },

  /** 生产环境关闭自动初始化；EPS 须开启（admin service 仅由此动态挂载） */
  vome: {
    /** 是否生成 EPS；亦作「同步前端语言包」开关 */
    eps: true,
    /** 初始化判断依据：db 以数据库状态为准 */
    initJudge: 'db',
    /** 启动时是否执行数据库初始化脚本 */
    initDB: false,
    /** 启动时是否初始化菜单数据 */
    initMenu: false,
  },
}

export default config