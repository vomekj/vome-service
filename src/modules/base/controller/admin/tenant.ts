import { BaseController, Controller } from '/#/server'
import { baseTenant } from '../../entity/tenant'
import { TenantService } from '../../service/tenant'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseTenant,
  service: TenantService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'code', 'remark'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'code', 'remark'],
    fieldEq: [{ column: 'status', dict: 'status' }],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { id: 'desc' },
  },
})
export class TenantController extends BaseController {}
