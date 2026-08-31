import {
  BaseService,
  Inject,
  Provide,
} from '@core/server'
import { I18nDataService } from './data'

@Provide()
export class I18nDataFieldService extends BaseService {
  @Inject()
  dataService: I18nDataService

  async modifyBefore(
    data: Record<string, unknown>,
    type: 'add' | 'update' | 'delete',
  ) {
    await this.dataService.modifyFieldBefore(data, type)
  }
}
