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
} from '/#/server'
import { i18nPack } from '../../entity/pack'
import {
  isHostScopeKey,
  I18nPackService,
} from '../../service/pack'

/** → service.i18n.pack */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: i18nPack,
  service: I18nPackService,
  pageQueryOp: {
    keyWordLikeFields: ['langCode', 'scopeKey', 'remark'],
    fieldEq: ['langCode', 'scopeKey'],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['langCode', 'scopeKey'],
    fieldEq: ['langCode', 'scopeKey'],
    addOrderBy: { id: 'desc' },
  },
})
export class I18nPackController extends BaseController {
  @Inject()
  i18nPack: I18nPackService

  @Get('/active', { summary: '运行时拉取语言包' })
  async active(
    @Query(
      t.Object({
        langCode: t.String(),
        scopeType: t.Optional(t.String()),
        scopeKey: t.Optional(t.String()),
      }),
    )
    query: { langCode: string; scopeType?: string; scopeKey?: string },
  ) {
    const row = await this.i18nPack.getActivePack(query)
    return this.ok(row)
  }

  @Get('/hostLocales', { summary: '宿主已生成语言包的可切换语种' })
  async hostLocales(
    @Query(t.Object({ scopeKey: t.Optional(t.String()) }))
    query: { scopeKey?: string },
  ) {
    return this.ok(await this.i18nPack.listHostLocales(query.scopeKey || 'admin'))
  }

  @Get('/hostSource', { summary: '宿主中文源模板' })
  async hostSource(
    @Query(t.Object({ scopeKey: t.Optional(t.String()) }))
    query: { scopeKey?: string },
  ) {
    const key = String(query.scopeKey || 'admin').trim() || 'admin'
    if (!isHostScopeKey(key)) {
      return this.fail('无效的宿主 scopeKey')
    }
    return this.ok(await this.i18nPack.buildHostSource(key))
  }

  @Post('/ensureHostZh', { summary: '同步语言包（宿主+全部插件原始包）' })
  async ensureHostZh() {
    return this.ok(await this.i18nPack.syncAllZhSources())
  }

  @Get('/pluginSource', { summary: '读取插件原始语言包' })
  async pluginSource(
    @Query(t.Object({ pluginKey: t.String() })) query: { pluginKey: string },
  ) {
    return this.ok(await this.i18nPack.readPluginSourceByRef(query.pluginKey))
  }

  @Get('/chatModels', { summary: '可用于翻译的对话模型' })
  async chatModels() {
    return this.ok(await this.i18nPack.listChatModels())
  }

  @Post('/translate', { summary: 'AI 翻译语言包（SSE 预览，不落库）' })
  async translate(
    @Body(
      t.Object({
        langCode: t.String(),
        langName: t.Optional(t.String()),
        scopeType: t.Optional(t.String()),
        scopeKey: t.Optional(t.String()),
        model: t.Optional(t.String()),
      }),
    )
    body: {
      langCode: string
      langName?: string
      scopeType?: string
      scopeKey?: string
      model?: string
    },
  ) {
    return sseResponse(this.i18nPack.translateByAiStream(body))
  }
}
