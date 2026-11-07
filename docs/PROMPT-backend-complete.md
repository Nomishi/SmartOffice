# PROMPT — Hoàn thiện backend SmartOffice (giao cho coding agent)

Bạn là **senior backend engineer** (Java/Spring Boot, MQTT, PostgreSQL, bảo mật API). Nhiệm vụ:
hoàn thiện backend của dự án **SmartOffice – Phòng làm việc thông minh IoT** để **frontend (M4) có thể
tích hợp ngay ngày mai**, và bàn giao trên **nhánh riêng**. Tuyệt đối không commit/push/merge vào `main`.

---

## 0. LUẬT GIT — BẮT BUỘC

Repo: `https://github.com/Nomishi/SmartOffice`

### Tình trạng code hiện tại (đã push lên remote)

- `main` = `810540b` — chỉ có scaffold ban đầu.
- `origin/feature/backend-complete` = `4fa9f2b` — **đã chứa toàn bộ code + docs mới nhất**,
  gồm các commit `810540b` → `7572923` → `4fa9f2b`.
- Không cần merge `main`; không cần pull code từ `main`. Mọi thứ cần thiết đã nằm trên
  `feature/backend-complete`.

**Nếu clone repo mới:**

```bash
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
git checkout feature/backend-complete
git pull origin feature/backend-complete
```

**Nếu máy đã có repo local:**

```bash
git fetch origin
git checkout feature/backend-complete
git pull origin feature/backend-complete
```

**Nếu đang đứng ở nhánh khác và có thay đổi chưa commit:** commit/stash trước, rồi mới checkout.
Không chạy `git reset --hard` lên `main`.

Nhánh `feature/backend-complete` **đã tồn tại** và chứa baseline contract v1.3 + docs đã soát.
Làm tiếp trực tiếp trên nhánh này (hoặc tách nhánh con nếu cần, nhưng gộp kết quả về
`feature/backend-complete`, không phải `main`).

