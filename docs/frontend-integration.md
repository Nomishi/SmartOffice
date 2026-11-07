# Tài liệu tích hợp Frontend (M4) — SmartOffice Backend (M3)

Tài liệu hướng dẫn đội Frontend (M4) tích hợp với hệ thống Backend Spring Boot (M3) của dự án **SmartOffice - Phòng làm việc thông minh IoT**.

---

## 1. Thông tin chung & Endpoint cơ sở

- **Base URL Dev:** `http://localhost:8080`
- **Swagger UI:** `http://localhost:8080/swagger-ui/index.html` (hoặc `/swagger-ui.html`)
- **OpenAPI JSON Docs:** `http://localhost:8080/v3/api-docs`
- **CORS:** Đã kích hoạt cho `http://localhost:5173`, `http://localhost:3000` (cấu hình qua biến môi trường `CORS_ALLOWED_ORIGINS`).
- **Thời gian (Timestamp):** Định dạng chuẩn ISO-8601 UTC (ví dụ: `2026-10-24T15:30:00Z`).

---

## 2. Xác thực (Authentication) & Phân quyền (RBAC)

Hệ thống sử dụng JWT HS256 (`Authorization: Bearer <token>`). Thời hạn token: 3600 giây (1 giờ).

### 2.1 Tài khoản Dev Seed sẵn

| Username | Password | Role | Quyền hạn |
| :--- | :--- | :--- | :--- |
| `admin` | `adminPassword123!` | `ADMIN` | Toàn quyền: quản lý user, cấu hình thiết bị, decommission, audit log, điều khiển. |
| `operator1` | `operatorPassword123!` | `OPERATOR` | Điều khiển thiết bị, đổi chế độ AUTO/MANUAL, chỉnh rules/ngưỡng, xác nhận cảnh báo. |
| `viewer1` | `viewerPassword123!` | `VIEWER` | Chỉ xem dashboard, telemetry, trạng thái, danh sách cảnh báo, điện năng. |

### 2.2 Luồng Login & Gọi API

1. **Gửi Login:**
   - `POST /api/auth/login`
   - Payload:
     ```json
     {
       "username": "operator1",
       "password": "operatorPassword123!"
     }
     ```
   - Phản hồi:
     ```json
     {
       "token": "eyJhbGciOiJIUzI1NiJ9...",
       "tokenType": "Bearer",
       "expiresIn": 3600,
       "user": {
         "userId": 2,
         "username": "operator1",
         "role": "OPERATOR",
         "accountStatus": "ACTIVE",
         "createdAt": "2026-10-24T15:30:00Z",
         "lastLoginAt": "2026-10-24T15:30:00Z"
       }
     }
     ```
2. **Lưu Token:** Lưu `token` vào `localStorage` hoặc Cookie an toàn.
3. **Đính kèm Header:** Trong mọi request sau đó, thêm header:
   ```http
   Authorization: Bearer <token>
   ```

---

## 3. Realtime Stream (Server-Sent Events — SSE)

Dashboard realtime lắng nghe cập nhật trực tiếp qua SSE tại:
- **URL:** `GET /api/stream`
- **Xác thực SSE:** Do `EventSource` của trình duyệt không hỗ trợ custom header `Authorization`, Frontend có thể truyền token qua query parameter hoặc header nếu dùng thư viện fetch-event-source:
  - Dùng query: `GET /api/stream?token=<token>`
  - Dùng header: `Authorization: Bearer <token>`
- **Heartbeat:** Backend tự động gửi comment `":ping"` mỗi 15 giây để duy trì kết nối.

### Các loại Sự kiện (Event types)

Event trả về định dạng JSON camelCase: `{"type":"...", "data":{...}, "timestamp":"..."}`

1. **`connected`**: Gửi ngay khi client kết nối thành công.
2. **`telemetry`**: Dữ liệu cảm biến mới từ Node A (`temperature`, `humidity`, `lux`, `presence`, `quality`, `airRaw`) hoặc Node B (`busVoltageV`, `light1PowerW`, `fan1PowerW`).
3. **`status`**: Trạng thái thiết bị thay đổi (online/offline, mode, actuators).
4. **`command`**: Cập nhật trạng thái lệnh (PENDING $\rightarrow$ SUCCESS / FAILED / TIMEOUT) kèm độ trễ `latencyMs`.
5. **`alert`**: Cảnh báo mới sinh ra, cập nhật giá trị hoặc cảnh báo đã đóng (`resolvedAt`).
6. **`config`**: Cập nhật phản hồi cấu hình thiết bị.

---

## 4. Danh mục API chính

