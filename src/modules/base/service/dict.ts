import { asc, eq, inArray, type SQL } from 'drizzle-orm'
import { deepTree } from '/#'
import {
  BaseService,
  CommException,
  InjectRepository,
  Provide,
  type CrudDeleteOptions,
  type Repository,
} from '/#/server'
import type { DictDataResult, DictInfoItem } from '../../../../typings/base/dict'
import { baseDictInfo } from '../entity/dict-info'
import { baseDictType } from '../entity/dict-type'

/** 空 value 回落 id；纯数字字符串转 number */
function normalizeDictValue(raw: unknown, id: number): unknown {
  if (raw === '' || raw === null || raw === undefined) return id
  if (typeof raw === 'string' && /^-?\d+(\.\d+)?$/.test(raw.trim())) {
    const n = Number(raw)
    if (!Number.isNaN(n)) return n
  }
  return raw
}

function sameDictValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null || b == null) return false
  return String(a) === String(b)
}

/** 在字典树中按 value 深搜节点 */
function deepFindByValue(
  list: DictInfoItem[],
  value: unknown,
  parents: string[] = [],
): DictInfoItem | undefined {
  for (const e of list) {
    if (sameDictValue(e.value, value)) {
      return {
        ...e,
        label: parents.length ? [...parents, e.name].join(' / ') : e.name,
      }
    }
    if (e.children?.length) {
      const hit = deepFindByValue(e.children, value, [...parents, e.name])
      if (hit) return hit
    }
  }
  return undefined
}

/** 按名称路径走树：['正常','tagColor'] */
function walkByNames(
  list: DictInfoItem[],
  names: string[],
): DictInfoItem | undefined {
  if (!names.length) return undefined
  const [head, ...rest] = names
  const node = list.find((e) => e.name === head)
  if (!node) return undefined
  if (!rest.length) return node
  return walkByNames(node.children ?? [], rest)
}

@Provide()
export class DictTypeService extends BaseService {
  @InjectRepository(baseDictType)
  typeRepo: Repository<typeof baseDictType>
  @InjectRepository(baseDictInfo)
  infoRepo: Repository<typeof baseDictInfo>

  /** CRUD 传入 id[]；删前查关联条目 */
  private resolveIdWhere(
    whereOrIds: SQL | number | string | Array<number | string>,
    idCol: typeof baseDictType.id | typeof baseDictInfo.id,
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
    return inArray(idCol, ids)
  }

  /** 含回收站条目：普通删与彻底删都要拦（彻底删经 delete({ force: true })） */
  private async assertNoRelatedInfos(typeIds: number[]) {
    if (!typeIds.length) return
    const infos = await this.infoRepo.find(inArray(baseDictInfo.typeId, typeIds), {
      withTrashed: true,
    })
    if (infos.length) {
      throw new CommException(
        '该字典下仍有条目（含回收站），请先删除全部条目后再删字典名',
      )
    }
  }

  /** 有条目时禁止删字典名；先清空条目再删（软删 / 硬删共用） */
  async delete(
    whereOrIds: SQL | number | string | Array<number | string>,
    options?: CrudDeleteOptions,
  ) {
    const where = this.resolveIdWhere(whereOrIds, baseDictType.id)
    if (!where) return

    const rows = await this.typeRepo.find(where, { withTrashed: true })
    const ids = rows.map((r) => r.id)
    if (!ids.length) return

    await this.assertNoRelatedInfos(ids)
    return super.delete(whereOrIds, options)
  }
}

@Provide()
export class DictInfoService extends BaseService {
  @InjectRepository(baseDictInfo)
  infoRepo: Repository<typeof baseDictInfo>
  @InjectRepository(baseDictType)
  typeRepo: Repository<typeof baseDictType>

  private toItem(e: {
    id: number
    name: string
    typeId: number
    parentId: number | null
    orderNum: number
    value: unknown
  }): DictInfoItem {
    const value = normalizeDictValue(e.value, e.id)
    return {
      id: e.id,
      name: e.name,
      label: e.name,
      typeId: e.typeId,
      parentId: e.parentId ?? null,
      orderNum: e.orderNum,
      value,
    }
  }

  private async loadFlatByTypeKey(typeKey: string): Promise<DictInfoItem[]> {
    const key = String(typeKey ?? '').trim()
    if (!key) return []
    const [type] = await this.typeRepo.find(eq(baseDictType.key, key))
    if (!type) return []
    const infos = await this.infoRepo.find(eq(baseDictInfo.typeId, type.id), {
      orderBy: [asc(baseDictInfo.orderNum), asc(baseDictInfo.createTime)],
    })
    return infos.map((e) => this.toItem(e))
  }

