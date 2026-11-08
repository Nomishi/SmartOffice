# SmartOffice – Phòng làm việc thông minh (IoT)

Hệ thống giám sát và điều khiển phòng làm việc: thiết bị ESP32 gửi số liệu qua MQTT, backend Spring Boot lưu vào PostgreSQL và đẩy realtime (SSE) lên giao diện web React.

```
ESP32 (Node A cảm biến, Node B điều khiển)
        │  MQTT
        ▼
   Mosquitto ◄──────► Backend (Spring Boot) ◄──► PostgreSQL
                            │  REST + SSE
                            ▼
                    Frontend (React + Ant Design, Nginx)
```

## Cấu trúc thư mục

| Thư mục | Nội dung |
| --- | --- |
| `backend/` | Backend Spring Boot (REST API, MQTT, automation, SSE) |
| `iot-frontend/` | Giao diện web (React, TypeScript, Vite, Ant Design) |
| `iot-infra/` | **Docker Compose chạy cả hệ thống**, cấu hình Mosquitto, thiết bị giả |
| `docs/` | Tài liệu hợp đồng API và hướng dẫn tích hợp |

Cách chạy chính thức là dùng `docker-compose.yml` trong **`iot-infra/`**.

## Yêu cầu

- **Docker Desktop** (đang chạy) và **Git**.
- Không cần cài Node hay Java, mọi thứ build trong Docker.
- Các cổng sau phải đang trống: `3000`, `8080`, `1883`, `5432`.

## Chạy nhanh (4 bước)

**1. Clone code**

```bash
git clone https://github.com/Nomishi/SmartOffice.git
cd SmartOffice
```

Nếu code nằm ở nhánh khác `main`, chạy thêm `git checkout <tên-nhánh>`.

**2. Tạo file `.env`** (file này chứa mật khẩu nên không nằm trên Git)

```bash
cd iot-infra
cp .env.example .env
```

Trên Windows (PowerShell hoặc CMD) dùng `copy .env.example .env`.

Khi chạy thử trên máy cá nhân, giữ nguyên giá trị mẫu là chạy được. Chỉ cần nhớ:

- `BACKEND_MQTT_PASSWORD` phải **giống hệt** mật khẩu của mục `backend` trong `MQTT_USERS`.
- `JWT_SECRET` dài từ 32 ký tự trở lên.
- `SEED_DEV_USERS=true` để có sẵn 3 tài khoản đăng nhập thử.
- Mật khẩu MQTT không được chứa dấu phẩy, dấu cách hoặc ký tự `$`.

**3. Chạy**

```bash
docker compose --profile ui --profile mock up -d --build
```

Lần đầu mất vài phút vì phải build backend và frontend. Kiểm tra:

```bash
docker compose ps
```

Chờ các service chuyển sang `healthy` (backend cần khoảng 30 giây đến 1 phút).

**4. Mở giao diện**

http://localhost:3000

| Tài khoản | Mật khẩu | Quyền |
| --- | --- | --- |
| `admin` | `adminPassword123!` | Toàn quyền, xem nhật ký, quản lý người dùng |
| `operator1` | `operatorPassword123!` | Điều khiển thiết bị, xác nhận cảnh báo |
| `viewer1` | `viewerPassword123!` | Chỉ xem |

Các địa chỉ khác: Swagger của backend tại http://localhost:8080/swagger-ui/index.html.

## Các profile của Docker Compose

| Lệnh | Chạy những gì |
| --- | --- |
| `docker compose up -d` | Mosquitto, PostgreSQL, backend |
| `--profile ui` | Thêm giao diện web (cổng 3000) |
| `--profile mock` | Thêm **thiết bị giả** (Node A và Node B) để có dữ liệu khi chưa có phần cứng |

Không bật `SPRING_PROFILES_ACTIVE=mock` của backend, vì tài khoản `backend` bị ACL cấm ghi telemetry. Dữ liệu giả đã có sẵn ở `--profile mock`.

## Lệnh thường dùng

Chạy trong thư mục `iot-infra/`.

| Việc cần làm | Lệnh |
| --- | --- |
| Xem trạng thái | `docker compose ps` |
| Xem log backend | `docker compose logs -f backend` |
| Tắt hệ thống, **giữ** dữ liệu | `docker compose --profile ui --profile mock down` |
| Tắt và **xóa sạch** dữ liệu | `docker compose --profile ui --profile mock down -v` |
| Chỉ build lại frontend | `docker compose --profile ui build frontend` rồi `docker compose --profile ui up -d --no-deps frontend` |
| Chỉ build lại backend | `docker compose build backend` rồi `docker compose up -d --no-deps backend` |
| Tắt riêng thiết bị giả | `docker compose stop mock-publisher` |

