# --- build ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
# Có package-lock.json thì cài đúng phiên bản đã khóa (npm ci), chưa có thì npm install
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# true = bản demo chạy dữ liệu giả; false = gọi backend thật qua /api
ARG VITE_USE_MOCK=false
ENV VITE_USE_MOCK=$VITE_USE_MOCK
RUN npm run build

# --- chạy ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
