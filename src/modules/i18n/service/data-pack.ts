import {
  BaseService,
  Inject,
  Provide,
} from '@core/server'
import { I18nDataService } from './data'
import { I18nPackService } from './pack'

@Provide()
export class I18nDataPackService extends BaseService {
  @Inject()
  dataService: I18nDataService

  @Inject()
  packService: I18nPackService

  async listTables() {
    return this.dataService.listDistinctTables()
  }

  /** SSE：与语言包 pack.translate 同模式 */
  translateTableStream(
    body: Parameters<I18nDataService['translateTableByAiStream']>[0],
  ) {
    return this.dataService.translateTableByAiStream(body)
  }

  async translateTable(
    body: Parameters<I18nDataService['translateTableByAi']>[0],
  ) {
    return this.dataService.translateTableByAi(body)
  }

  async listChatModels() {
    return this.packService.listChatModels()
  }

  async listEntries(tableName: string, langCode: string) {
    return this.dataService.listPackEntries(tableName, langCode)
  }

  async updateEntry(
    body: Parameters<I18nDataService['updatePackEntry']>[0],
  ) {
    return this.dataService.updatePackEntry(body)
  }

  async deleteEntry(
    body: Parameters<I18nDataService['deletePackEntry']>[0],
  ) {
    return this.dataService.deletePackEntry(body)
  }
}