### Quản lý thiết bị & Điều khiển (`/api/devices`)

- `GET /api/devices`: Danh sách thiết bị (phân trang `page`, `size`, `sort`).
- `GET /api/devices/{id}`: Chi tiết thiết bị.
- `GET /api/devices/{id}/status`: Trạng thái tức thời, actuators, telemetry mới nhất.
- `GET /api/devices/{id}/telemetry?from=...&to=...&page=0&size=20`: Lịch sử đo (tối đa 7 ngày, size mặc định 20).
- `GET /api/devices/{id}/energy?from=...&to=...&bucket=hour`: Điện năng tiêu thụ (`bucket`: `raw`, `minute`, `hour`, `day`).
- `POST /api/devices/{id}/commands`: Gửi lệnh điều khiển (`light1`, `fan1`, `buzzer1` nhận `ON`/`OFF`; `door1` nhận `OPEN`/`CLOSE`).
  - Hỗ trợ header `Idempotency-Key: <UUID>`.
  - Mặc định trả `202 Accepted`. Truyền `?wait=true` để chờ kết quả tối đa 10s.
  - Phân quyền: `ADMIN`, `OPERATOR`.
- `POST /api/devices/{id}/mode`: Đổi chế độ (`{"mode":"AUTO"|"MANUAL"}`). Phân quyền: `ADMIN`, `OPERATOR`.
- `PUT /api/devices/{id}/config`: Cấu hình tần suất (`telemetryIntervalSec`, `heartbeatIntervalSec`). Phân quyền: `ADMIN`, `OPERATOR`.
- `POST /api/devices/{id}/activate|lock|decommission`: Quản lý vòng đời thiết bị. Phân quyền: `ADMIN`.

### Cảnh báo (`/api/alerts`)

- `GET /api/alerts?status=OPEN&type=&deviceId=&from=&to=&includeResolved=false`: Danh sách cảnh báo (mặc định ẩn các cảnh báo đã giải quyết).
- `PATCH /api/alerts/{id}/acknowledge`: Xác nhận xử lý cảnh báo. Phân quyền: `ADMIN`, `OPERATOR`.

### Luật tự động & Ngưỡng (`/api/rules`)

- `GET /api/rules`: Danh sách 5 luật mặc định (`TEMP_HIGH`, `AIR_BAD`, `ABSENCE_OFF`, `DOOR_OPEN_LIMIT`, `ENERGY_WASTE`).
- `PUT /api/rules/{id}`: Bật/tắt luật hoặc cập nhật tham số ngưỡng (`params`). Phân quyền: `ADMIN`, `OPERATOR`.

### Người dùng & Audit Log

- `GET /api/users/me`: Thông tin tài khoản hiện tại.
- `PUT /api/users/me/password`: Đổi mật khẩu tài khoản hiện tại (`oldPassword`, `newPassword`).
- `GET /api/users`: Quản lý danh sách người dùng. Phân quyền: `ADMIN`.
- `POST /api/users`: Tạo người dùng mới. Phân quyền: `ADMIN`.
- `GET /api/audit-logs`: Nhật ký kiểm toán thao tác hệ thống. Phân quyền: `ADMIN`.

---

## 5. Chuẩn phản hồi lỗi (Error Format)

Tất cả các lỗi được trả về thống nhất theo chuẩn Contract v1.3:

```json
{
  "error": {
    "code": "DEVICE_OFFLINE",
    "message": "Thiết bị đang offline",
    "details": null,
    "timestamp": "2026-10-24T15:30:00Z"
  }
}
```

Các mã lỗi phổ biến:
- `400 VALIDATION_ERROR`: Dữ liệu sai định dạng, thiếu trường bắt buộc, khoảng thời gian `from`/`to` quá 7 ngày.
- `401 UNAUTHORIZED`: Chưa đăng nhập hoặc token sai.
- `401 TOKEN_EXPIRED`: Token đã hết hạn, Frontend cần redirect về trang login.
- `403 FORBIDDEN`: Không có quyền thao tác (ví dụ VIEWER gửi lệnh điều khiển).
- `404 NOT_FOUND`: Không tìm thấy tài nguyên.
- `409 DEVICE_OFFLINE`: Thiết bị đang offline, không nhận lệnh.
- `409 DEVICE_LOCKED`: Thiết bị đang bị khóa.
- `409 COMMAND_DUPLICATE`: Trùng Idempotency-Key với nội dung khác.
- `503 MQTT_UNAVAILABLE`: Mất kết nối tới broker MQTT.
- `504 COMMAND_TIMEOUT`: Hết thời gian chờ ACK khi dùng `?wait=true`.

