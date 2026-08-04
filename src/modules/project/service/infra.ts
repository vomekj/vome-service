import {
  BaseService,
  DbStore,
  Inject,
  Provide,
} from '/#/server'
import { PluginInfoService } from '../../base/service/plugin'
import { getSharedQueueRedis } from '../../../lib/queue/connection'
import { ensureVectorInfra } from '../../../lib/pgvector'

@Provide()
export class ProjectInfraService extends BaseService {
  @Inject()
  db: DbStore

  @Inject()
  plugin: PluginInfoService

  /** 进项目前探测：DB / Redis / OSS / pgvector */
  async health() {
    const checks: Record<
      string,
      { ok: boolean; message?: string }
    > = {
      database: { ok: false },
      redis: { ok: false },
      oss: { ok: false },
      pgvector: { ok: false },
    }

    try {
      const sql = this.db.sql as
        | { unsafe: (q: string) => Promise<unknown> }
        | undefined
      if (!sql) throw new Error('非 PostgreSQL 或未注入 sql')
      await sql.unsafe('SELECT 1')
      checks.database = { ok: true }
    } catch (e) {
      checks.database = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }

    try {
      const redis = getSharedQueueRedis()
      const pong = await redis.ping()
      checks.redis = {
        ok: String(pong).toUpperCase() === 'PONG',
        message: String(pong),
      }
    } catch (e) {
      checks.redis = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }

    try {
      const file = (await this.plugin.getInstance('upload')) as {
        upload?: () => Promise<unknown>
      }
      if (typeof file?.upload !== 'function') {
        throw new Error('未安装或未启用 upload 插件')
      }
      checks.oss = { ok: true }
    } catch (e) {
      checks.oss = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }

    try {
      const ok = await ensureVectorInfra(this.db.sql as never, {
        table: 'project_skill',
        indexName: 'project_skill_embedding_vec_idx',
        dim: 8,
      })
      checks.pgvector = {
        ok,
        message: ok ? 'vector extension ready' : '无法创建 vector 扩展/列',
      }
    } catch (e) {
      checks.pgvector = {
        ok: false,
        message: e instanceof Error ? e.message : String(e),
      }
    }

    const ok = Object.values(checks).every((c) => c.ok)
    return { ok, checks }
  }
}
