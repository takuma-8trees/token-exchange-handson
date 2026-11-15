FROM node:22.14.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public
USER node
CMD ["node", "src/web.mjs"]
