# M4 — Frontend setup & integration guide

Frontend thực tế nằm ở `iot-frontend/` (React + Vite + TypeScript + Ant Design + TanStack Query + Recharts).

**Không cần** Java/Maven/PostgreSQL/Mosquitto để làm frontend, trừ khi tự chạy backend.

## 1. Chạy nhanh bằng full stack Docker

Cách gọn nhất, có backend + Postgres + Mosquitto ACL + frontend:

```powershell
cd iot-infra
Copy-Item .env.example .env      # đổi mật khẩu nếu cần; KHÔNG commit .env
docker compose --profile ui up -d --build
docker compose ps
```

Mở: `http://localhost:3000`.

| Thành phần | URL |
| --- | --- |
| Frontend (nginx) | `http://localhost:3000` |
| Backend qua nginx | `http://localhost:3000/api/...` |
| Swagger | `http://localhost:8080/swagger-ui/index.html` |
| MQTT (auth) | `localhost:1883` |
| PostgreSQL | `localhost:5432` |

Tài khoản dev backend (khi `SEED_DEV_USERS=true`):

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

> Nếu đổi `ADMIN_PASSWORD`... trong `.env` thì dùng mật khẩu mới.

## 2. Chạy frontend dev (không Docker)

```powershell
cd iot-frontend
Copy-Item .env.example .env
npm ci
```

Sửa `.env`:

```env
VITE_USE_MOCK=false
VITE_API_PROXY=http://localhost:8080
# VITE_REALTIME_URL=/api/stream
```

Chạy:

```powershell
npm run dev        # http://localhost:5173
```

Vite proxy `/api/*` sang backend, gồm cả SSE `/api/stream`.
Backend cần chạy ở `8080` (Docker `iot-infra` hoặc backend-only).

## 3. Chạy frontend bằng mock (không cần backend)

```env
VITE_USE_MOCK=true
```

```powershell
npm run dev
```

Tài khoản mock trong trình duyệt (khác backend thật):

| Username | Password |
| --- | --- |
| `admin` | `admin123` |
| `operator1` | `operator123` |
| `viewer1` | `viewer123` |

Mock có sẵn telemetry 5s, ACK, alert, lịch sử, energy để làm UI.

## 4. Build & Docker

```powershell
cd iot-frontend
npm run typecheck
npm test
npm run build
```

Docker image:

```powershell
docker build -t iot-frontend --build-arg VITE_USE_MOCK=false .
# hoặc bản demo không cần backend:
docker build -t iot-frontend-demo --build-arg VITE_USE_MOCK=true .
```

Nginx trong container:

- Serve SPA.
- Proxy `/api/` → `http://backend:8080`.
- Tắt buffer cho SSE.

## 5. Auth & API

Frontend dùng các biến/env và code có sẵn:

- `src/api/client.ts` — gắn `Authorization: Bearer <token>`, xử lý lỗi `{error:{code,message}}`, tự logout khi 401.
- `src/api/endpoints.ts` — mapping endpoint contract.
- `src/auth/permissions.ts` — phân quyền ADMIN/OPERATOR/VIEWER.
- `src/realtime.ts` — SSE bằng `fetch-event-source`, gửi Bearer header (không cần `?token=`).
- `src/hooks/useRealtimeSync.ts` — đẩy event vào cache React Query.

Endpoint backend: xem [`frontend-integration.md`](frontend-integration.md) và Swagger.

## 6. Checklist M4

- [ ] `npm ci` + `npm run dev` chạy ở 5173.
- [ ] Login operator/admin thành công, token được lưu.
- [ ] Viewer chỉ đọc; nút điều khiển bị khóa; `/users` 403.
- [ ] Dashboard nhận SSE telemetry/status/alert.
- [ ] Bật/tắt đèn, quạt, buzzer, cửa; thấy PENDING → ACK.
- [ ] Lịch sử telemetry + energy.
- [ ] Alert list + acknowledge.
- [ ] Rule xem/sửa đúng quyền.
- [ ] Admin đăng ký/activate/lock device, quản lý user.
- [ ] `npm test`, `npm run build` xanh.
- [ ] Docker image build + chạy qua nginx.

## 7. Lỗi thường gặp

| Lỗi | Cách xử lý |
| --- | --- |
| 401 | Token thiếu/hết hạn; login lại |
| 403 | Viewer gọi API điều khiển; dùng operator/admin |
| CORS | Dev dùng Vite proxy; Docker dùng nginx cùng origin. Nếu gọi thẳng 8080, thêm origin vào `CORS_ALLOWED_ORIGINS` |
| 409 `DEVICE_OFFLINE` | Chưa có telemetry/status; chạy simulator hoặc mock |
| 409 `DEVICE_NOT_ACTIVE` | Device mới `REGISTERED`; gọi `/activate` |
| SSE 401 | Token hết hạn; login lại |
| `localhost:1883` nối nhầm Windows Mosquitto | Dùng IP LAN của PC hoặc tắt service Mosquitto |
| Docker frontend không gọi được backend | Kiểm tra service tên `backend`, cổng 8080, network compose |

## 8. Không được làm

- Không hardcode dữ liệu mock vào UI; dùng API hoặc mock server có sẵn.
- Không commit `.env`, token, mật khẩu thật.
- Không đổi field/endpoint contract khi chưa báo M3; contract v1.3 đã freeze.
- Không gọi MQTT trực tiếp từ browser.
