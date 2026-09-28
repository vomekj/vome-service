import { t } from 'elysia'
import {
  BaseController,
  Context,
  Controller,
  Get,
  Inject,
  Public,
  Query,
  Use,
  type RouteMiddleware,
} from '@core/server'
import {
  HOST_SCOPE_KEYS,
  isHostScopeKey,
  I18nPackService,
} from '../../service/pack'

/** 捕获 Request.headers，供 IP / CDN 国家解析 */
const captureSuggestRequest: RouteMiddleware = (ctx) => {
  Context({
    suggestLocaleHeaders: (ctx.request as Request | undefined)?.headers,
  })
}

/** → service.i18n.pack（App：host 公开；插件包需登录 + scopeKey） */
@Controller({ description: 'App 语言包' })
export class AppI18nPackController extends BaseController {
  @Inject()
  i18nPack: I18nPackService

  private requireUserId(): number {
    const userId = Context.get()?.userId
    if (typeof userId !== 'number' || !Number.isInteger(userId) || userId <= 0) {
      throw new Error('未登录')
    }
    return userId
  }

  @Public()
  @Get('/locales', { summary: '已生成语言包的可切换语种（宿主）' })
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
  @Get('/active', { summary: '运行时拉取语言包（宿主）' })
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

  /**
   * 无本地语言偏好时：按 IP/CDN 国家建议语种，并校验已生成语言包（无则 en-US）
   */
  @Public()
  @Use(captureSuggestRequest)
  @Get('/suggestLocale', { summary: '按 IP 建议初始语种' })
  async suggestLocale(
    @Query(
      t.Object({
        scopeKey: t.Optional(t.String()),
        /** 调试/联调用，正式以服务端解析为准 */
        country: t.Optional(t.String()),
      }),
    )
    query: { scopeKey?: string; country?: string },
  ) {
    const key = String(query.scopeKey || 'web').trim() || 'web'
    if (!isHostScopeKey(key)) {
      return this.fail(
        `scopeKey 须为 ${HOST_SCOPE_KEYS.join(' / ')}`,
      )
    }
    const headers = (
      Context.get() as { suggestLocaleHeaders?: Headers } | undefined
    )?.suggestLocaleHeaders
    return this.ok(
      await this.i18nPack.suggestLocale({
        scopeKey: key,
        country: query.country,
        headers,
      }),
    )
  }

  /** 任意插件/项目：调用方传 scopeKey（标识）；需 App 登录（Context.userId） */
  @Get('/plugin/locales', { summary: '插件语言包可切换语种' })
  async pluginLocales(
    @Query(t.Object({ scopeKey: t.String({ minLength: 1 }) }))
    query: { scopeKey: string },
  ) {
    this.requireUserId()
    const key = String(query.scopeKey || '').trim()
    if (!key) return this.fail('须指定 scopeKey（语言包标识）')
    return this.ok(await this.i18nPack.listPluginLocales(key))
  }

  @Get('/plugin/active', { summary: '插件运行时语言包' })
  async pluginActive(
    @Query(
      t.Object({
        langCode: t.String(),
        scopeKey: t.String({ minLength: 1 }),
      }),
    )
    query: { langCode: string; scopeKey: string },
  ) {
    this.requireUserId()
    const key = String(query.scopeKey || '').trim()
    if (!key) return this.fail('须指定 scopeKey（语言包标识）')
    const row = await this.i18nPack.getActivePack({
      langCode: query.langCode,
      scopeType: 'plugin',
      scopeKey: key,
    })
    return this.ok(row)
  }
}
