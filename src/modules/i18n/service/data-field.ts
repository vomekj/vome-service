import { inArray } from 'drizzle-orm'
import type {
  CrudDeleteOptions,
  CrudDeleteWhere,
  CrudModifyType,
} from '@core/server'
import {
  BaseService,
  Inject,
  Provide,
} from '@core/server'
import { i18nDataField } from '../entity/data-field'
import { I18nDataService } from './data'

@Provide()
export class I18nDataFieldService extends BaseService {
  @Inject()
  dataService: I18nDataService

  async modifyBefore(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      const row = raw as Record<string, unknown>
      await this.dataService.assertFieldUnique(
        String(row.tableName ?? ''),
        String(row.fieldName ?? ''),
        type === 'update' && row.id != null ? Number(row.id) : undefined,
      )
    }
  }

  async modifyAfter(data: unknown, type: CrudModifyType) {
    if (type !== 'add' && type !== 'update') return
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      if (raw == null || typeof raw !== 'object') continue
      const table = String((raw as { tableName?: string }).tableName || '')
      if (table) this.dataService.invalidateFieldCache(table)
    }
  }

  override async delete(
    whereOrIds: CrudDeleteWhere,
    options?: CrudDeleteOptions,
  ) {
    const ids = Array.isArray(whereOrIds)
      ? whereOrIds
      : typeof whereOrIds === 'number' || typeof whereOrIds === 'string'
        ? [whereOrIds]
        : []
    const tables = new Set<string>()
    if (ids.length) {
      const rows = await this.getRepo().find(
        inArray(i18nDataField.id, ids as number[]),
      )
      for (const r of rows) {
        if (r.tableName) tables.add(String(r.tableName))
      }
    }
    await super.delete(whereOrIds, options)
    for (const t of tables) this.dataService.invalidateFieldCache(t)
  }
}
