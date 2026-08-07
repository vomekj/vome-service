import {
  BaseController,
  Controller,
  Inject,
  type QueryOp,
} from '@core/server'
import { baseParam } from '../../entity/param'
import { BaseParamService } from '../../service/param'

const paramQueryOp: QueryOp = {
  keyWordLikeFields: ['name', 'keyName'],
  fieldEq: [
    { column: 'type', dict: 'base_param_type' },
    { column: 'openToApp', dict: 'base_yes_no' },
  ],
  fieldLike: ['remark'],
  fieldArray: [],
  fieldRange: [
    { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
  ],
}

/**
 * 系统参数（后台）
 */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseParam,
  service: BaseParamService,
  pageQueryOp: paramQueryOp,
  listQueryOp: paramQueryOp,
})
export class BaseParamController extends BaseController {
  @Inject()
  paramService: BaseParamService
}
