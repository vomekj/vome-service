import {
  BaseController,
  Controller,
} from '@core/server'
import { i18nDataField } from '../../entity/data-field'
import { I18nDataFieldService } from '../../service/data-field'

/** → service.i18n.dataField */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: i18nDataField,
  service: I18nDataFieldService,
  pageQueryOp: {
    keyWordLikeFields: ['tableName', 'fieldName', 'sourceTable', 'remark'],
    fieldEq: ['tableName', 'mode', 'status'],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['tableName', 'fieldName'],
    fieldEq: ['tableName', 'mode', 'status'],
    addOrderBy: { id: 'desc' },
  },
})
export class I18nDataFieldController extends BaseController {}
