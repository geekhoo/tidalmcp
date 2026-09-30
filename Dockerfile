FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
ENV DATA_DIR=/data LISTEN_HOST=0.0.0.0 PORT=3000
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "src/main.mjs", "--http"]
