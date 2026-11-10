# Deployment — Docker full stack

Chạy Mosquitto (auth + ACL), PostgreSQL, backend Spring Boot và frontend React.

## Chạy nhanh

```powershell
cd deployment
Copy-Item ../.env.example .env       # đổi mật khẩu; KHÔNG commit .env
docker compose --profile ui up -d --build
docker compose ps
```

| Dịch vụ | Port host | Ghi chú |
| --- | --- | --- |
| Frontend | `3000` | nginx, proxy `/api` + SSE |
| Backend | `8080` | REST + Swagger |
| Mosquitto | `1883` | auth bắt buộc, ACL |
| PostgreSQL | `5432` | dev; bỏ port khi deploy thật |

Mở `http://localhost:3000`.

## Cấu trúc

```text
deployment/
├── docker-compose.yml
├── mosquitto/
│   ├── mosquitto.conf
│   ├── acl.conf
│   └── entrypoint.sh       # tạo password file từ MQTT_USERS
└── README.md
```

Backend build context là repo root để dùng chung `database/migrations`:

```text
context: ..
dockerfile: backend/Dockerfile
```

## Credential & ACL

`MQTT_USERS` trong `.env`:

```env
MQTT_USERS=backend:mat-khau-backend,office-env-01:mat-khau-env01,office-ctrl-01:mat-khau-ctrl01
```

- Username = `deviceId` với thiết bị.
- Backend dùng username `backend`.
- `BACKEND_MQTT_PASSWORD` phải trùng mật khẩu `backend`.
- Mật khẩu không chứa dấu phẩy, dấu cách, `$`.
- Thêm device: nối `,office-env-02:mat-khau` rồi `docker compose up -d --force-recreate mosquitto`.
- Thu hồi: xóa user khỏi `MQTT_USERS` rồi recreate mosquitto.

ACL:

| Ai | Publish | Subscribe |
| --- | --- | --- |
| device X | `office/X/telemetry`, `status`, `ack` | `office/X/command`, `config` |
| backend | `office/+/command`, `config` | `office/+/telemetry`, `status`, `ack` |

## Mock publisher

Chạy Node A + B giả (script nằm ở `tests/mqtt`):

```powershell
docker compose --profile mock up -d mock-publisher
```

Hoặc local:

```powershell
cd ../tests/mqtt
python -m pip install -r requirements.txt
$env:MQTT_USERS = "..."      # lấy từ deployment/.env
python mock_publisher.py --scenario normal
```

Scenario: `normal`, `hot`, `sensor-fault`, `absent`, `silent`.

## Windows

- `localhost:1883` có thể trúng Mosquitto service riêng. Thiết bị/client trên PC dùng IP LAN
  (ví dụ `192.168.10.205:1883`) hoặc tắt service Mosquitto.
- `mosquitto/entrypoint.sh` phải LF; repo có `.gitattributes` giữ LF.
- Nếu port bị chiếm, sửa `ports` trong `docker-compose.yml`.

## Dừng / reset

```powershell
docker compose --profile ui down
docker compose --profile ui down -v    # xoá DB + MQTT volume
```
