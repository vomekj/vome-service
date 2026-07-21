import { unlinkSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import {
  CommException,
  Ioc,
  Provide,
  loadPluginClass,
  loadPluginClassFromPath,
  readPluginScript,
  resolvePluginServerPath,
  pModulePath,
  pPluginPath,
  InjectRepository,
  type Repository,
  BaseService,
  type PluginInfo,
  type PluginPayload,
  type ModuleManifest,
  type CrudDeleteOptions,
  type CrudTrashQueryOptions,
  type PageQuery,
  type PageResult,
  DbStore,
  applyRowScopes,
  VomeConfig,
  assertModuleSeatActive,
  formatSeatDisplay,
  getModuleSeatStatus,
} from '/#/server'
import { CacheStore } from '../../../lib/cache'
import {
  maskPluginConfig,
  preparePluginConfigForStore,
} from '../../../lib/plugin-config-crypto'
import { basePluginInfo } from '../entity/plugin-info'
import { PluginCenterService } from './plugin-center'

/** 列表卡片字段：不含 readme / content 等大列（文档点开再 info） */
function listSelectFields() {
  const t = basePluginInfo
  return {
    id: t.id,
    createTime: t.createTime,
    updateTime: t.updateTime,
    deletedAt: t.deletedAt,
    tenantId: t.tenantId,
    name: t.name,
    description: t.description,
    keyName: t.keyName,
    hook: t.hook,
    version: t.version,
    logo: t.logo,
    author: t.author,
    status: t.status,
    // 仅判非 null，避免列表阶段 detoast 整份 readme
    hasReadme: sql<boolean>`(${t.readme} is not null)`.as('hasReadme'),
  }
}

@Provide()
export class PluginInfoService extends BaseService {
  @InjectRepository(basePluginInfo)
  pluginRepo: Repository<typeof basePluginInfo>

  private get center() {
    return Ioc.get(PluginCenterService)
  }

  private get cache() {
    try {
      return Ioc.get(CacheStore)
    } catch {
      return undefined
    }
  }

  private get drizzle(): {
    select: (fields: ReturnType<typeof listSelectFields>) => {
      from: (table: typeof basePluginInfo) => any
    }
  } {
    return Ioc.get(DbStore).drizzle as never
  }

  private softDeleteOn(override?: boolean) {
    if (override != null) return override
    return (
      (VomeConfig.vome as { crud?: { softDelete?: boolean } } | undefined)?.crud
        ?.softDelete === true
    )
  }

  /** 与 Repository 一致的软删 + 行级范围 */
  private listWhere(where?: SQL, options?: CrudTrashQueryOptions) {
    let trash: SQL | undefined
    if (this.softDeleteOn(options?.softDelete)) {
      if (options?.onlyTrashed) trash = isNotNull(basePluginInfo.deletedAt)
      else if (!options?.withTrashed) trash = isNull(basePluginInfo.deletedAt)
    }
    const merged = where && trash ? and(trash, where) : (where ?? trash)
    return applyRowScopes(basePluginInfo, merged)
  }

  private normalizeListRow(row: Record<string, unknown>) {
    const key = String(row.key || '')
    return {
      ...row,
      hasReadme: Boolean(row.hasReadme),
      seat: formatSeatDisplay(getModuleSeatStatus(key)),
    }
  }

  private redactInfoRow(
    row: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | undefined {
    if (!row) return undefined
    const out = { ...row }
    delete out.content
    delete out.tsContent
    if ('config' in out) {
      out.config = maskPluginConfig(out.config)
    }
    return out
  }

  async list(
    where?: SQL,
    options?: CrudTrashQueryOptions & { orderBy?: SQL[] },
  ) {
    const scoped = this.listWhere(where, options)
    let query: any = this.drizzle.select(listSelectFields()).from(basePluginInfo)
    if (scoped) query = query.where(scoped)
    if (options?.orderBy?.length) query = query.orderBy(...options.orderBy)
    const rows = (await query) as Record<string, unknown>[]
    return rows.map((r) => this.normalizeListRow(r))
  }

  async page(
    query: PageQuery & {
      where?: SQL
      orderBy?: SQL[]
    } & CrudTrashQueryOptions = {},
  ): Promise<PageResult> {
    const page = Math.max(1, query.page ?? 1)
    const size = Math.min(100, Math.max(1, query.size ?? 20))
    const trashOpts: CrudTrashQueryOptions = {
      withTrashed: query.withTrashed,
      onlyTrashed: query.onlyTrashed,
      softDelete: query.softDelete,
    }
    const scoped = this.listWhere(query.where, trashOpts)
    const total = await this.pluginRepo.count(query.where, trashOpts)
    let listQuery: any = this.drizzle
      .select(listSelectFields())
      .from(basePluginInfo)
    if (scoped) listQuery = listQuery.where(scoped)
    if (query.orderBy?.length) listQuery = listQuery.orderBy(...query.orderBy)
    const list = (await listQuery
      .limit(size)
      .offset((page - 1) * size)) as Record<string, unknown>[]
    return {
      list: list.map((r) => this.normalizeListRow(r)),
      pagination: { page, size, total },
    }
  }

  async info(
    idOrWhere: number | string | SQL,
    options?: CrudTrashQueryOptions,
  ): Promise<Record<string, unknown> | undefined> {
    const row = await super.info(idOrWhere, options)
    return this.redactInfoRow(row as Record<string, unknown> | null | undefined)
  }

  async modifyAfter(data: any, type: 'add' | 'update' | 'delete') {
    if (type !== 'add' && type !== 'update') return
    const id = data?.id ?? data?.[0]?.id
    if (id == null) return
    const info = await this.pluginRepo.findById(id)
    if (!info) return
    // 钩子按 hook 名注册；禁用/卸掉后槽位清空，不再回落空壳
    const slotKey = info.hook || info.keyName
    if (info.status === 1) await this.reInit(info.keyName)
    else await this.remove(slotKey, Boolean(info.hook))
  }

  async update(
    whereOrData: SQL | Record<string, unknown> | Record<string, unknown>[],
    data?: unknown,
  ) {
    if (Array.isArray(whereOrData)) {
      const payloads: Record<string, unknown>[] = []
      for (const item of whereOrData) {
        payloads.push(await this.prepareUpdatePayload({ ...item }))
      }
      return super.update(payloads)
    }

    if (
      whereOrData &&
      typeof whereOrData === 'object' &&
      !Array.isArray(whereOrData) &&
      (whereOrData as { getSQL?: unknown }).getSQL != null
    ) {
      const payload =
        data != null && typeof data === 'object'
          ? await this.prepareUpdatePayload({ ...(data as object) })
          : data
      return super.update(whereOrData as SQL, payload)
    }

    const row = await this.prepareUpdatePayload({
      ...(whereOrData as Record<string, unknown>),
    })
    return super.update(row)
  }

  /** 合并脱敏密钥并加密；启停同 hook 互斥逻辑 */
  private async prepareUpdatePayload(payload: Record<string, unknown>) {
    const id = payload.id != null ? Number(payload.id) : NaN
    const old = Number.isFinite(id)
      ? await this.pluginRepo.findById(id)
      : undefined

    if (payload.config !== undefined) {
      payload.config = preparePluginConfigForStore(
        payload.config,
        old?.config ?? {},
      )
    }

    if (old?.hook && payload.status === 1 && old.status !== 1) {
      const others = await this.pluginRepo.find(
        and(
          eq(basePluginInfo.hook, old.hook),
          eq(basePluginInfo.status, 1),
          ne(basePluginInfo.id, old.id),
        ),
      )
      for (const row of others) {
        await this.pluginRepo.update(eq(basePluginInfo.id, row.id), {
          status: 0,
        })
        await this.center.remove(row.hook || row.keyName, true)
      }
    }
    return payload
  }

  /**
   * 按 id 列表删除。
   * 删前卸槽位 + 清磁盘缓存，再硬删记录（插件不做软删回收站）。
   */
  async delete(
    whereOrIds: SQL | number | string | Array<number | string>,
    _options?: CrudDeleteOptions,
  ) {
    const where = this.resolveDeleteWhere(whereOrIds)
    if (!where) return

    const rows = await this.pluginRepo.find(where)
    for (const item of rows) {
      await this.remove(item.hook || item.keyName, Boolean(item.hook))
      await this.deleteData(item.keyName)
    }
    if (rows.length) {
      await this.pluginRepo.forceDelete(
        inArray(
          basePluginInfo.id,
          rows.map((r) => r.id),
        ),
      )
    }
  }

  private resolveDeleteWhere(
    whereOrIds: SQL | number | string | Array<number | string>,
  ): SQL | undefined {
    if (
      whereOrIds &&
      typeof whereOrIds === 'object' &&
      !Array.isArray(whereOrIds) &&
      (whereOrIds as { getSQL?: unknown }).getSQL != null
    ) {
      return whereOrIds as SQL
    }
    const ids = (Array.isArray(whereOrIds) ? whereOrIds : [whereOrIds])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id))
    if (!ids.length) return undefined
    return inArray(basePluginInfo.id, ids)
  }

  async getConfig(key: string) {
    return this.center.pluginInfos.get(key)?.config
  }

  async invoke(key: string, method: string, ...params: unknown[]) {
    const instance = (await this.getInstance(key)) as Record<
      string,
      (...args: unknown[]) => unknown
    >
    if (typeof instance[method] !== 'function') {
      throw new CommException(`插件[${key}]无方法 ${method}`)
    }
    return instance[method](...params)
  }

  async getInstance(key: string) {
    await assertModuleSeatActive(key)
    const ok = await this.checkStatus(key)
    if (!ok) throw new CommException(`插件[${key}]不存在或已禁用`)

    const pluginInfo = this.center.pluginInfos.get(key)
    const slot = this.center.plugins.get(key)
    if (!pluginInfo || !slot) {
      throw new CommException(`插件[${key}]未加载`)
    }

    if (pluginInfo.singleton) return slot

    const Ctor = slot as new () => {
      init: (...args: unknown[]) => Promise<void>
    }
    const instance = new Ctor()
    await instance.init(pluginInfo, undefined, undefined, {
      cache: this.cache
        ? {
            get: (k: string) => this.cache!.get(k),
            set: (k: string, v: unknown) => this.cache!.set(k, String(v)),
            del: (k: string) => this.cache!.del(k),
          }
        : undefined,
      pluginService: this,
    })
    return instance
  }

  async checkStatus(key: string) {
    const [info] = await this.pluginRepo.find(
      and(
        eq(basePluginInfo.status, 1),
        or(eq(basePluginInfo.keyName, key), eq(basePluginInfo.hook, key)),
      ),
    )
    return !!info
  }

  async reInit(keyName: string) {
    await this.center.initOne(keyName)
  }

  async remove(keyName: string, isHook = false) {
    await this.center.remove(keyName, isHook)
  }

  /**
   * 从已落盘 modules/{key} 注册钩子（由 ModuleService.install 调用）
   */
  async registerFromModule(manifest: ModuleManifest) {
    if (!manifest.hook) {
      throw new CommException('module.json 缺少 hook')
    }
    if (manifest.key === 'plugin') {
      throw new CommException('插件 key 不能为 plugin，请更换')
    }

    const serverPath = resolvePluginServerPath(manifest.key)
    let script = ''
    try {
      if (serverPath) {
        loadPluginClassFromPath(serverPath)
      } else {
        script = readPluginScript(manifest.key) ?? ''
        if (!script) {
          throw new CommException('缺少 server/index.js（钩子需导出 Plugin）')
        }
        loadPluginClass(script)
      }
    } catch (e) {
      throw new CommException(
        e instanceof Error ? e.message : 'Plugin 加载失败',
      )
    }

    const dir = pModulePath(manifest.key)
    let readme = ''
    let logo = ''
    try {
      const readmePath = join(dir, manifest.readme || 'README.md')
      if (existsSync(readmePath)) readme = readFileSync(readmePath, 'utf8')
    } catch {
      /* optional */
    }
    try {
      const logoPath = join(dir, manifest.logo || 'assets/logo.png')
      if (existsSync(logoPath)) {
        logo = readFileSync(logoPath).toString('base64')
      }
    } catch {
      /* optional */
    }

    const pluginJson: PluginInfo = {
      name: manifest.name,
      key: manifest.key,
      version: manifest.version,
      hook: manifest.hook,
      singleton: manifest.singleton,
      description: manifest.description,
      author: manifest.author,
      logo: manifest.logo,
      readme: manifest.readme,
      config: manifest.config,
    }

    const [exists] = await this.pluginRepo.find(
      eq(basePluginInfo.keyName, manifest.key),
    )

    // 覆盖安装保留已填密钥：用户已存 config 优先，再加密
    const nextConfig = preparePluginConfigForStore(
      {
        ...(manifest.config ?? {}),
        ...((exists?.config as object) ?? {}),
      },
      exists?.config ?? {},
    )

    const row = {
      name: manifest.name,
      keyName: manifest.key,
      version: manifest.version,
      author: manifest.author ?? null,
      hook: manifest.hook,
      readme,
      logo,
      content: { type: 'comm' as const, data: script },
      tsContent: { type: 'ts' as const, data: '' },
      description: manifest.description ?? null,
      pluginJson,
      config: nextConfig,
      status: 1,
    }

    const nextStatus = exists ? exists.status : 1

    if (exists) {
      await this.pluginRepo.update(eq(basePluginInfo.id, exists.id), {
        ...row,
        status: nextStatus,
        config: nextConfig,
      })
    } else {
      await this.pluginRepo.create(row)
    }

    if (manifest.hook && nextStatus === 1) {
      const others = await this.pluginRepo.find(
        and(
          eq(basePluginInfo.hook, manifest.hook),
          eq(basePluginInfo.status, 1),
          ne(basePluginInfo.keyName, manifest.key),
        ),
      )
      for (const other of others) {
        await this.pluginRepo.update(eq(basePluginInfo.id, other.id), {
          status: 0,
        })
      }
      await this.center.remove(manifest.hook, true)
    }

    if (nextStatus === 1) await this.reInit(manifest.key)
    return { type: 3 as const, message: '钩子注册成功' }
  }

  /** 卸载模块时清理钩子记录与槽位 */
  async unregisterByKey(keyName: string) {
    const [info] = await this.pluginRepo.find(
      eq(basePluginInfo.keyName, keyName),
    )
    if (!info) return
    await this.remove(info.hook || info.keyName, Boolean(info.hook))
    await this.deleteData(keyName)
    await this.pluginRepo.forceDelete(eq(basePluginInfo.id, info.id))
  }

  /** 优先 modules/{key}/server/index.js，回退旧 plugin/ 与库内 content */
  async getData(keyName: string): Promise<PluginPayload | undefined> {
    const script = readPluginScript(keyName)
    if (script) {
      return {
        content: { type: 'comm', data: script },
        tsContent: { type: 'ts', data: '' },
      }
    }
    const [info] = await this.pluginRepo.find(
      eq(basePluginInfo.keyName, keyName),
    )
    if (!info?.content) {
      console.warn(`[Plugin] 文件缺失: ${keyName}`)
      return undefined
    }
    return {
      content: info.content as PluginPayload['content'],
      tsContent: (info.tsContent as PluginPayload['tsContent']) ?? {
        type: 'ts',
        data: '',
      },
    }
  }

  async deleteData(keyName: string) {
    const filePath = join(pPluginPath(), keyName)
    if (existsSync(filePath)) unlinkSync(filePath)
  }
}

