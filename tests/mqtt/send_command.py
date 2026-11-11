#!/usr/bin/env python3
"""Gửi một lệnh điều khiển tới Node B (đóng vai backend) rồi chờ ACK. Dùng để thử mà chưa cần backend thật.

  python send_command.py light1 ON
  python send_command.py fan1 OFF
  python send_command.py door1 OPEN            # cửa chạy servo nên ACK chậm hơn

Cần broker đang chạy và `mock_publisher.py` (hoặc ESP32 thật) đang chạy để có thiết bị trả lời ACK.
Mã thoát: 0 = ACK SUCCESS, 1 = lỗi kết nối hoặc tham số, 2 = ACK FAILED, 3 = hết giờ không có ACK.
Viết bằng Python để tránh rắc rối nháy kép khi gõ JSON trong PowerShell hoặc cmd.
"""
import argparse
import os
import sys
import threading
import uuid

from mqtt_common import dumps, is_failure, load_users, new_client, topic

PAIRS = {"light1": ("ON", "OFF"), "fan1": ("ON", "OFF"),
         "buzzer1": ("ON", "OFF", "BEEP", "BEEP2", "BEEP_LONG", "ALARM"),
         "door1": ("OPEN", "CLOSE")}


def main():
    ap = argparse.ArgumentParser(description="Gửi lệnh điều khiển (vai trò backend) và chờ ACK")
    ap.add_argument("target", choices=list(PAIRS))
    ap.add_argument("action", choices=sorted({a for v in PAIRS.values() for a in v}))
    ap.add_argument("--device", default="office-ctrl-01")
    ap.add_argument("--command-id", default=None, help="mặc định: tự sinh")
    ap.add_argument("--host", default=os.environ.get("MQTT_HOST", "localhost"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("MQTT_PORT", "1883")))
    ap.add_argument("--timeout", type=float, default=10, help="số giây chờ ACK (door1 tối đa 10 giây theo Contract)")
    ap.add_argument("--env-file", default=None)
    a = ap.parse_args()

    if a.action not in PAIRS[a.target]:
        print(f"Hành động {a.action} không hợp lệ cho {a.target} (cần {' hoặc '.join(PAIRS[a.target])})")
        return 1
    users = load_users(a.env_file)
    if "backend" not in users:
        print("MQTT_USERS cần có tài khoản backend")
        return 1

    cid = a.command_id or f"CMD-T{uuid.uuid4().hex[:6].upper()}"
    done = threading.Event()
    state = {"ack": None, "error": None}
    c = new_client(f"send-command-{uuid.uuid4().hex[:6]}")
    c.username_pw_set("backend", users["backend"])

    def on_connect(client, userdata, flags, reason_code, properties=None):
        if is_failure(reason_code):
            state["error"] = f"Kết nối bị từ chối ({reason_code}). Kiểm tra mật khẩu backend trong MQTT_USERS."
            done.set()
            return
        client.subscribe(topic("+", "ack"), qos=1)  # theo dõi ACK của mọi thiết bị
        payload = {"commandId": cid, "target": a.target, "action": a.action, "issuedBy": "send_command"}
        client.publish(topic(a.device, "command"), dumps(payload), qos=1)
        print(f"Đã gửi {cid}: {a.target} {a.action} tới {a.device}, đang chờ ACK...", flush=True)

    def on_message(client, userdata, msg):
        try:
            p = __import__("json").loads(msg.payload.decode("utf-8"))
        except ValueError:
            return
        if p.get("commandId") == cid:
            state["ack"] = p
            done.set()

    c.on_connect = on_connect
    c.on_message = on_message
    try:
        c.connect(a.host, a.port, keepalive=30)
    except OSError as e:
        print(f"Không kết nối được tới broker {a.host}:{a.port}: {e}")
        return 1
    c.loop_start()
    done.wait(a.timeout)
    c.disconnect()
    c.loop_stop()

    if state["error"]:
        print(state["error"])
        return 1
    ack = state["ack"]
    if ack is None:
        print(f"Không nhận được ACK sau {a.timeout:g} giây. Thiết bị {a.device} có đang chạy (mock_publisher.py) không?")
        return 3
    print("ACK:", dumps(ack))
    return 0 if ack.get("status") == "SUCCESS" else 2


if __name__ == "__main__":
    sys.exit(main())
