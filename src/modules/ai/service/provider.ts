import { and, eq, isNull } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  Provide,
  type Repository,
} from '/#/server'
import {
  decryptSecret,
  encryptSecret,
  PLUGIN_SECRET_MASK,
} from '../../../lib/plugin-config-crypto'
import { aiProvider } from '../entity/provider'

@Provide()
export class AiProviderService extends BaseService {
  @InjectRepository(aiProvider)
  providerRepo: Repository<typeof aiProvider>

  async modifyBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    if (type !== 'add' && type !== 'update') return
    if (data.tenantId == null) {
      data.tenantId = Context.get()?.tenantId ?? 0
    }
    const baseUrl = String(data.baseUrl ?? '').trim()
    if (!baseUrl) throw new CommException('接口地址不能为空')
    data.baseUrl = baseUrl.replace(/\/+$/, '')

    const key = data.apiKey
    if (typeof key === 'string') {
      if (key === PLUGIN_SECRET_MASK || key === '') {
        if (type === 'update' && data.id != null) {
          const [row] = await this.providerRepo.find(
            and(
              eq(aiProvider.id, Number(data.id)),
              isNull(aiProvider.deletedAt),
            ),
          )
          if (!row?.apiKey) throw new CommException('API 密钥不能为空')
          data.apiKey = row.apiKey
        } else {
          throw new CommException('API 密钥不能为空')
        }
      } else {
        data.apiKey = encryptSecret(key)
      }
    } else if (type === 'add') {
      throw new CommException('API 密钥不能为空')
    }
  }

  async info(opts: { id: number | string }) {
    const row = await super.info(opts)
    if (row && typeof row === 'object' && 'apiKey' in row) {
      const key = (row as { apiKey?: string }).apiKey
      ;(row as { apiKey?: string }).apiKey =
        key && String(key).length > 0 ? PLUGIN_SECRET_MASK : ''
    }
    return row
  }

  /** Gateway 用：解密密钥 */
  async getDecrypted(id: number) {
    const [row] = await this.providerRepo.find(
      and(eq(aiProvider.id, id), isNull(aiProvider.deletedAt)),
    )
    if (!row) throw new CommException('AI 连接不存在')
    return {
      ...row,
      apiKey: decryptSecret(row.apiKey ?? ''),
    }
  }
}
