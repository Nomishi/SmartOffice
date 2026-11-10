# Frontend – Phòng làm việc thông minh IoT (M4)

React + Vite + TypeScript + Ant Design + TanStack Query + Recharts. Bám **Contract chung v1.3**.

## Chạy thử (không cần backend)

```bash
npm install
cp .env.example .env      # VITE_USE_MOCK=true
npm run dev               # http://localhost:5173
npm run typecheck         # kiểm tra kiểu TypeScript
npm test                  # chạy bộ test tự động (vitest)
```

Tài khoản mock: `admin / admin123`, `operator1 / operator123`, `viewer1 / viewer123`.

Thử nhanh:
- **Operator/Admin** bật tắt đèn, quạt, còi, mở/đóng cửa. Lệnh hiện `PENDING` rồi thành `SUCCESS` sau ACK (cửa chậm hơn, khoảng 2,5 giây).
- **Viewer** chỉ xem, các nút điều khiển bị khóa. Vào `/users` sẽ ra 403, chỉ Admin vào được.
- Telemetry đổi mỗi 5 giây. Nhiệt độ vượt 30°C ba lần liên tiếp thì sinh cảnh báo `TEMP_HIGH`.
- Dữ liệu `quality = INVALID` hiện "—", `SUSPECT` hiện kèm nhãn.

## Nối backend thật

1. `.env`: `VITE_USE_MOCK=false`, `VITE_API_PROXY=http://localhost:8080` (địa chỉ backend của M3).
2. `npm run dev`: Vite chuyển tiếp `/api/*` sang backend.

## Docker

```bash
docker build -t iot-frontend --build-arg VITE_USE_MOCK=false .
docker run -p 3000:80 iot-frontend
```

`nginx.conf` phục vụ file tĩnh, trả `index.html` cho mọi đường dẫn (SPA) và proxy `/api` sang `http://backend:8080` (có tắt đệm cho SSE). Xem `docker-compose.frontend.example.yml` để ghép vào compose chung.
Bản demo không cần backend: build với `--build-arg VITE_USE_MOCK=true`.

## Cấu trúc

```
src/
  types.ts             kiểu dữ liệu theo Contract (enum, payload, response)
  api/client.ts        fetch tập trung: gắn JWT, xử lý lỗi { error: { code, message } }, tự đăng xuất khi 401
  api/endpoints.ts     mỗi hàm = một endpoint ở Contract mục 8
  mock/server.ts       backend giả (chỉ nạp khi VITE_USE_MOCK=true)
  realtime.ts          SSE (thật) hoặc sự kiện giả (mock)
  hooks/useRealtimeSync.ts   đẩy sự kiện realtime vào cache React Query
  auth/                AuthContext, bảng phân quyền (Contract mục 10)
  components/          AppLayout, RequireAuth, EnvCard (Node A), ControlCard (Node B), OpenAlertsCard
  pages/               Login, Dashboard, Alerts, History (đo), Commands (lệnh), Energy, Devices, Rules, Audit (nhật ký), Users
```

## Đã làm / còn lại

**Đã có (phần lớn "MVP bắt buộc" của Contract mục 1 ở phía frontend):**
- Đăng nhập, phân quyền route và nút theo role, đổi mật khẩu.
- Dashboard Node A và Node B, điều khiển đèn/quạt/còi/cửa kèm `PENDING`→ACK và `Idempotency-Key`, chế độ AUTO/MANUAL.
- Cảnh báo (lọc, phân trang, xác nhận), lịch sử đo (biểu đồ + bảng), lịch sử lệnh (phân trang), báo cáo năng lượng.
- **Thiết bị:** đăng ký, kích hoạt, khóa, decommission (Admin, có hộp thoại xác nhận cho thao tác nguy hiểm); cấu hình tham số thiết bị từ xa (Admin/Operator).
- **Ngưỡng/Rule:** xem (mọi role), bật/tắt và sửa tham số (Admin/Operator) với đúng dải giá trị ở Contract 9.1.
- **Người dùng (Admin):** danh sách, tạo user.
- **Nhật ký thao tác (Admin, Operator giới hạn):** ai làm gì, lúc nào, thành công hay bị từ chối.
- **Chống thử mật khẩu:** nhận 429 `RATE_LIMITED` thì nút đăng nhập khóa và đếm ngược theo `Retry-After`.
- **Header bảo mật Nginx:** Content-Security-Policy, X-Frame-Options, nosniff, Referrer-Policy (xem `nginx.conf`).
- **Test tự động:** 41 test (backend giả, phân quyền, lớp gọi API, định dạng) trong các file `*.test.ts`.

