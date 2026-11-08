# M4 — Frontend setup & integration guide

Tài liệu cho M4 khởi động frontend và nối backend M3. Áp dụng cho Windows (PowerShell),
nhưng lệnh npm chạy được trên macOS/Linux.

## 0. TL;DR — frontend cần gì?

**Không cần** cài Java, Maven, PostgreSQL hay Mosquitto.

Chỉ cần:

- Node.js **20 LTS trở lên** (khuyến nghị 20 hoặc 22 LTS; máy hiện tại đang Node 25 vẫn chạy được)
- npm (đi kèm Node) hoặc pnpm
- Git
- Backend M3 đang chạy tại `http://localhost:8080` (đã có sẵn, hoặc tự bật bằng Docker)

Frontend chỉ giao tiếp với backend qua:

- **REST** (`/api/...`) — login, device, command, alert, rule, history, energy
- **SSE** (`/api/stream`) — realtime dashboard

Frontend **không** kết nối trực tiếp MQTT/ESP32.

## 1. Kiểm tra backend trước

```powershell
Invoke-RestMethod http://localhost:8080/actuator/health
```

Kỳ vọng: `status = UP`.

Nếu backend chưa chạy, xem mục 3. Hiện tại máy dev đã có container backend healthy.

## 2. Setup frontend

### 2.1. Lấy code

```powershell
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
git checkout feature/backend-complete
```

> `main` chưa có P0 backend. M4 nên làm nhánh frontend **từ `feature/backend-complete`**
> để có docs + contract mới nhất:
>
> ```powershell
> git checkout -b feature/frontend-dashboard
> ```

### 2.2. Tạo app frontend (nếu chưa có)

Khuyến nghị Vite + React + TypeScript cho MVP:

```powershell
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install react-router-dom
```

Nếu nhóm chọn Next.js/Vue thì giữ nguyên phần API/SSE bên dưới; chỉ đổi cách dựng project.

### 2.3. Cấu hình môi trường

Tạo `frontend/.env.local`:

```env
VITE_API_BASE_URL=http://localhost:8080
VITE_SSE_URL=http://localhost:8080/api/stream
```

Vite chỉ expose biến bắt đầu bằng `VITE_`.

### 2.4. Chạy dev server

```powershell
npm run dev
```

Mặc định: `http://localhost:5173`.

Backend đã bật CORS cho `http://localhost:5173` và `http://localhost:3000`.
Nếu chạy port khác, set backend `CORS_ALLOWED_ORIGINS` rồi restart backend.

## 3. Bật backend (nếu chưa chạy)

### Cách A — Docker (khuyến nghị, đủ Postgres + Mosquitto + backend)

Tại thư mục gốc repo:

```powershell
Copy-Item .env.example .env
docker compose up -d
docker compose ps
```

Chờ `smartoffice-backend` healthy. Nếu Windows bị Mosquitto service chiếm 1883:

```env
# .env
MOSQUITTO_PORT=1884
```

Backend trong Docker vẫn dùng `mosquitto:1883` nội bộ; biến này chỉ đổi port host.

### Cách B — Chạy backend local (cần Java 17 + Maven + Postgres)

```powershell
cd backend
$env:JWT_SECRET = "smartoffice-local-secret-at-least-32-chars-long-123"
$env:SEED_DEV_USERS = "true"
mvn spring-boot:run -Dspring-boot.run.profiles=mock
```

`mock` giả lập M1+M2: telemetry 5s, heartbeat 30s, command ACK ~180ms.

## 4. Tài khoản dev

| Username | Password | Role |
| --- | --- | --- |
| `admin` | `adminPassword123!` | ADMIN |
| `operator1` | `operatorPassword123!` | OPERATOR |
| `viewer1` | `viewerPassword123!` | VIEWER |

Mật khẩu lấy từ env `ADMIN_PASSWORD` / `OPERATOR_PASSWORD` / `VIEWER_PASSWORD`.
Nếu đổi env, dùng mật khẩu mới.

## 5. Luồng đăng nhập

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:8080/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'

