import {
  BaseController,
  Controller,
  Inject,
  Post,
} from '/#/server'
import { PluginInfoService } from '../../../base/service/plugin'

type UploadPlugin = {
  upload: () => Promise<unknown>
}

/** App 通用接口（登录即可） */
@Controller({ description: '通用接口' })
export class AppCommController extends BaseController {
  @Inject()
  plugin: PluginInfoService

  @Post('/upload', { summary: '获取云端上传签名' })
  async upload() {
    const file = (await this.plugin.getInstance('upload')) as UploadPlugin
    return this.ok(await file.upload())
  }
}
