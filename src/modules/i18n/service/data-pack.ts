import {
  BaseService,
  Inject,
  Provide,
} from '@core/server'
import { I18nDataService } from './data'

@Provide()
export class I18nDataPackService extends BaseService {
  @Inject()
  dataService: I18nDataService

  async listTables() {
    return this.dataService.listDistinctTables()
  }

  async translateTable(
    body: Parameters<I18nDataService['translateTableByAi']>[0],
  ) {
    return this.dataService.translateTableByAi(body)
  }
}
