import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '@core/server'
import { userInfo } from '../../entity/info'
import { UserInfoService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: userInfo,
  service: UserInfoService,
  infoIgnoreProperty: ['password'],
  pageQueryOp: {
    keyWordLikeFields: ['name', 'email', 'phone', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'user_status' },
      { column: 'emailVerified', dict: 'yes_no_boolean' },
      { column: 'phoneVerified', dict: 'yes_no_boolean' },
      'tenantId',
    ],
    fieldLike: ['unionid'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'email', 'phone', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'user_status' },
      { column: 'emailVerified', dict: 'yes_no_boolean' },
      { column: 'phoneVerified', dict: 'yes_no_boolean' },
      'tenantId',
    ],
    fieldLike: ['unionid'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
})
export class UserInfoController extends BaseController {
  @Inject()
  userInfoService: UserInfoService

  @Get('/roles', { summary: '用户角色' })
  async roles(
    @Query(t.Object({ userId: t.Numeric() })) query: { userId: number },
  ) {
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
        userId: t.Numeric(),
        roleIds: t.Array(t.Numeric()),
      }),
    )
    body: { userId: number; roleIds: number[] },
  ) {
    await this.userInfoService.setRoles(body.userId, body.roleIds)
    return this.ok(true)
  }
}
