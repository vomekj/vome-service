import {
  BaseController,
  Controller,
  Get,
  Inject,
} from '/#/server'
import { i18nLang } from '../../entity/lang'
import { I18nLangService } from '../../service/lang'

/** → service.i18n.lang */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: i18nLang,
  service: I18nLangService,
  pageQueryOp: {
    keyWordLikeFields: ['code', 'name'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    addOrderBy: { id: 'asc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['code', 'name'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    addOrderBy: { id: 'asc' },
  },
})
export class I18nLangController extends BaseController {
  @Inject()
  i18nLang: I18nLangService

  @Get('/enabled', { summary: '启用语种列表' })
  async enabled() {
    return this.ok(await this.i18nLang.listEnabled())
  }
}
