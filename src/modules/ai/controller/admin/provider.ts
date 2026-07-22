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
    keyWordLikeFields: ['vendor', 'baseUrl', 'remark'],
    fieldEq: [
      { column: 'status', dict: 'status' },
      { column: 'protocol', dict: 'base_ai_protocol' },
    ],
    addOrderBy: { id: 'desc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['vendor'],
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
