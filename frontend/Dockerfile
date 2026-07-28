FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite inlines VITE_* variables at build time (static output), so these
# have to be supplied as build args here rather than container runtime
# environment variables (which would have no effect post-build) - and
# .env is deliberately excluded from the build context (.dockerignore),
# so Vite would never see it there either way.
ARG VITE_API_URL=http://localhost:4000
ARG VITE_RECAPTCHA_SITEKEY=6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_RECAPTCHA_SITEKEY=$VITE_RECAPTCHA_SITEKEY
RUN npm run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
