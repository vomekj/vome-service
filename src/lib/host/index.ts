/**
 * 宿主静态绑定：保证 bun build / binary 与 IoC 同一模块图
 *（禁止再 pathToFileURL 加载 src/lib）
 */
import { registerHost } from '/#/server'
import { Auth } from '../auth'
import { Cache } from '../cache'
import { Db } from '../db'
import { Module } from '../module'
import { Plugin } from '../plugin'
import { Queue } from '../queue'
import { Socket } from '../socket'
import { Task } from '../task'
import {
  adminAuth,
  microApps,
  moduleGateway,
  requestLog,
  webAuth,
} from '../../middleware'
import { loadHostModules } from './scan'

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