**Còn làm:** đổi vai trò/khóa tài khoản user (Contract chưa có endpoint), biểu đồ telemetry dài hạn (cần M3, xem dưới), test giao diện React (cần thêm testing-library), kiểm tra giao diện trên màn hình nhỏ.

Thử nhanh phần mới bằng mock: đăng nhập `admin`, vào **Thiết bị** → đăng ký một thiết bị → Kích hoạt → Khóa → Decommission. Thiết bị bị khóa sẽ offline và dashboard khóa nút điều khiển. Vào **Ngưỡng/Rule**, đổi ngưỡng `TEMP_HIGH` xuống 27°C thì cảnh báo nhiệt độ cao sinh ra nhanh hơn. Đăng nhập `operator1` để thấy Operator sửa được rule nhưng không đăng ký/khóa được thiết bị; `viewer1` chỉ xem.

## Cần chốt với M3

### Các điểm Contract chưa mô tả (frontend đang giả định)

1. `POST /api/devices`: body `{ deviceId, name, type, roomId }`, trả `201` + Device.
2. `POST /api/devices/{id}/activate|lock|decommission`: trả `200` + Device đã cập nhật. Chuyển trạng thái sai trả `409` với mã gì? Mock đang dùng `INVALID_STATE` (chưa có trong bảng mã lỗi 8.3). Trạng thái được bấm nút xem `src/lifecycle.ts` (kích hoạt từ REGISTERED/PROVISIONED/MAINTENANCE, khóa từ ACTIVE/OFFLINE/FAULT/MAINTENANCE, decommission từ LOCKED).
3. `PUT /api/devices/{id}/config`: body chỉ gồm `telemetryIntervalSec`, `servoOpenDeg`, `servoCloseDeg` (backend tự sinh `configId`/`issuedBy`). Cần thêm: (a) cách đọc cấu hình đang áp dụng, ví dụ thêm `config` vào `/status`, để form hiện đúng giá trị; (b) cách báo kết quả ACK cấu hình, frontend giả định sự kiện realtime `{"type":"config","deviceId":"...","configId":"CFG-0001","status":"SUCCESS"}`.
4. `POST /api/users`: body `{ username, password, role }` → `201`. `PUT /api/users/me/password`: body `{ currentPassword, newPassword }` → `204`. Độ dài mật khẩu tối thiểu đang để 8 ký tự.
5. `thresholdRaw` của rule `AIR_BAD` chưa có dải hợp lệ trong Contract, frontend tạm dùng 0–4095 (ADC 12-bit).
6. Cần M3 xác nhận `PUT /api/rules/{id}` gộp (merge) hay thay thế `params`; frontend luôn gửi đủ `params`.

7. `GET /api/audit-logs`: phân trang như các danh sách khác, mỗi dòng có `logId, userId, action, target, result, timestamp` (mock thêm `username`). "Giới hạn" của Operator ở Contract mục 10 chưa nói rõ, mock hiểu là chỉ thấy thao tác của chính mình.
8. Giới hạn tần suất: backend trả `429` + mã `RATE_LIMITED` và nên kèm header `Retry-After` (giây). Mock chặn sau 5 lần sai mật khẩu trong 60 giây.

### Chạy test

