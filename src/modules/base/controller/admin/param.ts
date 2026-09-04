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
    { column: 'openToApp', dict: 'yes_no_number' },
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
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore', 'dataI18n'],
  entity: baseParam,
  service: BaseParamService,
  pageQueryOp: paramQueryOp,
  listQueryOp: paramQueryOp,
  dataI18nFields: ['data'],
})
export class BaseParamController extends BaseController {
  @Inject()
  paramService: BaseParamService
}
