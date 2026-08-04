import { BaseController, Controller, Inject, Post } from '/#/server'
import { ProjectInfraService } from '../../service/infra'

@Controller({ description: 'App 项目基础设施探测' })
export class AppProjectInfraController extends BaseController {
  @Inject()
  infra: ProjectInfraService

  @Post('/health', { summary: 'DB / Redis / OSS / pgvector 探测' })
  async health() {
    return this.ok(await this.infra.health())
  }
}
