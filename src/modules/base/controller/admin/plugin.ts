import {
  BaseController,
  Controller,
  Inject,
} from '/#/server'
import { basePluginInfo } from '../../entity/plugin-info'
import { PluginInfoService } from '../../service/plugin'

/** 插件 CRUD / 启停；安装请走 POST /admin/base/module/install（.vome） */
@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page'],
  entity: basePluginInfo,
  service: PluginInfoService,
  listQueryOp: {
    keyWordLikeFields: ['name', 'keyName', 'author', 'description'],
    fieldEq: [{ column: 'status', dict: 'status' }, 'hook'],
    fieldLike: ['version'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
  pageQueryOp: {
    keyWordLikeFields: ['name', 'keyName', 'author', 'description'],
    fieldEq: [{ column: 'status', dict: 'status' }, 'hook'],
    fieldLike: ['version'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
})
export class PluginInfoController extends BaseController {
  @Inject()
  plugin: PluginInfoService
}
