import { and, eq, isNull, type SQL } from 'drizzle-orm'
import {
  BaseService,
  CommException,
  Context,
  InjectRepository,
  Provide,
  type CrudTrashQueryOptions,
  type Repository,
} from '@core/server'
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

  private async prepareProvider(
    data: Record<string, unknown>,
    type: 'add' | 'update',
  ) {
    if (data.tenantId == null) {
      data.tenantId = Context.get()?.tenantId ?? 0
    }
    if (data.baseUrl != null) {
      data.baseUrl = String(data.baseUrl).trim().replace(/\/+$/, '')
    }

    const key = data.apiKey
    if (typeof key === 'string') {
      if (key === PLUGIN_SECRET_MASK || key === '') {
        if (type === 'update' && data.id != null) {
          const [row] = await this.providerRepo.find(
            and(
              eq(aiProvider.id, Number(data.id)),
              isNull(aiProvider.deletedTime),
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

  override async add(data: unknown, options?: Parameters<BaseService['add']>[1]) {
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw != null && typeof raw === 'object') {
        await this.prepareProvider(raw as Record<string, unknown>, 'add')
      }
    }
    return super.add(data, options)
  }

  override async update(
    whereOrData: Parameters<BaseService['update']>[0],
    data?: unknown,
  ) {
    if (data !== undefined) {
      if (data != null && typeof data === 'object' && !Array.isArray(data)) {
        await this.prepareProvider(data as Record<string, unknown>, 'update')
      }
      return super.update(whereOrData as never, data)
    }
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      await this.prepareProvider(row, 'update')
    }
    return super.update(whereOrData)
  }

  async info(
    idOrWhere: string | number | SQL,
    options?: CrudTrashQueryOptions,
  ) {
    const row = await super.info(idOrWhere, options)
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
      and(eq(aiProvider.id, id), isNull(aiProvider.deletedTime)),
    )
    if (!row) throw new CommException('AI 连接不存在')
    return {
      ...row,
      apiKey: decryptSecret(row.apiKey ?? ''),
    }
  }
}
