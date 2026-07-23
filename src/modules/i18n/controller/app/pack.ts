import { t } from 'elysia'
import {
  BaseController,
  Controller,
  Get,
  Inject,
  Public,
  Query,
} from '/#/server'
import {
  HOST_SCOPE_KEYS,
  isHostScopeKey,
  I18nPackService,
} from '../../service/pack'

/** → service.i18n.pack（App 公开：web / uniapp 运行时） */
@Controller({ description: 'App 语言包' })
export class AppI18nPackController extends BaseController {
  @Inject()
  i18nPack: I18nPackService

  @Public()
  @Get('/locales', { summary: '已生成语言包的可切换语种' })
  async locales(
    @Query(t.Object({ scopeKey: t.Optional(t.String()) }))
    query: { scopeKey?: string },
  ) {
    const key = String(query.scopeKey || 'web').trim() || 'web'
    if (!isHostScopeKey(key)) {
      return this.fail(
        `scopeKey 须为 ${HOST_SCOPE_KEYS.join(' / ')}`,
      )
    }
    return this.ok(await this.i18nPack.listHostLocales(key))
  }

  @Public()
  @Get('/active', { summary: '运行时拉取语言包' })
  async active(
    @Query(
      t.Object({
        langCode: t.String(),
        scopeKey: t.Optional(t.String()),
      }),
    )
    query: { langCode: string; scopeKey?: string },
  ) {
    const key = String(query.scopeKey || 'web').trim() || 'web'
    if (!isHostScopeKey(key)) {
      return this.fail(
        `scopeKey 须为 ${HOST_SCOPE_KEYS.join(' / ')}`,
      )
    }
    const row = await this.i18nPack.getActivePack({
      langCode: query.langCode,
      scopeType: 'host',
      scopeKey: key,
    })
    return this.ok(row)
  }
}
