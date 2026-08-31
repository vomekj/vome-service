import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
} from '@core/server'
import { i18nDataPack } from '../../entity/data-pack'
import { I18nDataPackService } from '../../service/data-pack'

/** → service.i18n.dataPack */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: i18nDataPack,
  service: I18nDataPackService,
  pageQueryOp: {
    keyWordLikeFields: ['tableName', 'langCode', 'remark'],
    fieldEq: ['tableName', 'langCode'],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['tableName', 'langCode'],
    fieldEq: ['tableName', 'langCode'],
    addOrderBy: { id: 'desc' },
  },
})
export class I18nDataPackController extends BaseController {
  @Inject()
  dataPack: I18nDataPackService

  @Get('/tables', { summary: '已配置翻译的业务表' })
  async tables() {
    return this.ok(await this.dataPack.listTables())
  }

  @Post('/translateTable', { summary: 'AI 翻译业务表' })
  async translateTable(
    @Body(
      t.Object({
        tableName: t.String(),
        langCode: t.String(),
        langName: t.Optional(t.String()),
        mode: t.Optional(t.Union([t.Literal('full'), t.Literal('incremental')])),
        model: t.Optional(t.String()),
      }),
    )
    body: {
      tableName: string
      langCode: string
      langName?: string
      mode?: 'full' | 'incremental'
      model?: string
    },
  ) {
    return this.ok(await this.dataPack.translateTable(body))
  }
}
