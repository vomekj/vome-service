import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Public,
  Query,
} from '/#/server'
import { listEnabledSocialProviders } from '../../../../lib/auth/config'
import { UserLoginService } from '../../service/login'

const captchaQuery = t.Object({
  width: t.Optional(t.Numeric()),
  height: t.Optional(t.Numeric()),
  color: t.Optional(t.String()),
})

@Controller({ description: 'App 登录' })
export class AppUserLoginController extends BaseController {
  @Inject()
  login: UserLoginService

  @Public()
  @Get('/socialProviders', { summary: '已启用的社交 SSO' })
  async socialProviders() {
    return this.ok(listEnabledSocialProviders())
  }

  @Public()
  @Get('/captcha', { summary: '图片验证码' })
  async captcha(
    @Query(captchaQuery)
    query: { width?: number; height?: number; color?: string },
  ) {
    return this.ok(
      await this.login.captcha(query.width, query.height, query.color),
    )
  }

  @Public()
  @Post('/otpCode', { summary: '发送验证码（手机/邮箱自动分流）' })
  async otpCode(
    @Body(
      t.Object({
        account: t.String({ minLength: 1 }),
        captchaId: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { account: string; captchaId: string; code: string },
  ) {
    await this.login.otpCode(body.account, body.captchaId, body.code)
    return this.ok(true)
  }

  @Public()
  @Post('/otp', { summary: '验证码登录（登录即注册，手机/邮箱自动分流）' })
  async otp(
    @Body(
      t.Object({
        account: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { account: string; code: string },
  ) {
    return this.ok(await this.login.otpLogin(body.account, body.code))
  }

  @Public()
  @Post('/smsCode', { summary: '发送短信验证码' })
  async smsCode(
    @Body(
      t.Object({
        phone: t.String({ minLength: 1 }),
        captchaId: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { phone: string; captchaId: string; code: string },
  ) {
    await this.login.smsCode(body.phone, body.captchaId, body.code)
    return this.ok(true)
  }

  @Public()
  @Post('/emailCode', { summary: '发送邮箱验证码' })
  async emailCode(
    @Body(
      t.Object({
        email: t.String({ minLength: 1 }),
        captchaId: t.String({ minLength: 1 }),
        code: t.String({ minLength: 1 }),
      }),
    )
    body: { email: string; captchaId: string; code: string },
  ) {
    await this.login.emailCode(body.email, body.captchaId, body.code)
    return this.ok(true)
  }

  @Public()
  @Post('/phone', { summary: '手机号验证码登录（登录即注册）' })
  async phone(
    @Body(
      t.Object({
        phone: t.String({ minLength: 1 }),
        smsCode: t.String({ minLength: 1 }),
      }),
    )
    body: { phone: string; smsCode: string },
  ) {
    return this.ok(await this.login.phoneVerifyCode(body.phone, body.smsCode))
  }

  @Public()
  @Post('/email', { summary: '邮箱验证码登录（登录即注册）' })
  async email(
    @Body(
      t.Object({
        email: t.String({ minLength: 1 }),
        emailCode: t.String({ minLength: 1 }),
      }),
    )
    body: { email: string; emailCode: string },
  ) {
    return this.ok(
      await this.login.emailVerifyCode(body.email, body.emailCode),
    )
  }

  @Public()
  @Post('/password', { summary: '密码登录（手机号或邮箱）' })
  async password(
    @Body(
      t.Object({
        account: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    )
    body: { account: string; password: string },
  ) {
    return this.ok(await this.login.password(body.account, body.password))
  }

  @Public()
  @Post('/register', { summary: '密码注册（手机号或邮箱）' })
  async register(
    @Body(
      t.Object({
        account: t.String({ minLength: 1 }),
        password: t.String({ minLength: 1 }),
      }),
    )
    body: { account: string; password: string },
  ) {
    return this.ok(await this.login.register(body.account, body.password))
  }

  @Public()
  @Post('/mini', { summary: '小程序登录' })
  async mini(
    @Body(
      t.Object({
        code: t.String({ minLength: 1 }),
        encryptedData: t.String({ minLength: 1 }),
        iv: t.String({ minLength: 1 }),
      }),
    )
    body: { code: string; encryptedData: string; iv: string },
  ) {
    return this.ok(await this.login.mini(body.code, body.encryptedData, body.iv))
  }

  @Public()
  @Post('/mp', { summary: '公众号登录' })
  async mp(@Body(t.Object({ code: t.String({ minLength: 1 }) })) body: { code: string }) {
    return this.ok(await this.login.mp(body.code))
  }

  @Public()
  @Post('/wxApp', { summary: '微信APP授权登录' })
  async wxApp(
    @Body(t.Object({ code: t.String({ minLength: 1 }) })) body: { code: string },
  ) {
    return this.ok(await this.login.wxApp(body.code))
  }

  @Public()
  @Post('/uniPhone', { summary: '一键手机号登录' })
  async uniPhone(
    @Body(
      t.Object({
        access_token: t.String({ minLength: 1 }),
        openid: t.String({ minLength: 1 }),
        appId: t.String({ minLength: 1 }),
      }),
    )
    body: { access_token: string; openid: string; appId: string },
  ) {
    return this.ok(
      await this.login.uniPhone(body.access_token, body.openid, body.appId),
    )
  }

  @Public()
  @Post('/miniPhone', { summary: '小程序手机号登录' })
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
      await this.login.miniPhone(body.code, body.encryptedData, body.iv),
    )
  }

  @Public()
  @Post('/refreshToken', { summary: '刷新token' })
  async refreshToken(
    @Body(t.Object({ refreshToken: t.String({ minLength: 1 }) }))
    body: { refreshToken: string },
  ) {
    return this.ok(await this.login.refreshToken(body.refreshToken))
  }
}
