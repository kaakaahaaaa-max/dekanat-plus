FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
# База лежит в постоянном хранилище хостинга, чтобы заявки не пропадали при перезапуске
ENV DB_PATH=/data/dekanat.db
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "--no-warnings", "server.js"]
