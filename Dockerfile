# Anesthesia Mock Exam Platform
# Node 24 is required: it provides the built-in `node:sqlite` module (no native build).

FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Store the database (and secret) on a mounted volume so data persists across deploys.
ENV AMX_DB=/data/app.db
ENV AMX_SECRET_FILE=/data/secret.key

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "--no-warnings", "server/index.js"]
