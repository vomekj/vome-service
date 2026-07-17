import {
  BaseController,
  Controller,
} from '/#/server'
import { userRole } from '../../entity/role'
import { UserRoleService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: userRole,
  service: UserRoleService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'label'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'label'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
})
export class UserRoleController extends BaseController {}
