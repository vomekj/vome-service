# 运行混淆编译产物 dist/service（bun-linux-x64）
# 构建：bun run docker:pack
# 配置经 provideHostConfig 打进二进制；验证码字体放 assets/captcha
FROM debian:bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY dist/service /app/service
COPY assets/captcha /app/assets/captcha
RUN chmod +x /app/service \
  && mkdir -p /app/.vome /app/logging

ENV NODE_ENV=prod

EXPOSE 3000

CMD ["/app/service"]
