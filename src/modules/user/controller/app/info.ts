import { t } from 'elysia'
import {
  BaseController,
  Body,
  Context,
  Controller,
  Get,
  Inject,
  Post,
} from '/#/server'
import { UserPersonService } from '../../service/person'

@Controller({ description: 'App 用户信息' })
export class AppUserInfoController extends BaseController {
  @Inject()
  person: UserPersonService

  private userId() {
    return String(Context.get()?.userId || '')
  }

  @Get('/person', { summary: '获取用户信息' })
  async getPerson() {
    return this.ok(await this.person.person(this.userId()))
  }

  @Post('/updatePerson', { summary: '更新用户信息' })
  async updatePerson(@Body(t.Record(t.String(), t.Any())) body: Record<string, unknown>) {
    return this.ok(await this.person.updatePerson(this.userId(), body))
  }

  @Post('/updatePassword', { summary: '更新用户密码' })
  async updatePassword(
    @Body(
      t.Object({
        password: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { password: string; code: string },
  ) {
    await this.person.updatePassword(this.userId(), body.password, body.code)
    return this.ok(true)
  }

  @Post('/logoff', { summary: '注销' })
  async logoff() {
    await this.person.logoff(this.userId())
    return this.ok(true)
  }

  @Post('/logout', { summary: '退出登录' })
  async logout(
    @Body(t.Object({ refreshToken: t.Optional(t.String()) }))
    body: { refreshToken?: string },
    ctx?: { request: Request },
  ) {
    await this.person.logout(body.refreshToken || '', ctx?.request.headers)
    return this.ok(true)
  }

  @Post('/bindPhone', { summary: '绑定/验证手机号（验证码，只验一次）' })
  async bindPhone(
    @Body(
      t.Object({
        phone: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { phone: string; code: string },
  ) {
    await this.person.bindPhone(this.userId(), body.phone, body.code)
    return this.ok(true)
  }

  @Post('/bindEmail', { summary: '绑定/验证邮箱（验证码，只验一次）' })
  async bindEmail(
    @Body(
      t.Object({
        email: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { email: string; code: string },
  ) {
    await this.person.bindEmail(this.userId(), body.email, body.code)
    return this.ok(true)
  }

  @Post('/miniPhone', { summary: '绑定小程序手机号' })
  async miniPhone(
    @Body(
      t.Object({
        code: t.String({ minLength: 1 }),
        encryptedData: t.String({ minLength: 1 }),
        iv: t.String({ minLength: 1 }),
      }),
    )
    body: { code: string; encryptedData: string; iv: string },
  ) {
    return this.ok(
      await this.person.miniPhone(
        this.userId(),
        body.code,
        body.encryptedData,
        body.iv,
      ),
    )
  }
}