- **Không** push thẳng `main`, **không** force push, **không** merge PR.
- Commit nhỏ, message rõ ràng (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Kết thúc: push nhánh và gửi link compare/commit. Nếu cần review, mở **draft PR** vào `main`
  nhưng **tuyệt đối không merge**; ghi rõ tóm tắt, endpoint mới, cách chạy, bằng chứng test,
  rủi ro/việc còn lại.
- Không commit secret, `.env`, `target/`, file build, token, mật khẩu thật.
- Không xoá/rewrite code đang chạy tốt nếu không cần; ưu tiên thay đổi additive.

---

## 1. Đọc trước khi code (theo thứ tự)

1. `Contract_chung_-_Phòng_làm_việc_thông_minh_IoT.md` — **nguồn chân lý** về topic MQTT, payload,
   enum, REST API, mã lỗi, entity, rule. Version 1.3.
2. `README.md` — cách chạy, cấu trúc, endpoint hiện có.
3. `docs/m3-contract-notes.md` — các điểm M3 đã bổ sung/cần chốt.
4. `docs/m3-api.http` — ví dụ gọi API.
5. `docker-compose.yml`, `.env.example`, `backend/pom.xml`, toàn bộ `backend/src/main/java`.
6. `docs/test-checklist.md` — bằng chứng test hiện có; chạy lại và cập nhật sau khi sửa.
7. `ERD_phong_lam_viec_thong_minh.png`, `Kien_truc_IoT_tong_the.png` nếu cần hình dung.

Nếu có mâu thuẫn: **contract thắng**. Nếu buộc phải đổi contract, sửa file contract + ghi rõ
breaking change, và báo trong PR. Không tự ý đổi tên field/endpoint đã có.

---

## 2. Bối cảnh dự án

Hệ thống gồm 4 module:

- **M1**: ESP32 Node A — AHT20 (nhiệt/ẩm), BH1750 (lux), LD2410C (hiện diện), MQ-135 (airRaw),
  gửi telemetry/status, gắn `quality`.
- **M2**: ESP32 Node B — relay light1/fan1, buzzer1, servo + công tắc từ door1, INA219 ×2,
  nhận command/config, trả ACK, gửi telemetry công suất.
- **M3**: backend Spring Boot (repo này) — MQTT, DB, REST, rule engine, alert, automation, energy.
- **M4**: frontend — dashboard realtime, điều khiển, alert, rule, báo cáo.

Luồng: `ESP32 → MQTT broker → Spring Boot → PostgreSQL → REST/SSE → Frontend`, và ngược lại
`Frontend → REST → Backend → MQTT command → ESP32 → ACK → Backend → DB/SSE → Frontend`.

Node/device mặc định: `office-env-01` (ENV), `office-ctrl-01` (CONTROL), phòng `room-01`.

---

## 3. Trạng thái hiện tại (đã có, đã test)

Backend Spring Boot 3.5.16 / Java 17 / Maven đã có:

- MQTT Paho: subscribe `office/+/telemetry|status|ack`, publish `command|config`, QoS 1,
  reconnect, retained status/config, validate deviceId topic vs payload.
- Entity: `Device`, `Telemetry`, `PowerReading`, `Command`, `Alert`, `Rule`, `DeviceConfig`, `AuditLog`.
- Ingest telemetry/status/ACK; command lifecycle `PENDING → SUCCESS/FAILED/TIMEOUT`, timeout 5s
  (door1 10s), retry 2, Idempotency-Key; config retained + ACK.
- REST: devices/status/telemetry/energy/commands/mode/config/alerts/rules/audit-logs, phân trang,
  format lỗi `{"error":{"code","message","details","timestamp"}}`.
- Rule engine: TEMP_HIGH, AIR_BAD, ABSENCE_OFF, DOOR_OPEN_LIMIT, ENERGY_WASTE, DEVICE_OFFLINE,
  SENSOR_FAULT; automation không ghi đè `MANUAL`; chỉ dùng telemetry `VALID`.
- Mock profile `mock` giả lập cả M1+M2 và trả ACK thật.
- **15 test đang xanh**: context load, API smoke, rule validation, energy, device quality.
- Mô hình dữ liệu hiện tại: `Room` chỉ là `roomId` string, `Schedule`/`Role` chưa có entity riêng,
  `DeviceConfig` là entity bổ sung để lưu lịch sử config — xem `docs/m3-contract-notes.md` mục 4.
- Đã test live: command→ACK 180ms, idempotency 409, TEMP_HIGH + auto-resolve, LWT offline alert,
  SENSOR_FAULT, automation phòng trống → tự OFF.

**Còn thiếu / chưa đủ để frontend làm việc** (đây là phạm vi bạn phải hoàn thiện):

- Chưa có **auth JWT + RBAC + user management**; API đang dùng header tạm `X-User-Id`.
- Chưa có **realtime (SSE/WebSocket)** cho dashboard.
- Chưa có **OpenAPI/Swagger**, tài liệu tích hợp frontend.
- Chưa có **Flyway migration**; đang `ddl-auto: update`.
- Chưa có `Dockerfile` backend, compose chưa chạy full stack.
- Test automation/offline/command lifecycle chưa đầy đủ; chưa test MQTT bằng broker thật trong CI.
- Chưa có retention dữ liệu telemetry, rate limit, một số endpoint lifecycle còn sơ sài.
- Chưa có `Room`/`Schedule` entity; `Command.issuedBy` là string, không FK — xem
  `docs/m3-contract-notes.md` mục 4 trước khi quyết định mở rộng.

---

## 4. Việc phải làm

### P0 — Bắt buộc, làm trước (frontend cần ngay)

#### 4.1 Auth JWT + RBAC + User
- Auth/RBAC là phần **backend M3** (contract v1.3), không phải M2.

- Thêm entity `User`: `userId`, `username` unique, `passwordHash`, `role` (ADMIN/OPERATOR/VIEWER),
  `accountStatus` (ACTIVE/LOCKED), `createdAt`, `lastLoginAt`.
- BCrypt password. JWT HS256, secret lấy từ env `JWT_SECRET` (có default dev rõ ràng, không hardcode
  production), expiry 3600s, claims gồm userId/username/role.
- Endpoint đúng contract mục 8:
  - `POST /api/auth/login` → `{token, tokenType:"Bearer", expiresIn, user:{...}}`
  - `POST /api/auth/register` (Admin; hoặc public nếu chưa có user đầu tiên — seed admin thay thế)
  - `PUT /api/users/me/password`
  - `GET /api/users` (Admin, phân trang)
  - `POST /api/users` (Admin)
- `SecurityFilterChain`: permit `/api/auth/login`, `/actuator/health`, `/v3/api-docs/**`,
  `/swagger-ui/**`; còn lại authenticated. Bật method security.
- Phân quyền theo contract mục 10: VIEWER chỉ đọc; OPERATOR điều khiển/sửa rule/ack alert;
  ADMIN quản lý user/device lifecycle/decommission/audit.
- Thay `X-User-Id`: lấy user từ JWT, `issuedBy = "user-<id>"`; xoá fallback header (nếu cần giữ cho
  dev thì chỉ bật bằng profile `dev`, mặc định tắt).
- Lỗi 401 `UNAUTHORIZED`/`TOKEN_EXPIRED`, 403 `FORBIDDEN` đúng format contract.
- Seed user dev: `admin` / `operator1` / `viewer1` với mật khẩu lấy từ env, log rõ chỉ dùng dev.
  Không commit mật khẩu thật.

#### 4.2 Realtime cho M4

- Chọn **SSE** (đơn giản, hợp EventSource) tại `GET /api/stream` (hoặc `/api/realtime` — chốt và
  ghi docs). Hỗ trợ `Authorization: Bearer` hoặc `?token=` (EventSource không set header).
- Event JSON camelCase, có `type` + `data` + `timestamp`:
  `telemetry`, `status`, `alert`, `command`, `config`.
- Bắn event từ ingest, ACK, alert service, command service. Heartbeat/comment mỗi 15s để giữ kết nối.
- Giới hạn subscriber, đóng connection khi client rời; không block MQTT callback thread.

#### 4.3 OpenAPI + tài liệu frontend

- Thêm `springdoc-openapi-starter-webmvc-ui`; Swagger UI + `/v3/api-docs`, Bearer auth scheme.
- Viết `docs/frontend-integration.md`: base URL, luồng login/lưu token, bảng endpoint + quyền,
  request/response mẫu, mã lỗi, SSE event mẫu, CORS, cách chạy mock.
- Cập nhật `docs/m3-api.http` theo auth mới (login lấy token, dùng Bearer).

#### 4.4 Flyway

- Thêm Flyway, tạo `V1__init.sql` khớp entity hiện tại, gồm index quan trọng.
- Đổi Postgres sang `ddl-auto: validate`; test profile vẫn `create-drop` (hoặc Flyway H2 nếu ổn).
- Không làm mất dữ liệu DB dev; ghi hướng dẫn migrate trong README.

#### 4.5 Docker full stack

- `Dockerfile` multi-stage cho backend (build Maven → runtime JRE 17, non-root).
- Thêm service `backend` vào `docker-compose.yml`, phụ thuộc postgres/mosquitto healthy, env từ `.env`.
- `docker compose up --build` phải chạy được backend + Postgres + Mosquitto.
- Cập nhật `.env.example` (JWT_SECRET, user seed, DB, MQTT).
- Lưu ý Windows: service Mosquitto riêng có thể chiếm `127.0.0.1:1883`; ghi troubleshooting.

### P1 — Hoàn thiện nghiệp vụ & độ tin cậy

#### 4.6 Rule engine / automation

- Tách `Clock` để test thời gian; viết test cho:
  ABSENCE_OFF (AUTO gửi OFF, MANUAL không gửi), DOOR_OPEN_LIMIT, ENERGY_WASTE,
  DEVICE_OFFLINE (quá 90s), SENSOR_FAULT (3 INVALID → alert, 3 VALID → đóng), TEMP_HIGH auto-resolve.
- Đảm bảo không spam: dedupe alert theo (type, deviceId) đang mở; cooldown automation cấu hình được.
- Đảm bảo transaction: publish MQTT không nằm trong transaction dài; nếu cần dùng
  `@TransactionalEventListener(AFTER_COMMIT)` hoặc outbox. Ghi rõ trade-off.
- Thêm cấu hình retention: job xoá telemetry/power cũ hơn N ngày (env), mặc định tắt hoặc 30 ngày.

#### 4.7 API completeness

- `POST /api/devices` (Admin đăng ký device), lọc/tìm kiếm danh sách device, `GET /config` history.
- Kiểm tra toàn bộ validate: phân trang, from/to ≤ 7 ngày, bucket ≤ 1000, target/action, rule params.
- Bổ sung audit log cho mọi thao tác ghi (command, config, rule, alert ack, mode, lifecycle).
- Idempotency-Key chịu được request đồng thời (unique constraint + xử lý DataIntegrityViolation).
- `?wait=true` trả 200/504 đúng contract; door1 dùng timeout 10s.
- Nếu thêm mã lỗi mới (ví dụ `MQTT_UNAVAILABLE` 503) phải ghi vào contract + notes.

#### 4.8 MQTT robustness + test broker thật

- Test integration với Postgres + Mosquitto thật (Testcontainers nếu khả thi; nếu không, test
  service với mock và ghi rõ test tay).
- Test ingest: telemetry VALID/SUSPECT/INVALID, status online/offline, ACK command, ACK config,
  deviceId lệch topic, JSON lỗi, thiếu field bắt buộc.
- Đảm bảo retained status/config sau restart không gây sai trạng thái.
- Ghi `docs/mqtt-operations.md`: topic, QoS, retain, LWT, retry/timeout, cách test MQTTX/mosquitto_pub.

#### 4.9 Chất lượng code

- `mvn verify` xanh; không lỗi compiler warning nghiêm trọng.
- Dùng `@ControllerAdvice` thống nhất; không leak stacktrace.
- Log có context `deviceId/commandId`, không log secret/token.
- Bean validation cho DTO; service không trả entity thô nếu làm lộ field nội bộ.
- Giữ style package hiện tại (`api`, `mqtt`, `service`, `domain`, `repository`, `config`).
- Nếu chưa làm `Room`/`Schedule`: **không được im lặng bỏ qua** — ghi rõ deviation trong
  `docs/m3-contract-notes.md` và README. Không tự thêm API ngoài contract khi chưa chốt.

### P2 — Nếu còn thời gian

- Rate limit 429 `RATE_LIMITED` cho login/command.
- Metrics Prometheus, health chi tiết.
- Tối ưu energy bằng SQL aggregate (thay tích phân trong bộ nhớ).
- Mosquitto ACL/password file + tài liệu cấp credential cho từng device.
- WebSocket thay SSE nếu M4 yêu cầu (không làm cả hai nếu không cần).

---

## 5. Ràng buộc kỹ thuật

- Java 17, Spring Boot 3.5.x, Maven, PostgreSQL 16. Không đổi stack.
- JSON camelCase; timestamp ISO-8601 UTC (`2026-10-24T15:30:00Z`).
- REST error format và mã lỗi theo contract mục 8.3; thứ tự kiểm tra 401 → 403 → 404 → 409 → 202.
- Phân trang mọi endpoint danh sách: `items/page/size/total/totalPages`, `size` max 100.
- Không đổi payload MQTT/REST đã chốt. Chỉ thêm field optional hoặc endpoint mới; nếu breaking change
  phải sửa contract trước và ghi rõ.
- `quality`: chỉ VALID dùng cho rule/automation; SUSPECT lưu + hiển thị; INVALID lưu + đếm SENSOR_FAULT.
- Không coi "không có dữ liệu" là phòng trống. Không automation khi `MANUAL`.
- Secret qua env, có `.env.example`; không commit `.env`.
- CORS đọc từ `CORS_ALLOWED_ORIGINS`.
- Code phải chạy trên Windows (đường dẫn, Docker Desktop) và Linux (CI) — không hardcode path.

---

## 6. Test bắt buộc

Tối thiểu các nhóm sau, tất cả phải xanh bằng `mvn test` / `mvn verify`:

1. **Unit**: rule params validation, energy bucket/Wh, command target-action validation,
   alert dedupe, quality handling.
2. **Service**: command lifecycle (PENDING→SUCCESS/FAILED/TIMEOUT, retry, idempotency),
   ACK cập nhật actuator, config conflict/timeout.
3. **Rule/automation**: absence AUTO vs MANUAL, temp alert + resolve, door, energy waste,
   offline, sensor fault, dùng Clock cố định.
4. **API integration**: MockMvc với H2 (hoặc Testcontainers Postgres):
   - login đúng/sai, token hết hạn, viewer bị 403 khi gửi lệnh, operator được phép;
   - phân trang, validate from/to, 404, 409 device offline/locked;
   - response JSON đúng contract.
5. **MQTT integration** (nếu được): broker thật/Testcontainers, publish telemetry → DB,
   publish ACK → command SUCCESS, LWT → OFFLINE + alert.
6. **SSE**: kết nối nhận được ít nhất event telemetry/alert (có thể dùng WebTestClient).

Thêm test tay vào `docs/test-checklist.md` và **dán output thật** trong PR. Không được nói "đã test"
nếu chưa chạy.

---

## 7. Definition of Done

Chỉ coi là xong khi **tất cả** đúng:

- [ ] Code nằm trên `feature/backend-complete`, đã push, PR mở vào `main`, **main không bị sửa**.
- [ ] `mvn verify` xanh; liệt kê số test + output thật.
- [ ] `docker compose up --build` chạy được backend + Postgres + Mosquitto.
- [ ] `mvn spring-boot:run` (không mock) và `-Dspring-boot.run.profiles=mock` đều chạy.
- [ ] Login → token → gọi API bằng Bearer thành công; viewer bị chặn khi điều khiển.
- [ ] Frontend làm được các luồng: login, xem dashboard realtime, xem lịch sử, gửi lệnh thấy ACK,
      xem/ack alert, sửa rule, xem energy.
- [ ] Swagger UI + `docs/frontend-integration.md` đầy đủ, không cần hỏi backend.
- [ ] Flyway chạy sạch trên DB trống; `ddl-auto: validate` pass.
- [ ] Không còn header tạm `X-User-Id` (hoặc chỉ còn ở profile dev và được tài liệu hoá).
- [ ] README + contract/notes cập nhật; `.env.example` đủ biến.
- [ ] Không commit secret/target/.env.
- [ ] PR mô tả: thay đổi, endpoint mới, cách test, ảnh hưởng frontend, rủi ro, việc còn lại.

---

## 8. Cách báo cáo khi xong

Trả về đúng cấu trúc:

1. **Branch + PR**: link nhánh/PR.
2. **Đã làm**: theo P0/P1/P2, file chính.
3. **API mới/đổi**: bảng method + path + quyền + request/response mẫu.
4. **Bằng chứng test**: lệnh đã chạy + output tóm tắt (số test pass).
5. **Cách chạy**: docker compose + backend + mock.
6. **Frontend cần biết**: base URL, auth, SSE, lỗi thường gặp.
7. **Rủi ro / chưa làm**: trung thực, không tô hồng.

---

## 9. Gotchas đã gặp (đừng lặp lại)

- PostgreSQL không suy luận được type với JPQL `:param is null` → dùng Specification/Criteria cho
  filter động (đã áp dụng cho Alert).
- Cột `value` là reserved trên H2 → entity Alert dùng `alert_value`, `threshold_value`.
- H2 nhiều context test dùng chung DB in-memory gây lỗi schema → dùng `${random.uuid}` trong URL.
- Windows có thể có Mosquitto service chiếm 1883 trong khi Docker cũng map 1883 → kiểm tra
  `Get-NetTCPConnection -LocalPort 1883`; tắt một bên.
- Paho callback chạy thread riêng: không block, mọi lỗi phải catch + log.
- Không publish MQTT trong transaction dài; cân nhắc AFTER_COMMIT/outbox.
- `quality=INVALID` không được dùng cho automation và không được coi là phòng trống.
- `SUSPECT` phá chuỗi VALID/INVALID liên tiếp (đã sửa trong DeviceService).
- `GET telemetry` mặc định `size=20` theo contract 8.1; đừng đổi thành 100.
- `GET telemetry/energy/commands` phải 404 nếu device không tồn tại (đã sửa).
- `ENERGY_WASTE` chỉ dùng power reading `VALID` và còn mới trong 90s (đã sửa).
- LWT alert chỉ tự đóng khi device online lại, không đóng chỉ vì `lastSeenAt` còn mới (đã sửa).

Bắt đầu bằng việc đọc contract + code hiện tại, chạy `mvn test` để lấy baseline, rồi triển khai
theo thứ tự P0 → P1 → P2. Nếu bị chặn bởi thiếu thông tin (ví dụ secret, URL, quyết định SSE vs
WebSocket), hỏi lại ngắn gọn thay vì tự đoán.
