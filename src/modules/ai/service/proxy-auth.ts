import { and, eq, isNull } from 'drizzle-orm'
import {
  CommException,
  InjectRepository,
  Ioc,
  Provide,
  type Repository,
  type RouteMiddleware,
} from '/#/server'
import { decryptSecret } from '../../../lib/plugin-config-crypto'
import { aiProvider } from '../entity/provider'

/** OpenAI 代理鉴权：Bearer / x-api-key */
export const aiProxyAuthMiddleware: RouteMiddleware = async (ctx) => {
  const req = ctx.request as Request | undefined
  if (!req?.headers) throw new CommException('缺少请求上下文', 500)
  await Ioc.get(AiProxyAuthService).assertProxyKey(
    req.headers.get('authorization'),
    req.headers.get('x-api-key'),
  )
}

@Provide()
export class AiProxyAuthService {
  @InjectRepository(aiProvider)
  providerRepo: Repository<typeof aiProvider>

  /** 校验 Bearer / x-api-key，匹配 provider.apiKey 或 extra.gatewayKey */
  async assertProxyKey(authHeader: string | null, apiKeyHeader: string | null) {
    const token = parseBearer(authHeader) ?? apiKeyHeader?.trim()
    if (!token) throw new CommException('缺少 API Key', 401)

    const rows = await this.providerRepo.find(
      and(eq(aiProvider.status, 1), isNull(aiProvider.deletedAt)),
    )
    for (const row of rows) {
      try {
        const key = decryptSecret(String(row.apiKey ?? ''))
        if (key && key === token) return row
        const extra = row.extra as Record<string, unknown> | null
        const gatewayKey = String(extra?.gatewayKey ?? '').trim()
        if (gatewayKey && gatewayKey === token) return row
      } catch {
        // skip bad row
      }
    }
    throw new CommException('API Key 无效', 401)
  }
}

function parseBearer(h: string | null) {
  if (!h) return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1]?.trim() || null
}