Sau khi build lại frontend, bấm **Ctrl+F5** trên trình duyệt để xóa cache cũ.

## Phát triển giao diện (tùy chọn)

Cần Node 20 trở lên. Chạy hạ tầng và backend bằng Docker như trên, rồi:

```bash
cd iot-frontend
npm install
```

Tạo file `iot-frontend/.env` với nội dung:

```
VITE_USE_MOCK=false
VITE_API_PROXY=http://localhost:8080
```

```bash
npm run dev      # http://localhost:5173, tự tải lại khi sửa code
npm run build    # kiểm tra kiểu TypeScript và build
npm test         # chạy test
```

Muốn xem giao diện bằng dữ liệu giả mà không cần backend: đặt `VITE_USE_MOCK=true` (tài khoản `admin` / `admin123`).

## Nối thiết bị ESP32 thật

1. Tắt thiết bị giả: `docker compose stop mock-publisher`.
2. Thêm tài khoản cho từng node vào `MQTT_USERS` trong `.env`, giữ nguyên mục `backend`. Ví dụ: `backend:...,office-env-01:matkhau1,office-ctrl-01:matkhau2`.
3. Tạo lại Mosquitto: `docker compose up -d --force-recreate mosquitto`.
4. Trong firmware: trỏ MQTT tới **IP máy chạy Docker**, cổng `1883`, username là `deviceId` (`office-env-01` hoặc `office-ctrl-01`), kèm mật khẩu ở bước 2.

Máy tính và ESP32 phải cùng mạng, và tường lửa phải cho phép cổng 1883. Topic và định dạng bản tin xem trong `docs/` và `iot-infra/README.md`.

## Xử lý sự cố

| Triệu chứng | Nguyên nhân và cách xử lý |
| --- | --- |
| `Thiếu BACKEND_MQTT_PASSWORD...` hoặc `Thiếu JWT_SECRET...` | Chưa có hai biến này trong `iot-infra/.env`. Copy lại từ `.env.example`. |
| Backend cứ `Restarting`, log có `password authentication failed for user "iot"` | Volume Postgres còn giữ mật khẩu cũ do bạn đã đổi `.env` sau lần chạy đầu. Chạy `down -v` rồi `up` lại (mất dữ liệu DB). |
| Backend log có `Not authorized` từ MQTT | `BACKEND_MQTT_PASSWORD` khác mật khẩu của mục `backend` trong `MQTT_USERS`. Sửa cho trùng rồi `docker compose up -d --force-recreate mosquitto backend`. |
| Đăng nhập báo "Sai tên đăng nhập hoặc mật khẩu" | Gõ sai mật khẩu (có dấu `!` ở cuối, phân biệt hoa thường), hoặc thiếu `SEED_DEV_USERS=true` khi DB còn trống. |
| Giao diện hiện Offline, không có số liệu | Chưa bật thiết bị giả. Chạy `docker compose --profile mock up -d mock-publisher`. |
| `mosquitto` báo `Restarting` | Kiểm tra `MQTT_USERS`: mật khẩu có dấu cách, dấu phẩy hay `$`. File `mosquitto/entrypoint.sh` phải kết thúc dòng kiểu **LF** (repo đã có `.gitattributes` để tự giữ LF). |
| Báo cổng đã bị chiếm | Máy đang chạy Postgres hay Mosquitto riêng. Tắt chúng, hoặc đổi cổng bên trái trong phần `ports` của `docker-compose.yml`. |
| Giao diện vẫn là bản cũ | Bấm Ctrl+F5. |
| `grep` không nhận ra trên PowerShell | Dùng `Select-String`, ví dụ `docker compose logs backend 2>&1 \| Select-String "ERROR"`. |

## Trước khi triển khai thật

Các giá trị dưới đây chỉ dành cho máy phát triển:

- Đặt `SEED_DEV_USERS=false` và đổi mật khẩu 3 tài khoản mặc định.
- Đặt `JWT_SECRET` thành chuỗi ngẫu nhiên riêng, ví dụ `openssl rand -base64 48`.
- Đổi toàn bộ mật khẩu trong `.env` (Postgres, MQTT).
- Bỏ các dòng mở cổng `5432` (Postgres) và `8080` (backend) trong `docker-compose.yml`.
- Tắt tự đăng ký thiết bị lạ ở backend (`auto-register-unknown-devices`).
- **Không commit file `.env`** (đã nằm trong `.gitignore`).