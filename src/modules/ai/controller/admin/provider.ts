import {
  BaseController,
  Controller,
  Inject,
} from '/#/server'
import { aiProvider } from '../../entity/provider'
import { AiProviderService } from '../../service/provider'

/** → service.ai.provider */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: aiProvider,
  service: AiProviderService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'baseUrl', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'protocol', dict: 'base_ai_protocol' },
      { column: 'vendor', dict: 'base_ai_vendor' },
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'protocol', dict: 'base_ai_protocol' },
    ],
    addOrderBy: { id: 'desc' },
  },
})
export class AiProviderController extends BaseController {
  @Inject()
  aiProvider: AiProviderService
}
