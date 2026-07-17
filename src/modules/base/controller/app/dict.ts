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
import { DictInfoService } from '../../service/dict'

/** App 端字典同步（公开） */
@Controller()
export class AppDictInfoController extends BaseController {
  @Inject()
  dictInfo: DictInfoService

  @Public()
  @Get('/types', { summary: '字典类型列表' })
  async types() {
    return this.ok(await this.dictInfo.types())
  }

  @Public()
  @Post('/data', { summary: '获得字典数据（扁平，前端组树）' })
  async data(
    @Body(t.Object({ types: t.Optional(t.Array(t.String())) }))
    body: { types?: string[] },
  ) {
    return this.ok(await this.dictInfo.data(body.types ?? []))
  }

  @Public()
  @Post('/get', { summary: '按类型 key 获得字典树' })
  async get(
    @Body(t.Object({ key: t.String() }))
    body: { key: string },
  ) {
    return this.ok(await this.dictInfo.get(body.key))
  }

  @Public()
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

  @Public()
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

  @Public()
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

  @Public()
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
