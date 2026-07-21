FROM node:22-alpine AS build
WORKDIR /app
# Prisma's engine binaries can't detect libssl on plain node:22-alpine
# (Alpine's OpenSSL 3.x isn't auto-detected), which makes both `prisma
# generate` and `prisma migrate deploy` fail at runtime with a cryptic
# "Could not parse schema engine response" error. Installing openssl
# explicitly fixes detection.
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl
ENV NODE_ENV=production
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY package*.json ./
# Full install (not --omit=dev): the Prisma CLI is needed at container
# start to run `prisma migrate deploy` against whatever Postgres the
# container is pointed at.
RUN npm ci
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
RUN npx prisma generate
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh && chown -R appuser:appgroup /app
USER appuser
EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
