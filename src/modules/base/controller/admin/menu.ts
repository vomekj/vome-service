import {
  BaseController,
  Controller,
  Get,
  Inject,
} from '/#/server'
import { baseMenu } from '../../entity/menu'
import { MenuService } from '../../service/rbac'

@Controller({
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseMenu,
  service: MenuService,
  pageQueryOp: {
    keyWordLikeFields: ['name', 'router', 'viewPath', 'icon', 'perms'],
    fieldEq: ['type', 'parentId', 'isShow', 'keepAlive'],
    fieldLike: ['appKey', 'remoteName'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
  listQueryOp: {
    keyWordLikeFields: ['name', 'router', 'viewPath', 'icon', 'perms'],
    fieldEq: ['type', 'parentId', 'isShow', 'keepAlive'],
    fieldLike: ['appKey', 'remoteName'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
})
export class MenuController extends BaseController {
  @Inject()
  menuService: MenuService

  @Get('/tree', { summary: '菜单树' })
  async tree() {
    const rows = await this.menuService.listAll()
    return this.ok(rows)
  }
}
