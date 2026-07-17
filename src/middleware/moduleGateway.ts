import { createModuleGateway } from '/#/server'
import { adminAuth } from './adminAuth'

/** 业务模块网关：注入宿主 adminAuth */
export const moduleGateway = createModuleGateway({ adminAuth })
