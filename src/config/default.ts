/**
 * 默认配置（各环境共享）
 */
import type { DefaultConfig } from "../../typings/config/default";
import { availablePort } from "../lib/port";

const config: DefaultConfig = {
  /** JWT / Cookie 签名密钥（生产务必更换） */
  keys: "vome-service-jwt-secret-key-change-in-prod",
  system: {
    /** HTTP 端口；占用时自动换端口 */
    port: availablePort(3000),
  },
  openapi: {
    enable: true,
    path: "/docs",
    documentation: {
      info: {
        title: "Vome API",
        version: "1.0.0",
        description: "Vome Admin 接口文档",
      },
    },
  },
  /** 请求级异步上下文 */
  asyncContextManager: {
    enable: true,
  },
  cacheManager: {
    store: "redis",
    options: {
      port: 6379,
      host: "8.134.209.56",
      password: "xbaokj123",
      db: 5,
      family: 4,
    },
  },
  /** Socket.IO */
  socketIO: {
    path: "/socket.io/",
    upgrades: ["websocket"],
    redisAdapter: true,
  },
  auth: {
    basePath: "/api/auth",
    trustedOrigins: ["http://localhost:*", "http://127.0.0.1:*"],
    jwt: {
      accessExpiresIn: 15 * 60,
      refreshExpiresIn: 7 * 24 * 60 * 60,
    },
    social: {
      github: {
        clientId: "f59575715718504d113c",
        clientSecret: "67625359813193983e37378207506950c798588a",
      },
      google: {
        clientId:
          "708582658692-8jg8t12g7uj8t12g7uj8t12g7uj8t12g.apps.googleusercontent.com",
        clientSecret: "GOCSPX-12345678901234567890123456789012",
      },
      wechat: {
        clientId: "wxd930ea5d5a258f4f",
        clientSecret: "12345678901234567890123456789012",
      },
      gitee: {
        clientId: "12345678901234567890123456789012",
        clientSecret: "12345678901234567890123456789012",
      },
      steam: { apiKey: "12345678901234567890123456789012" },
    },
  },
  vome: {
    /** 多租户数据隔离；true 开启后按 Context.tenantId 过滤，超管豁免 */
    tenant: false,
    /** 均可省略：upsert 默认 insert，softDelete 默认 false */
    crud: {
      /** save：有 id 则更新；insert：只插入 */
      upsert: "save",
      /** true：删除进回收站（需 deletedAt 列） */
      softDelete: true,
    },
  },
};

export default config;
