import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  sseResponse,
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

  @Get('/chatModels', { summary: '可用于业务翻译的对话模型' })
  async chatModels() {
    return this.ok(await this.dataPack.listChatModels())
  }

  @Get('/entries', { summary: '业务表翻译行（按字段分列）' })
  async entries(
    @Query(
      t.Object({
        tableName: t.String(),
        langCode: t.String(),
        sourceLangCode: t.Optional(t.String()),
      }),
    )
    query: {
      tableName: string
      langCode: string
      sourceLangCode?: string
    },
  ) {
    return this.ok(
      await this.dataPack.listEntries(
        query.tableName,
        query.langCode,
        query.sourceLangCode,
      ),
    )
  }

  @Post('/updateEntry', { summary: '更新业务译文（单字段或整行 values）' })
  async updateEntry(
    @Body(
      t.Object({
        tableName: t.String(),
        langCode: t.String(),
        id: t.String(),
        key: t.Optional(t.String()),
        value: t.Optional(t.String()),
        values: t.Optional(t.Record(t.String(), t.String())),
      }),
    )
    body: {
      tableName: string
      langCode: string
      id: string
      key?: string
      value?: string
      values?: Record<string, string>
    },
  ) {
    return this.ok(await this.dataPack.updateEntry(body))
  }

  @Post('/deleteEntry', { summary: '删除业务译文（key 省略则删整行）' })
  async deleteEntry(
    @Body(
      t.Object({
        tableName: t.String(),
        langCode: t.String(),
        id: t.String(),
        key: t.Optional(t.String()),
      }),
    )
    body: {
      tableName: string
      langCode: string
      id: string
      key?: string
    },
  ) {
    return this.ok(await this.dataPack.deleteEntry(body))
  }

  @Post('/translateTable', { summary: 'AI 翻译业务表（SSE）' })
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
    return sseResponse(this.dataPack.translateTableStream(body))
  }
}
