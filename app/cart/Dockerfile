FROM node:20-bookworm-slim

ENV INSTANA_AUTO_PROFILE true

EXPOSE 8080

WORKDIR /opt/server

COPY --chown=node:node package.json ./

RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

COPY --chown=node:node server.js ./

USER node
CMD ["node", "server.js"]

