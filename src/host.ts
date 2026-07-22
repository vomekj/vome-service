/**
 * 宿主静态绑定：保证 bun build / binary 与 IoC 同一模块图
 *（禁止再 pathToFileURL 加载 src/lib）
 */
import { registerHost } from '/#/server'
import { Auth } from './lib/auth'
import { Cache } from './lib/cache'
import { Db } from './lib/db'
import { Module } from './lib/module'
import { Plugin } from './lib/plugin'
import { Queue } from './lib/queue'
import { Socket } from './lib/socket'
import { Task } from './lib/task'
import {
  adminAuth,
  microApps,
  moduleGateway,
  requestLog,
  webAuth,
} from './middleware'
import { loadHostModules } from './host-scan'

registerHost({
  Db,
  Cache,
  Queue,
  Auth,
  Task,
  Plugin,
  Module,
  Socket,
  middleware: {
    webAuth,
    adminAuth,
    requestLog,
    microApps,
    moduleGateway,
  },
  scan: loadHostModules,
})
