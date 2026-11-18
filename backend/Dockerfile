# Node 22 LTS (Node 20 ohne Sicherheits-Updates), per Digest – Sicherheits-Check 18.11.2026
FROM node:22.23.5-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a
RUN apk upgrade --no-cache

WORKDIR /app

# Dependencies
COPY package*.json ./
RUN npm install --omit=dev \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /root/.npm

# Source
COPY src ./src

EXPOSE 4000

CMD ["node", "src/index.js"]