`npm test` chạy vitest bằng Node, không cần trình duyệt. Test lớp API đi qua mock (`VITE_USE_MOCK=true` đặt sẵn trong `vitest.config.ts`). Khi đổi hành vi mock hoặc Contract, sửa test cho khớp.

### Content-Security-Policy

`nginx.conf` đặt CSP chặt (`default-src 'self'`, chỉ cho phép `style-src 'unsafe-inline'` vì antd chèn CSS lúc chạy). Chưa thử trên trình duyệt thật: nếu console báo "Refused to ..." thì nới đúng chỗ bị chặn.

### Biểu đồ telemetry dài hạn

`GET /telemetry` trả tối đa 100 bản ghi/trang, trong khi thiết bị gửi 5 giây/lần (24 giờ ≈ 17.280 bản ghi). Vì vậy biểu đồ trang Lịch sử chỉ vẽ 100 bản ghi mới nhất của khoảng đã chọn (khoảng 8 phút); toàn bộ khoảng xem ở bảng phân trang. Để vẽ biểu đồ 24 giờ hoặc 7 ngày cần M3 bổ sung tham số `bucket` cho telemetry giống `/energy`, ví dụ `GET /api/devices/{id}/telemetry?from=&to=&bucket=minute|hour` trả giá trị trung bình theo bucket. Chốt xong thì sửa `getTelemetry` và `HistoryPage.tsx`.

### Realtime

Contract chưa quy định realtime. Frontend đang giả định **SSE** tại `GET /api/stream` (`text/event-stream`, xác thực bằng header `Authorization: Bearer ...`), mỗi `data:` là một JSON:

```json
{"type":"telemetry","deviceId":"office-env-01","data":{"receivedAt":"2026-10-24T15:30:00Z","temperature":28.5,"humidity":72,"lux":320.5,"presence":true,"quality":"VALID"}}
{"type":"status","deviceId":"office-ctrl-01","online":true,"mode":"AUTO","actuators":{"light1":"ON","fan1":"OFF","buzzer1":"OFF","door1":"CLOSED"}}
{"type":"command","command":{"commandId":"CMD-0001","target":"light1","action":"ON","status":"SUCCESS","issuedBy":"user-2","issuedAt":"2026-10-24T15:30:00Z","latencyMs":180}}
{"type":"alert","alert":{"alertId":12,"type":"TEMP_HIGH","severity":"MEDIUM","status":"OPEN","deviceId":"office-env-01","roomId":"room-01","value":31.2,"threshold":30,"createdAt":"2026-10-24T15:30:00Z","acknowledgedBy":null,"acknowledgedAt":null}}
```

Nếu M3 chọn WebSocket hoặc đổi định dạng thì chỉ cần sửa `src/realtime.ts` (và `useRealtimeSync.ts` nếu đổi sự kiện). Trong lúc chưa có realtime, trạng thái thiết bị vẫn tự làm mới mỗi 10 giây.
Cũng cần thống nhất CORS nếu frontend và backend chạy khác cổng (dùng proxy `/api` của Vite hoặc Nginx thì không bị).

## Kết nối backend thật (M3)

1. Đặt `VITE_USE_MOCK=false` (build Docker mặc định đã là `false`).
2. Chạy dev: `VITE_API_PROXY=http://localhost:8080 npm run dev` (Vite chuyển `/api` sang backend, gồm cả SSE `/api/stream`).
   Chạy Docker: Nginx tự chuyển `/api/` sang service `backend:8080`, xem `deployment/docker-compose.yml` (profile `ui`).
3. Realtime: backend gửi SSE dạng `{ type, data, timestamp }`; `src/realtime.ts` (`normalizeEvent`) đổi sang `RealtimeEvent`.
   Token hết hạn khi đang mở stream (401) thì tự đăng xuất, không thử lại vô hạn.
4. Đổi mật khẩu gửi trường `oldPassword` (khớp `ChangePasswordRequest` của backend).
5. Nhật ký thao tác (`/api/audit-logs`) backend chỉ cho ADMIN, nên menu "Nhật ký" chỉ hiện với ADMIN.
