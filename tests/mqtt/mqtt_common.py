"""Hàm dùng chung cho mock_publisher.py và test_acl.py."""
import json
import os
from pathlib import Path

import paho.mqtt.client as mqtt


def load_env_file(path):
    """Đọc file .env đơn giản (KEY=VALUE, bỏ dòng trống và dòng bắt đầu bằng #)."""
    out = {}
    p = Path(path)
    if not p.is_file():
        return out
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def load_users(env_file=None):
    """Trả về {username: password} từ biến môi trường MQTT_USERS hoặc từ file .env."""
    raw = os.environ.get("MQTT_USERS")
    if not raw:
        default = Path(__file__).resolve().parent.parent / ".env"
        raw = load_env_file(env_file or default).get("MQTT_USERS", "")
    users = {}
    for pair in filter(None, (x.strip() for x in raw.split(","))):
        if ":" not in pair:
            raise SystemExit(f"Mục MQTT_USERS sai định dạng (cần user:password): {pair.split(':')[0]}")
        u, p = pair.split(":", 1)
        users[u] = p
    if not users:
        raise SystemExit("Không tìm thấy MQTT_USERS (đặt biến môi trường hoặc tạo file .env từ .env.example)")
    return users


def topic(device_id, kind):
    """office/{deviceId}/{telemetry|status|command|ack|config} (Contract mục 4)."""
    return f"office/{device_id}/{kind}"


def dumps(obj):
    return json.dumps(obj, separators=(",", ":"), ensure_ascii=False)


def new_client(client_id):
    return mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id)


def is_failure(reason_code):
    """Dùng được cho cả ReasonCode (paho 2.x) lẫn số nguyên."""
    flag = getattr(reason_code, "is_failure", None)
    if flag is not None:
        return bool(flag)
    return int(reason_code) >= 128
