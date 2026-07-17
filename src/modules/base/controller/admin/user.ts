import { inArray } from 'drizzle-orm'
import { t } from 'elysia'
import {
  BaseController,
  Body,
  Context,
  Controller,
  Get,
  Inject,
  Perms,
  Post,
  Query,
} from '/#/server'
import { baseUser } from '../../entity/user'
import { AdminUserService } from '../../service/rbac'

function userDeptFilter(qb: { andWhere: (c: unknown) => void }, body: Record<string, unknown>) {
  const ids = body.departmentIds
  if (Array.isArray(ids) && ids.length) {
    const nums = ids.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
    if (nums.length) qb.andWhere(inArray(baseUser.departmentId, nums))
    return
  }
  const id = body.departmentId
  if (id != null && id !== '') {
    qb.andWhere(inArray(baseUser.departmentId, [Number(id)]))
  }
}

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseUser,
  service: AdminUserService,
  infoIgnoreProperty: ['password'],
  listQueryOp: {
    keyWordLikeFields: ['username', 'name', 'nickName', 'phone', 'email'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      'departmentId',
      'isSuper',
    ],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
    extend: (qb, ctx) => userDeptFilter(qb, ctx.body),
  },
  pageQueryOp: {
    keyWordLikeFields: ['username', 'name', 'nickName', 'phone', 'email'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      'departmentId',
      'isSuper',
    ],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
    extend: (qb, ctx) => userDeptFilter(qb, ctx.body),
  },
})
export class UserController extends BaseController {
  @Inject()
  userService: AdminUserService

  @Get('/roles', { summary: '用户角色' })
  async roles(@Query(t.Object({ userId: t.Numeric() })) query: { userId: number }) {
    const roleIds = await this.userService.getRoleIds(query.userId)
    return this.ok(roleIds)
  }

  @Get('/roleMap', { summary: '用户角色名映射' })
  async roleMap() {
    return this.ok(await this.userService.buildRoleNameMap())
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
    await this.userService.setRoles(body.userId, body.roleIds)
    return this.ok(true)
  }

  @Post('/transferSuper', { summary: '转让超管' })
  async transferSuper(
    @Body(t.Object({ userId: t.Numeric() })) body: { userId: number },
  ) {
    const adminId = Number(Context.get()?.adminId)
    await this.userService.transferSuper(adminId, body.userId)
    return this.ok(true)
  }

  @Post('/moveDepartment', { summary: '批量转移部门' })
  @Perms('base:user:update')
  async moveDepartment(
    @Body(
      t.Object({
        userIds: t.Array(t.Numeric(), { minItems: 1 }),
        departmentId: t.Numeric(),
      }),
    )
    body: { userIds: number[]; departmentId: number },
  ) {
    await this.userService.moveDepartment(body.userIds, body.departmentId)
    return this.ok(true)
  }
}
