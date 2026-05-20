FROM node:20-slim

RUN npm install -g pnpm@10

WORKDIR /app

COPY pnpm-workspace.yaml ./
COPY package.json ./
COPY tsconfig.base.json ./
COPY artifacts/discord-bot ./artifacts/discord-bot/

RUN cd artifacts/discord-bot && pnpm install --ignore-scripts

WORKDIR /app/artifacts/discord-bot

CMD ["node", "--import", "tsx/esm", "src/index.ts"]
