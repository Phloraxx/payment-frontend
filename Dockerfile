FROM node:22.23.1-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run check

FROM nginx:1.28-alpine AS runtime
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY docker-entrypoint-paygate.sh /usr/local/bin/paygate-entrypoint
RUN chmod 0755 /usr/local/bin/paygate-entrypoint
COPY --from=build /app/dist/client /usr/share/nginx/html
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health | grep -q '"status":"ok"' || exit 1
ENTRYPOINT ["/usr/local/bin/paygate-entrypoint"]
