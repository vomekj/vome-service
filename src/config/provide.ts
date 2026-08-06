/**
 * 须作为入口第一个 import（早于 ./lib/host 与 vome-core/server）。
 * 静态合并 default + env，打进 build/binary；禁止运行时读盘。
 *
 * 打包生产二进制时请带 NODE_ENV=prod，确保合并的是 prod.ts。
 */
import defaultConfig from './default'
import devConfig from './dev'
import prodConfig from './prod'
import { getEnv, merge, provideHostConfig } from 'vome-core/config'

const envConfig = getEnv() === 'dev' ? devConfig : prodConfig

provideHostConfig(
  merge(
    defaultConfig as Record<string, unknown>,
    envConfig as Record<string, unknown>,
  ),
)
