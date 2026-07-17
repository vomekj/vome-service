import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
} from '/#/server'
import { t } from 'elysia'
import { baseRole } from '../../entity/role'
import { RoleService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseRole,
  service: RoleService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'label'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      'dataScope',
      'relevance',
    ],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'label'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      'dataScope',
      'relevance',
    ],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
})
export class RoleController extends BaseController {
  @Inject()
  roleService: RoleService

  @Get('/menus', { summary: '角色菜单' })
  async menus(@Query(t.Object({ roleId: t.Numeric() })) query: { roleId: number }) {
    const menuIds = await this.roleService.getMenuIds(query.roleId)
    return this.ok(menuIds)
  }

  @Post('/setMenus', { summary: '设置菜单' })
  async setMenus(
    @Body(
      t.Object({
        roleId: t.Numeric(),
        menuIds: t.Array(t.Numeric()),
      }),
    )
    body: { roleId: number; menuIds: number[] },
  ) {
    await this.roleService.setMenus(body.roleId, body.menuIds)
    return this.ok(true)
  }

  @Get('/departments', { summary: '角色数据权限部门' })
  async departments(@Query(t.Object({ roleId: t.Numeric() })) query: { roleId: number }) {
    const departmentIds = await this.roleService.getDepartmentIds(query.roleId)
    return this.ok(departmentIds)
  }

  @Post('/setDepartments', { summary: '设置数据权限部门' })
  async setDepartments(
    @Body(
      t.Object({
        roleId: t.Numeric(),
        departmentIds: t.Array(t.Numeric()),
      }),
    )
    body: { roleId: number; departmentIds: number[] },
  ) {
    await this.roleService.setDepartments(body.roleId, body.departmentIds)
    return this.ok(true)
  }
}