  private toTree(flat: DictInfoItem[]): DictInfoItem[] {
    return deepTree(flat, 'asc') as DictInfoItem[]
  }

  /**
   * 按类型 key 拉扁平字典
   * 空 types = 全部。供 Admin/App 同步；前端再 deepTree
   */
  async data(types: string[] = []): Promise<DictDataResult> {
    const typeRows = types.length
      ? await this.typeRepo.find(inArray(baseDictType.key, types))
      : await this.typeRepo.find()
    if (!typeRows.length) return {}

    const typeIds = typeRows.map((t) => t.id)
    const infos = await this.infoRepo.find(inArray(baseDictInfo.typeId, typeIds), {
      orderBy: [asc(baseDictInfo.orderNum), asc(baseDictInfo.createTime)],
    })

    const result: DictDataResult = {}
    for (const t of typeRows) {
      result[t.key] = infos
        .filter((i) => i.typeId === t.id)
        .map((e) => this.toItem(e))
    }
    return result
  }

  /**
   * 按类型 key 返回字典树（含 children）
   * 例：dict.get('state') → [{ name:'正常', value:0, children:[…] }, …]
   */
  async get(typeKey: string): Promise<DictInfoItem[]> {
    return this.toTree(await this.loadFlatByTypeKey(typeKey))
  }

  /**
   * 在类型树中按 value 找节点（含子节点）；用于直取节点整包（含 value / children）
   * 例：dict.find('state', 0) → { name:'正常', value:0, children:[…] }
   */
  async find(typeKey: string, value: unknown): Promise<DictInfoItem | undefined> {
    return deepFindByValue(await this.get(typeKey), value)
  }

  /**
   * 用存值反查展示名（支持数组）
   * 例：getValues(0, 'state') → '正常'
   */
  async getValues(
    value: string | number | Array<string | number>,
    typeKey: string,
  ): Promise<string | null | Array<string | null>> {
    const flat = await this.loadFlatByTypeKey(typeKey)
    if (!flat.length) return Array.isArray(value) ? value.map(() => null) : null

    const one = (v: string | number) => {
      let hit = flat.find((d) => sameDictValue(d.value, v))
      if (!hit) {
        const id = typeof v === 'number' ? v : Number.parseInt(String(v), 10)
        if (!Number.isNaN(id)) hit = flat.find((d) => d.id === id)
      }
      return hit?.name ?? null
    }

    return Array.isArray(value) ? value.map(one) : one(value)
  }

  /**
   * 按名称路径直取树上节点的 value（子字典）
   * 例：pathValue('state', ['正常', 'tagColor']) → '#22c55e'
   */
  async pathValue(typeKey: string, names: string[]): Promise<unknown> {
    const path = (names ?? []).map((n) => String(n ?? '').trim()).filter(Boolean)
    if (!path.length) return undefined
    return walkByNames(await this.get(typeKey), path)?.value
  }

  /**
   * 按父 value + 子名称直取子项 value
   * 例：childValue('state', 0, 'tagColor') → '#22c55e'
   */
  async childValue(
    typeKey: string,
    parentValue: unknown,
    childName: string,
  ): Promise<unknown> {
    const parent = await this.find(typeKey, parentValue)
    if (!parent?.children?.length) return undefined
    const name = String(childName ?? '').trim()
    return parent.children.find((c) => c.name === name)?.value
  }

  /** 字典类型列表（供 EPS / 前端 DictKey） */
  async types() {
    const rows = await this.typeRepo.find()
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      createTime: r.createTime,
      updateTime: r.updateTime,
    }))
  }

  /** 删除条目后级联删子节点（parentId 树）；软删/彻底删共用本方法 */
  async delete(
    whereOrIds: SQL | number | string | Array<number | string>,
    options?: CrudDeleteOptions,
  ) {
    const where = this.resolveInfoIdWhere(whereOrIds)
    if (!where) return

    const rows = await this.infoRepo.find(where, { withTrashed: true })
    const ids = rows.map((r) => r.id)
    await super.delete(whereOrIds, options)
    for (const id of ids) {
      await this.delChildDict(id, options?.force === true)
    }
  }

  private resolveInfoIdWhere(
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
    return inArray(baseDictInfo.id, ids)
  }

  private async delChildDict(parentId: number, force: boolean) {
    const children = await this.infoRepo.find(eq(baseDictInfo.parentId, parentId), {
      withTrashed: true,
    })
    if (!children.length) return
    const childIds = children.map((c) => c.id)
    if (force) {
      await this.infoRepo.forceDelete(inArray(baseDictInfo.id, childIds))
    } else {
      await this.infoRepo.softDelete(inArray(baseDictInfo.id, childIds))
    }
    for (const id of childIds) {
      await this.delChildDict(id, force)
    }
  }
}
