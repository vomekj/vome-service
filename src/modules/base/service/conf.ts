import { eq } from 'drizzle-orm'
import { Provide } from '@core/server'
import { InjectRepository, type Repository } from '@core/server'
import { BaseService } from '@core/server'
import { baseConf } from '../entity/conf'

/** 系统键值配置（如 logKeep） */
@Provide()
export class ConfService extends BaseService {
  @InjectRepository(baseConf)
  confRepo: Repository<typeof baseConf>

  async getValue(key: string): Promise<string | null> {
    const [row] = await this.confRepo.find(eq(baseConf.cKey, key))
    return row?.cValue ?? null
  }

  async setValue(key: string, value: string): Promise<void> {
    const [row] = await this.confRepo.find(eq(baseConf.cKey, key))
    if (row) {
      await this.confRepo.update(eq(baseConf.id, row.id), { cValue: value })
      return
    }
    await this.confRepo.create({ cKey: key, cValue: value })
  }
}
