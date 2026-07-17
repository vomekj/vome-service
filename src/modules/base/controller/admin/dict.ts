import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Public,
} from '/#/server'
import { baseDictInfo } from '../../entity/dict-info'
import { baseDictType } from '../../entity/dict-type'
import { DictInfoService, DictTypeService } from '../../service/dict'

/** 字典项 CRUD + 取值接口 → /admin/base/dict/info */
@Controller({
  prefix: '/base/dict/info',
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseDictInfo,
  service: DictInfoService,
  listQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: [{ column: 'typeId', none: true }, 'parentId'],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
  pageQueryOp: {
    keyWordLikeFields: ['name'],
    fieldEq: [{ column: 'typeId', none: true }, 'parentId'],
    fieldLike: ['remark'],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { orderNum: 'asc', createTime: 'asc' },
  },
})
export class DictInfoController extends BaseController {
  @Inject()
  dictInfo: DictInfoService

  @Public()
  @Get('/types', { summary: '字典类型列表' })
  async types() {
    return this.ok(await this.dictInfo.types())
  }

  @Post('/data', { summary: '获得字典数据（扁平，前端组树）' })
  async data(
    @Body(t.Object({ types: t.Optional(t.Array(t.String())) }))
    body: { types?: string[] },
  ) {
    return this.ok(await this.dictInfo.data(body.types ?? []))
  }

  @Post('/get', { summary: '按类型 key 获得字典树' })
  async get(
    @Body(t.Object({ key: t.String() }))
    body: { key: string },
  ) {
    return this.ok(await this.dictInfo.get(body.key))
  }

  @Post('/find', { summary: '按类型 key + value 找树节点' })
  async find(
    @Body(
      t.Object({
        key: t.String(),
        value: t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]),
      }),
    )
    body: { key: string; value: string | number | boolean | null },
  ) {
    return this.ok(await this.dictInfo.find(body.key, body.value))
  }

  @Post('/getValues', { summary: '存值反查展示名' })
  async getValues(
    @Body(
      t.Object({
        key: t.String(),
        value: t.Union([
          t.String(),
          t.Number(),
          t.Array(t.Union([t.String(), t.Number()])),
        ]),
      }),
    )
    body: {
      key: string
      value: string | number | Array<string | number>
    },
  ) {
    return this.ok(await this.dictInfo.getValues(body.value, body.key))
  }

  @Post('/pathValue', { summary: '按名称路径直取树上 value' })
  async pathValue(
    @Body(
      t.Object({
        key: t.String(),
        path: t.Array(t.String()),
      }),
    )
    body: { key: string; path: string[] },
  ) {
    return this.ok(await this.dictInfo.pathValue(body.key, body.path))
  }

  @Post('/childValue', { summary: '按父 value + 子名称直取子 value' })
  async childValue(
    @Body(
      t.Object({
        key: t.String(),
        parentValue: t.Union([t.String(), t.Number(), t.Boolean(), t.Null()]),
        childName: t.String(),
      }),
    )
    body: {
      key: string
      parentValue: string | number | boolean | null
      childName: string
    },
  ) {
    return this.ok(
      await this.dictInfo.childValue(body.key, body.parentValue, body.childName),
    )
  }
}

/** 字典类型 CRUD → /admin/base/dict/type */
@Controller({
  prefix: '/base/dict/type',
  api: ['add', 'delete', 'update', 'info', 'list', 'page', 'restore'],
  entity: baseDictType,
  service: DictTypeService,
  listQueryOp: {
    keyWordLikeFields: ['name', 'key'],
    fieldEq: [],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
  pageQueryOp: {
    keyWordLikeFields: ['name', 'key'],
    fieldEq: [],
    fieldLike: [],
    fieldArray: [],
    fieldRange: [
      { column: 'createTime', min: 'startTime', max: 'endTime', type: 'day' },
    ],
    addOrderBy: { createTime: 'desc' },
  },
})
export class DictTypeController extends BaseController {}
