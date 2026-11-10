# Tests

Test tự động của từng phần nằm cạnh source; test tích hợp/simulator nằm ở đây.

```text
tests/
├── mqtt/                         # mock publisher + test ACL
│   ├── mock_publisher.py         # Node A+B giả, scenario normal/hot/sensor-fault/absent/silent
│   ├── mqtt_common.py
│   ├── send_command.py
│   ├── test_acl.py
│   └── requirements.txt
└── simulator/
    └── node_b_simulator.py       # Node B giả đơn giản, env-configurable
```

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

## Simulator Node B

```powershell
python -m pip install "paho-mqtt>=2.0,<3"

$env:MQTT_HOST = "192.168.10.205"
$env:MQTT_PORT = "1883"
$env:MQTT_USERNAME = "office-ctrl-01"
$env:MQTT_PASSWORD = "mat-khau-trong-deployment-env"
$env:PYTHONIOENCODING = "utf-8"
python tests/simulator/node_b_simulator.py
```

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
