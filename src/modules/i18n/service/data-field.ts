import { inArray } from 'drizzle-orm'
import {
  BaseService,
  Inject,
  Provide,
  type CrudDeleteOptions,
} from '@core/server'
import type { SQL } from 'drizzle-orm'
import { i18nDataField } from '../entity/data-field'
import { I18nDataService } from './data'

@Provide()
export class I18nDataFieldService extends BaseService {
  @Inject()
  dataService: I18nDataService

  override async add(data: unknown) {
    const rows = Array.isArray(data) ? data : [data]
    for (const raw of rows) {
      const row = raw as { tableName: string; fieldName: string }
      await this.dataService.assertFieldUnique(row.tableName, row.fieldName)
    }
    const result = await super.add(data)
    for (const raw of rows) {
      this.dataService.invalidateFieldCache(
        String((raw as { tableName?: string }).tableName || ''),
      )
    }
    return result
  }

  override async update(
    whereOrData: SQL | Record<string, unknown> | Record<string, unknown>[],
    data?: unknown,
  ) {
    if (data !== undefined) return super.update(whereOrData as SQL, data)
    const rows = Array.isArray(whereOrData)
      ? whereOrData
      : [whereOrData as Record<string, unknown>]
    for (const row of rows) {
      await this.dataService.assertFieldUnique(
        String(row.tableName),
        String(row.fieldName),
        Number(row.id),
      )
    }
    const result = await super.update(whereOrData)
    for (const row of rows) {
      this.dataService.invalidateFieldCache(String(row.tableName || ''))
    }
    return result
  }

  override async delete(
    whereOrIds: SQL | number | string | Array<number | string>,
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
