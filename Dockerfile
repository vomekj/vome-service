# 混淆 JS + linux-x64 sharp（不走 bun --compile，避免 native 模块无法解析）
# 构建：bun run docker:pack
FROM oven/bun:1.4.0-debian AS runtime

WORKDIR /app

COPY dist/index.js /app/index.js
COPY dist/node_modules /app/node_modules
COPY assets/captcha /app/assets/captcha

RUN mkdir -p /app/.vome /app/logging

ENV NODE_ENV=prod

EXPOSE 3000

CMD ["bun", "run", "/app/index.js"]