$token = $login.token
Invoke-RestMethod http://localhost:8080/api/devices `
  -Headers @{ Authorization = "Bearer $token" }
```

Response login:

```json
{
  "token": "eyJ...",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": { "userId": 2, "username": "operator1", "role": "OPERATOR", "accountStatus": "ACTIVE" }
}
```

Frontend nên:

- Lưu token (localStorage/sessionStorage cho MVP).
- Gắn `Authorization: Bearer <token>` cho mọi request `/api/**`.
- Gặp 401 → xóa token, về trang login.
- Ẩn nút điều khiển với `VIEWER`; chỉ `OPERATOR`/`ADMIN` được gửi lệnh.

## 6. API client mẫu

```ts
// src/api/client.ts
const BASE = import.meta.env.VITE_API_BASE_URL as string;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    throw new ApiError(res.status, body?.error?.code ?? 'UNKNOWN', body?.error?.message ?? res.statusText);
  }
  return body as T;
}
```

Lỗi backend luôn có dạng:

```json
{"error":{"code":"FORBIDDEN","message":"Không có quyền thực hiện thao tác này","details":null,"timestamp":"..."}}
```

## 7. SSE realtime

Backend: `GET /api/stream`, hỗ trợ `Authorization: Bearer` hoặc `?token=` (chỉ endpoint này).

```ts
const token = localStorage.getItem('token');
const es = new EventSource(
  `${import.meta.env.VITE_SSE_URL}?token=${encodeURIComponent(token ?? '')}`,
);

es.addEventListener('connected', (e) => console.log('SSE connected', JSON.parse(e.data)));
es.addEventListener('telemetry', (e) => handleTelemetry(JSON.parse(e.data)));
es.addEventListener('status', (e) => handleStatus(JSON.parse(e.data)));
es.addEventListener('alert', (e) => handleAlert(JSON.parse(e.data)));
es.addEventListener('command', (e) => handleCommand(JSON.parse(e.data)));
es.addEventListener('config', (e) => handleConfig(JSON.parse(e.data)));

es.onerror = () => {
  // EventSource tự reconnect; cập nhật UI "đang kết nối lại..."
};
```

Mỗi event có dạng:

```json
{"type":"telemetry","data":{ "...":"..." },"timestamp":"2026-11-08T01:00:00Z"}
```

Lưu ý:

- Không log URL SSE ra console production (token nằm trong query).
- Khi logout: `es.close()`.
- Token hết hạn: SSE sẽ 401; login lại rồi tạo EventSource mới.

## 8. Endpoint M4 cần dùng

Chi tiết đầy đủ: [`frontend-integration.md`](frontend-integration.md) và Swagger
`http://localhost:8080/swagger-ui/index.html`.

| Chức năng | API |
| --- | --- |
| Login | `POST /api/auth/login` |
| User hiện tại | `GET /api/users/me` |
| Đổi mật khẩu | `PUT /api/users/me/password` |
| Danh sách thiết bị | `GET /api/devices?page=&size=&sort=` |
| Đăng ký thiết bị (Admin) | `POST /api/devices` → 201 `REGISTERED` |
| Kích hoạt / khóa / decommission | `POST /api/devices/{id}/activate|lock|decommission` |
| Trạng thái + actuator | `GET /api/devices/{id}/status` |
| Lịch sử telemetry | `GET /api/devices/{id}/telemetry?from=&to=&page=&size=` |
| Điện năng | `GET /api/devices/{id}/energy?from=&to=&bucket=hour` |
| Gửi lệnh | `POST /api/devices/{id}/commands` (`Idempotency-Key`, `?wait=true`) |
| Lịch sử lệnh | `GET /api/devices/{id}/commands` |
| Mode AUTO/MANUAL | `POST /api/devices/{id}/mode` |
| Config thiết bị | `PUT /api/devices/{id}/config` |
| Cảnh báo | `GET /api/alerts`, `PATCH /api/alerts/{id}/acknowledge` |
| Rule | `GET /api/rules`, `PUT /api/rules/{id}` |
| Audit (Admin) | `GET /api/audit-logs` |
| Realtime | `GET /api/stream` |

Quyền:

- `VIEWER`: chỉ đọc dashboard/history/alerts/rules.
- `OPERATOR`: điều khiển, mode, config, sửa rule, ack alert.
- `ADMIN`: tất cả + user + device lifecycle + audit.

## 9. Checklist M4 phải làm xong

- [ ] Login admin/operator/viewer, lưu token, logout xóa token.
- [ ] Ẩn nút điều khiển với viewer; gọi API lỗi 403 hiển thị đúng.
- [ ] Danh sách thiết bị + trạng thái online/offline + actuator.
- [ ] Dashboard nhận SSE telemetry/status/alert.
- [ ] Bật/tắt đèn, quạt; hiển thị ACK `SUCCESS/FAILED/TIMEOUT`.
- [ ] Lịch sử telemetry theo from/to.
- [ ] Biểu đồ energy theo bucket.
- [ ] Danh sách alert + acknowledge.
- [ ] Xem/sửa rule ngưỡng.
- [ ] Admin: đăng ký device, activate, danh sách user.
- [ ] Xử lý loading/empty/error; đặc biệt `quality = INVALID/SUSPECT`.
- [ ] Chạy được với backend mock, không hardcode dữ liệu.

## 10. Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách sửa |
| --- | --- |
| 401 `UNAUTHORIZED` | Thiếu/sai Bearer token; login lại |
| 401 `TOKEN_EXPIRED` | Token quá 3600s; login lại |
| 403 `FORBIDDEN` | Viewer gọi API điều khiển; dùng operator/admin |
| CORS error | Origin phải đúng `http://localhost:5173`; thêm vào `CORS_ALLOWED_ORIGINS` rồi restart backend |
| 409 `DEVICE_OFFLINE` | Backend chưa nhận telemetry; chạy profile `mock` hoặc chờ thiết bị |
| 409 `DEVICE_NOT_ACTIVE` | Device mới `REGISTERED`; gọi `/activate` |
| 409 `DEVICE_EXISTS` | `deviceId` đã tồn tại |
| SSE 401 | Token thiếu/hết hạn; dùng `?token=` đúng |
| SSE tự ngắt | EventSource tự reconnect; hiển thị trạng thái "đang kết nối lại" |
| `docker compose` lỗi port 1883 | Windows Mosquitto đang chạy; set `MOSQUITTO_PORT=1884` |
| Backend không start | Thiếu `JWT_SECRET` ≥ 32 ký tự hoặc DB chưa sẵn sàng |

## 11. Không được làm

- Không dùng header `X-User-Id` (đã bỏ).
- Không gọi MQTT trực tiếp từ frontend.
- Không hardcode dữ liệu mock vào UI; phải lấy từ API.
- Không đổi field/endpoint contract khi chưa báo M3; contract v1.3 đã freeze.
- Không commit `.env.local`, token, mật khẩu thật.

## 12. Cấu trúc gợi ý

```text
frontend/src/
├── api/client.ts
├── auth/AuthContext.tsx
├── hooks/useRealtime.ts
├── pages/
│   ├── LoginPage.tsx
│   ├── DashboardPage.tsx
│   ├── DevicesPage.tsx
│   ├── AlertsPage.tsx
│   ├── RulesPage.tsx
│   ├── HistoryPage.tsx
│   └── UsersPage.tsx
├── components/
└── types/api.ts
```

## 13. Định nghĩa "setup xong"

M4 được coi là setup xong khi:

1. `npm run dev` chạy tại `localhost:5173`.
2. Login `operator1` thành công, gọi được `GET /api/devices`.
3. Mở SSE thấy event `connected` + telemetry.
4. Bấm bật/tắt đèn thấy ACK và trạng thái đổi.
5. Không còn lỗi CORS/401/403 ngoài ý muốn.

Khi đạt 5 điều trên, M4 có thể bắt đầu làm UI thật song song với việc M3 test phần cứng.
