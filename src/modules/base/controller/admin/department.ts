import { BaseController, Controller, Get, Inject, Perms, Query } from '/#/server'
import { t } from 'elysia'
import { baseDepartment } from '../../entity/department'
import { DepartmentService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseDepartment,
  service: DepartmentService,
  listQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: ['parentId'],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
  pageQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: ['parentId'],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
})
export class DepartmentController extends BaseController {
  @Inject()
  departmentService: DepartmentService

  @Perms('base:user:list', 'base:role:list', 'base:department:tree')
  @Get('/tree', { summary: '部门树（扁平）' })
  async tree(
    @Query(t.Object({ onlyTrashed: t.Optional(t.Boolean()) }))
    query: { onlyTrashed?: boolean },
  ) {
    const list = await this.departmentService.listAll(
      query.onlyTrashed === true || String(query.onlyTrashed) === 'true',
    )
    return this.ok(list)
  }
}
