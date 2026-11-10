# Database

Schema, migration và ERD của hệ thống.

```text
database/
├── migrations/
│   ├── V1__init.sql
│   └── V2__add_device_streaks_and_version.sql
└── ERD_phong_lam_viec_thong_minh.png
```

## Nguồn chân lý

Migration nằm **duy nhất** ở `database/migrations/`. Backend copy các file này vào jar khi build
bằng `maven-resources-plugin` (xem `backend/pom.xml`), nên Flyway vẫn đọc `classpath:db/migration`.

- `V1` tạo schema: users, devices, telemetry, power_reading, commands, alerts, rules,
  device_configs, audit_logs.
- `V2` bổ sung cột streak/version (idempotent cho DB đã chạy V1 cũ).
- `ddl-auto: validate` — Hibernate không tự sửa schema.
- `baseline-on-migrate: true` cho DB dev đã có dữ liệu.

## Chạy migration

Chỉ cần chạy backend; Flyway tự migrate khi start. Nếu muốn chạy tay bằng psql:

```powershell
psql -h localhost -p 5432 -U iot -d iot -f migrations/V1__init.sql
psql -h localhost -p 5432 -U iot -d iot -f migrations/V2__add_device_streaks_and_version.sql
```

Không sửa migration đã chạy (Flyway checksum).

## Dữ liệu mẫu

Backend seed khi start:

- 2 device: `office-env-01`, `office-ctrl-01`
- 5 rule mặc định
- user dev nếu `SEED_DEV_USERS=true`.

## ERD

`ERD_phong_lam_viec_thong_minh.png`.

Quan hệ logic qua `deviceId`; telemetry/power index `(device_id, received_at)`.
