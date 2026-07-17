/**
 * Better Auth CLI 入口（仅 npx auth generate 等工具按需 --config 指向此文件）
 * 运行时初始化见 src/index.ts App.bootstrap
 */
import { Auth } from './index'
import { Cache } from '../cache'
import { Db } from '../db'

await Db.bootstrap()
await Cache.bootstrap()
await Auth.bootstrap()

export { auth } from './index'
