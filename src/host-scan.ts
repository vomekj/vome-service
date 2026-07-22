/**
 * 由 scripts/gen-host-scan.ts 生成 — 勿手改
 * 重新生成: bun scripts/gen-host-scan.ts
 */
import {
  parseModuleFromPath,
  setControllerScanContext,
} from "/#/server"

const services: Array<() => Promise<unknown>> = [
  () => import("./modules/base/service/auth.ts"),
  () => import("./modules/base/service/conf.ts"),
  () => import("./modules/base/service/dict.ts"),
  () => import("./modules/base/service/log.ts"),
  () => import("./modules/base/service/module.ts"),
  () => import("./modules/base/service/permission.ts"),
  () => import("./modules/base/service/plugin-center.ts"),
  () => import("./modules/base/service/plugin.ts"),
  () => import("./modules/base/service/queue.ts"),
  () => import("./modules/base/service/rbac.ts"),
  () => import("./modules/base/service/task-scheduler.ts"),
  () => import("./modules/base/service/task.ts"),
  () => import("./modules/base/service/tenant.ts"),
  () => import("./modules/user/service/email.ts"),
  () => import("./modules/user/service/login.ts"),
  () => import("./modules/user/service/person.ts"),
  () => import("./modules/user/service/rbac.ts"),
  () => import("./modules/user/service/sms.ts"),
  () => import("./modules/user/service/wx.ts"),
]

const adminControllers: Array<{ file: string; load: () => Promise<unknown> }> = [
  { file: "modules/base/controller/admin/auth.ts", load: () => import("./modules/base/controller/admin/auth.ts") },
  { file: "modules/base/controller/admin/comm.ts", load: () => import("./modules/base/controller/admin/comm.ts") },
  { file: "modules/base/controller/admin/department.ts", load: () => import("./modules/base/controller/admin/department.ts") },
  { file: "modules/base/controller/admin/dict.ts", load: () => import("./modules/base/controller/admin/dict.ts") },
  { file: "modules/base/controller/admin/log.ts", load: () => import("./modules/base/controller/admin/log.ts") },
  { file: "modules/base/controller/admin/menu.ts", load: () => import("./modules/base/controller/admin/menu.ts") },
  { file: "modules/base/controller/admin/module.ts", load: () => import("./modules/base/controller/admin/module.ts") },
  { file: "modules/base/controller/admin/open.ts", load: () => import("./modules/base/controller/admin/open.ts") },
  { file: "modules/base/controller/admin/plugin.ts", load: () => import("./modules/base/controller/admin/plugin.ts") },
  { file: "modules/base/controller/admin/queue.ts", load: () => import("./modules/base/controller/admin/queue.ts") },
  { file: "modules/base/controller/admin/role.ts", load: () => import("./modules/base/controller/admin/role.ts") },
  { file: "modules/base/controller/admin/task.ts", load: () => import("./modules/base/controller/admin/task.ts") },
  { file: "modules/base/controller/admin/tenant.ts", load: () => import("./modules/base/controller/admin/tenant.ts") },
  { file: "modules/base/controller/admin/user.ts", load: () => import("./modules/base/controller/admin/user.ts") },
  { file: "modules/user/controller/admin/info.ts", load: () => import("./modules/user/controller/admin/info.ts") },
  { file: "modules/user/controller/admin/role.ts", load: () => import("./modules/user/controller/admin/role.ts") },
]

const appControllers: Array<{ file: string; load: () => Promise<unknown> }> = [
  { file: "modules/base/controller/app/comm.ts", load: () => import("./modules/base/controller/app/comm.ts") },
  { file: "modules/base/controller/app/dict.ts", load: () => import("./modules/base/controller/app/dict.ts") },
  { file: "modules/base/controller/app/open.ts", load: () => import("./modules/base/controller/app/open.ts") },
  { file: "modules/user/controller/app/comm.ts", load: () => import("./modules/user/controller/app/comm.ts") },
  { file: "modules/user/controller/app/info.ts", load: () => import("./modules/user/controller/app/info.ts") },
  { file: "modules/user/controller/app/login.ts", load: () => import("./modules/user/controller/app/login.ts") },
  { file: "modules/user/controller/app/rbac.ts", load: () => import("./modules/user/controller/app/rbac.ts") },
]

async function loadControllers(
  side: "admin" | "app",
  items: Array<{ file: string; load: () => Promise<unknown> }>,
) {
  for (const { file, load } of items) {
    setControllerScanContext({
      module: parseModuleFromPath(file),
      side,
      file,
    })
    try {
      await load()
    } finally {
      setControllerScanContext(null)
    }
  }
}

/** registerHost({ scan: loadHostModules }) */
export async function loadHostModules() {
  for (const load of services) await load()
  await loadControllers("admin", adminControllers)
  await loadControllers("app", appControllers)
  console.log(
    `[Host] scan ← ${services.length} service, ${adminControllers.length + appControllers.length} controller (bundled)`,
  )
}
