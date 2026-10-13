FROM oven/bun:1.4-alpine AS base
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src

RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DATA_DIR=/app/data

CMD ["bun", "src/index.ts"]
