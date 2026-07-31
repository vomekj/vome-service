import { cors as elysiaCors } from '@elysiajs/cors'

/**
 * 浏览器跨域（@elysiajs/cors）
 * origin: true → 反射 Origin；自动 OPTIONS 预检
 * @see https://elysiajs.com/plugins/cors
 */
export const cors = elysiaCors({
  origin: true,
  credentials: true,
  maxAge: 86400,
})
