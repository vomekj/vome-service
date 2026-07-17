import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { unlinkSync } from 'node:fs'
import { t } from 'elysia'
import {
  BaseController,
  Body,
  Controller,
  Inject,
  Post,
} from '/#/server'
import { ModuleService } from '../../service/module'

@Controller()
export class ModuleController extends BaseController {
  @Inject()
  moduleService: ModuleService

  @Post('/install', { summary: '安装业务模块' })
  async install(
    @Body(
      t.Object({
        file: t.File(),
      }),
    )
    body: { file: File },
  ) {
    const buf = Buffer.from(await body.file.arrayBuffer())
    const tmp = join(tmpdir(), `vome-mod-${Date.now()}.vome`)
    await Bun.write(tmp, buf)
    try {
      const result = await this.moduleService.install(tmp)
      return this.ok(result)
    } finally {
      try {
        unlinkSync(tmp)
      } catch {
        /* ignore */
      }
    }
  }

  @Post('/list', { summary: '已安装业务模块列表' })
  async list() {
    return this.ok(await this.moduleService.list())
  }

  @Post('/delete', { summary: '卸载业务模块' })
  async remove(
    @Body(
      t.Object({
        key: t.String({ minLength: 1 }),
      }),
    )
    body: { key: string },
  ) {
    return this.ok(await this.moduleService.remove(body.key))
  }
}
