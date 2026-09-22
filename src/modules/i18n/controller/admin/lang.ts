import { t } from 'elysia'
import {
  BaseController,
  Controller,
  Get,
  Inject,
  Query,
  getSourceLang,
} from '@core/server'
import { i18nLang } from '../../entity/lang'
import { I18nLangService } from '../../service/lang'

/** → service.i18n.lang */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: i18nLang,
  service: I18nLangService,
  pageQueryOp: {
    keyWordLikeFields: ['code', 'name', 'nameZh'],
    fieldEq: [{ column: 'status', dict: 'status' }],
  },
  listQueryOp: {
    keyWordLikeFields: ['code', 'name', 'nameZh'],
    fieldEq: [{ column: 'status', dict: 'status' }],
  },
})
export class I18nLangController extends BaseController {
  @Inject()
  i18nLang: I18nLangService

  @Get('/enabled', { summary: '启用语种列表' })
  async enabled(
    @Query(
      t.Object({
        excludeSource: t.Optional(
          t.Union([t.Boolean(), t.String(), t.Number()]),
        ),
      }),
    )
    query: { excludeSource?: boolean | string | number } = {},
  ) {
    const raw = query.excludeSource
    const excludeSource =
      raw === true || raw === 1 || raw === '1' || raw === 'true'
    return this.ok(await this.i18nLang.listEnabled({ excludeSource }))
  }

  @Get('/sourceCode', { summary: '源语言编码（system.lang）' })
  async sourceCode() {
    return this.ok({ code: getSourceLang() })
  }
}
