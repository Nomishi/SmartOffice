# Tests

Test tự động của từng phần nằm cạnh source; test tích hợp, kiểm thử hệ thống trên thiết bị thật nằm ở đây.
Kế hoạch và kịch bản kiểm thử theo đề bài mục 7: [`KICH_BAN_KIEM_THU.md`](KICH_BAN_KIEM_THU.md).

```text
tests/
├── KICH_BAN_KIEM_THU.md          # kịch bản kiểm thử chức năng + phi chức năng (mã CN-xx, PCN-xx)
├── system/                       # kiểm thử hệ thống trên ESP32 thật + docker compose đang chạy
│   ├── test_functional.py        # CN-01..CN-17 (đăng nhập, phân quyền, telemetry, lệnh, cảnh báo, offline, khóa…)
│   ├── test_nonfunctional.py     # PCN-01..PCN-06 (độ trễ, mất bản tin, phục hồi, tải, tài nguyên)
│   ├── common.py, requirements.txt
│   └── results/                  # kết quả mỗi lần chạy (.md để đọc, .json số đo chi tiết)
└── mqtt/                         # mock publisher + test ACL
    ├── mock_publisher.py         # Node A+B giả, scenario normal/hot/sensor-fault/absent/silent
    ├── mqtt_common.py
    ├── send_command.py
    ├── test_acl.py
    └── requirements.txt
```

## Kiểm thử hệ thống (thiết bị thật)

Yêu cầu: `deployment/` đang chạy (`docker compose --profile ui up -d`), Node A và Node B đã kết nối broker.
Mật khẩu được đọc từ `deployment/.env`, không in ra kết quả.

```powershell
cd tests/system
python -m pip install -r requirements.txt
python test_functional.py --serial-port COM7     # COM7 = cổng USB của Node B, dùng cho ca offline/phục hồi
python test_functional.py --absence              # thêm ca tự động hóa phòng trống (rời khỏi radar ~2 phút)
python test_nonfunctional.py --minutes 5         # độ trễ, mất bản tin, phục hồi broker, tải, tài nguyên
python test_nonfunctional.py --only loss --minutes 1440   # chạy ổn định 24 giờ
```

Script tự trả lại các thay đổi tạm thời (ngưỡng rule, khóa thiết bị, cấu hình, trạng thái đèn/quạt).
Ca CN-17 để lại một thiết bị thử `test-device-xxxxxx` ở trạng thái DECOMMISSIONED.

## Backend

```powershell
cd backend
mvn verify
```

29 test: API smoke, auth/RBAC, SSE, rule, energy, device quality.

## Frontend

```powershell
cd frontend
npm ci
npm test
npm run build
```

46 test + TypeScript build.

## Mock Node A+B

```powershell
cd tests/mqtt
python -m pip install -r requirements.txt
$env:MQTT_USERS = "..."   # lấy từ deployment/.env
python mock_publisher.py --scenario normal
```

Hoặc qua Docker:

```powershell
cd deployment
docker compose --profile mock up -d mock-publisher
```

Test ACL:

```powershell
cd tests/mqtt
python test_acl.py
```

Chi tiết kịch bản: [`../deployment/README.md`](../deployment/README.md).
