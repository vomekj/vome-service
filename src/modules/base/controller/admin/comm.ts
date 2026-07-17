import {
  BaseController,
  Controller,
  IgnorePerms,
  Inject,
  Post,
} from '/#/server'
import { PluginInfoService } from '../../service/plugin'

type UploadPlugin = {
  upload: () => Promise<unknown>
}

/**
 * 后台通用接口（登录即可，不校权限码）
 * 仅云端：返回上传插件签名；未安装/配置错误直接抛错
 */
@Controller({ description: '通用接口' })
export class AdminCommController extends BaseController {
  @Inject()
  plugin: PluginInfoService

  @IgnorePerms()
  @Post('/upload', { summary: '获取云端上传签名' })
  async upload() {
    const file = (await this.plugin.getInstance('upload')) as UploadPlugin
    return this.ok(await file.upload())
  }
}
