# INDUSTRIAL HSE HSE PRO — production image
# Node 22 LTS: supported until 2027-04-30 and has prebuilt native binaries for
# better-sqlite3, which avoids an unnecessary source compile.
FROM node:22-alpine AS build
# Toolchain for any native module that still needs to compile.
RUN apk upgrade --no-cache \
 && apk add --no-cache python3 make g++ linux-headers
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# The build needs dev dependencies; they are removed before the copy below.
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
# The date keys the build cache so this layer installs today's OS fixes; AppJet keeps it current on deploy.
RUN echo "os-refresh 2026-11-23" && apk upgrade --no-cache && apk add --no-cache libstdc++
WORKDIR /app
COPY --from=build /app ./
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
# Non-root runtime user; the SQLite fallback database lives in /app/data.
RUN mkdir -p /app/data /home/appjet && chown -R 10001:10001 /app /home/appjet
ENV HOME=/home/appjet
ENV DATADIR=/app/data
USER 10001:10001
CMD ["npm", "start"]
