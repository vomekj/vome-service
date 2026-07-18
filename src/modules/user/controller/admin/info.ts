import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '/#/server'
import { userInfo } from '../../entity/info'
import { UserInfoService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: userInfo,
  service: UserInfoService,
  infoIgnoreProperty: ['password'],
  pageQueryOp: {
    keyWordLikeFields: ['name', 'email', 'phone'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'emailVerified', dict: 'yes_no' },
      'tenantId',
    ],
    fieldLike: ['unionid'],
    fieldArray: [],
    fieldRange: [
      { column: 'createdAt', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createdAt: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'email', 'phone'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'emailVerified', dict: 'yes_no' },
      'tenantId',
    ],
    fieldLike: ['unionid'],
    fieldArray: [],
    fieldRange: [
      { column: 'createdAt', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createdAt: 'desc' },
  },
})
export class UserInfoController extends BaseController {
  @Inject()
  userInfoService: UserInfoService

  @Get('/roles', { summary: '用户角色' })
  async roles(@Query(t.Object({ userId: t.String() })) query: { userId: string }) {
    const roleIds = await this.userInfoService.getRoleIds(query.userId)
    return this.ok(roleIds)
  }

  @Get('/roleMap', { summary: '用户角色名映射' })
  async roleMap() {
    return this.ok(await this.userInfoService.buildRoleNameMap())
  }

  @Post('/setRoles', { summary: '设置角色' })
  async setRoles(
    @Body(
      t.Object({
        userId: t.String({ minLength: 1 }),
        roleIds: t.Array(t.Numeric()),
      }),
    )
    body: { userId: string; roleIds: number[] },
  ) {
    await this.userInfoService.setRoles(body.userId, body.roleIds)
    return this.ok(true)
  }
}
