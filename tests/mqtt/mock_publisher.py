#!/usr/bin/env python3
"""Thiết bị giả: Node A (office-env-01) và Node B (office-ctrl-01) theo Contract v1.2.

Dùng cho M3 (test backend khi chưa có ESP32), M4 (test dashboard) và test tích hợp.
Mỗi thiết bị đăng nhập bằng tài khoản riêng (mật khẩu lấy từ MQTT_USERS trong .env).

  pip install -r requirements.txt
  python mock_publisher.py                          # cả hai node, kịch bản normal
  python mock_publisher.py --scenario hot           # nhiệt độ > 30 để sinh TEMP_HIGH
  python mock_publisher.py --scenario sensor-fault  # quality INVALID liên tiếp để sinh SENSOR_FAULT
  python mock_publisher.py --scenario absent        # phòng trống, đèn/quạt đang bật (ABSENCE_OFF, ENERGY_WASTE)
  python mock_publisher.py --scenario silent        # ngừng gửi sau 30 giây để thử DEVICE_OFFLINE
  python mock_publisher.py --devices env --spoof-device-id   # payload ghi deviceId của thiết bị khác (thử bảo mật backend)
"""
import argparse
import json
import os
import random
import threading
import time

from mqtt_common import dumps, is_failure, load_users, new_client, topic

FW = "1.0.0-mock"
HEARTBEAT_SEC = 30  # Contract mục 6
SCENARIOS = ["normal", "hot", "sensor-fault", "absent", "silent"]


def log(device, msg):
    print(f"[{time.strftime('%H:%M:%S')}] {device}: {msg}", flush=True)


class Node:
    """Phần chung: kết nối, LWT, heartbeat, vòng lặp telemetry."""

    def __init__(self, device_id, password, args):
        self.device_id = device_id
        self.args = args
        self.interval = float(args.interval)
        self.running = True
        self.started = time.time()
        self.tick_n = 0
        self.lock = threading.Lock()
        self.client = new_client(f"{device_id}-mock")
        self.client.username_pw_set(device_id, password)
        # LWT: broker tự gửi khi thiết bị mất kết nối đột ngột (Contract 5.2)
        self.client.will_set(topic(device_id, "status"), dumps({"online": False}), qos=1, retain=True)
        self.client.reconnect_delay_set(min_delay=1, max_delay=30)  # reconnect có backoff
        self.client.on_connect = self._on_connect
        self.client.on_message = self._on_message

    # ----- để lớp con ghi đè -----
    def status_payload(self):
        raise NotImplementedError

    def telemetry_payload(self):
        raise NotImplementedError

    def subscriptions(self):
        return [topic(self.device_id, "config")]

    def handle_command(self, payload):
        pass

    # ----- MQTT -----
    def publish(self, kind, obj, retain=False):
        self.client.publish(topic(self.device_id, kind), dumps(obj), qos=1, retain=retain)

    def publish_status(self):
        self.publish("status", self.status_payload(), retain=True)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if is_failure(reason_code):
            log(self.device_id, f"KẾT NỐI BỊ TỪ CHỐI ({reason_code}). Kiểm tra username/mật khẩu trong MQTT_USERS.")
            return
        log(self.device_id, "đã kết nối MQTT")
        for t in self.subscriptions():
            client.subscribe(t, qos=1)
        self.publish_status()

    def _on_message(self, client, userdata, msg):
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            log(self.device_id, f"bỏ qua bản tin không phải JSON trên {msg.topic}")
            return
        kind = msg.topic.rsplit("/", 1)[-1]
        if kind == "command":
            self.handle_command(data)
        elif kind == "config":
            self.handle_config(data)

    # ----- cấu hình (topic config) -----
    def handle_config(self, cfg):
        cid = cfg.get("configId")
        if not cid:
            log(self.device_id, "config thiếu configId, bỏ qua")
            return
        ok = True
        if "telemetryIntervalSec" in cfg:
            v = cfg["telemetryIntervalSec"]
            if isinstance(v, (int, float)) and 1 <= v <= 3600:
                self.interval = float(v)
            else:
                ok = False
        self.apply_extra_config(cfg)
        log(self.device_id, f"nhận cấu hình {cid}: {'OK' if ok else 'FAILED'} (interval={self.interval}s)")
        # ACK cấu hình dùng configId thay cho commandId (Contract 5.4)
        self.publish("ack", {"configId": cid, "status": "SUCCESS" if ok else "FAILED"})

    def apply_extra_config(self, cfg):
        pass

    # ----- chất lượng dữ liệu (Contract 5.5) -----
    def quality(self):
        sc = self.args.scenario
        if sc == "sensor-fault":
            # 3 bản VALID, 4 bản INVALID liên tiếp (>= 3 -> SENSOR_FAULT), 4 bản VALID (>= 3 -> tự đóng)
            return "INVALID" if 3 <= self.tick_n % 11 <= 6 else "VALID"
        return "SUSPECT" if random.random() < 0.05 else "VALID"

    # ----- vòng lặp -----
    def run(self):
        self.client.connect(self.args.host, self.args.port, keepalive=60)
        self.client.loop_start()
        next_tel = time.time() + 1
        next_hb = time.time() + HEARTBEAT_SEC
        while self.running:
            now = time.time()
            silent = self.args.scenario == "silent" and now - self.started > self.args.silent_after
            if not silent and self.client.is_connected():
                if now >= next_tel:
                    with self.lock:
                        payload = self.telemetry_payload()
                        self.tick_n += 1
                    self.publish("telemetry", payload)
                    next_tel = now + self.interval
                if now >= next_hb:
                    self.publish_status()
                    next_hb = now + HEARTBEAT_SEC
            time.sleep(0.2)

    def stop(self):
        self.running = False
        try:
            # Ngắt sạch thì broker KHÔNG gửi LWT, nên tự báo offline
            self.publish("status", {**self.status_payload(), "online": False}, retain=True)
            time.sleep(0.3)
            self.client.disconnect()
            self.client.loop_stop()
        except Exception:
            pass


class NodeA(Node):
    """office-env-01: nhiệt độ, độ ẩm, lux, hiện diện, MQ-135 (Contract 5.1)."""

    def __init__(self, password, args):
        super().__init__("office-env-01", password, args)
        self.temp, self.hum, self.lux, self.air = 28.5, 72.0, 320.0, 1450
        self.presence = args.scenario != "absent"

    def status_payload(self):
        return {"online": True, "fwVersion": FW}

    def telemetry_payload(self):
        q = self.quality()
        rssi = random.randint(-65, -50)
        # --spoof-device-id: topic đúng nhưng payload ghi deviceId của thiết bị khác.
        # ACL Mosquitto KHÔNG chặn được; backend phải bỏ bản tin này (Contract 5.1: deviceId payload = deviceId topic).
        did = "office-ctrl-01" if self.args.spoof_device_id else self.device_id
        if q == "INVALID":
            # Không đọc được cảm biến: chỉ gửi quality (Contract 5.5)
            return {"deviceId": did, "quality": q, "rssi": rssi}
        if self.args.scenario == "hot":
            self.temp = min(34.0, max(self.temp, 30.5) + random.uniform(-0.1, 0.3))
        else:
            self.temp = min(32.0, max(26.0, self.temp + random.uniform(-0.3, 0.3)))
        self.hum = min(80.0, max(60.0, self.hum + random.uniform(-1, 1)))
        self.lux = min(500.0, max(150.0, self.lux + random.uniform(-10, 10)))
        self.air = int(min(1800, max(1200, self.air + random.randint(-30, 30))))
        if self.args.scenario != "absent" and random.random() < 0.05:
            self.presence = not self.presence
        return {
            "deviceId": did,
            "temperature": round(self.temp, 1),
            "humidity": round(self.hum, 1),
            "lux": round(self.lux, 1),
            "presence": self.presence,
            "quality": q,
            "airRaw": self.air,
            "rssi": rssi,
        }


class NodeB(Node):
    """office-ctrl-01: đèn, quạt, còi, cửa + đo công suất INA219 (Contract 5.1b, 5.3)."""

    def __init__(self, password, args):
        super().__init__("office-ctrl-01", password, args)
        # Khởi động an toàn: tải OFF, cửa đóng (Contract mục 6). Riêng kịch bản absent bật sẵn để có thứ để tắt.
        on = "ON" if args.scenario == "absent" else "OFF"
        self.state = {"light1": on, "fan1": on, "buzzer1": "OFF", "door1": "CLOSED"}
        self.mode = "AUTO"
        self.done = {}  # commandId -> ACK đã gửi (chống thực thi lại)

    def subscriptions(self):
        return [topic(self.device_id, "command"), topic(self.device_id, "config")]

    def status_payload(self):
        return {"online": True, **self.state, "mode": self.mode, "fwVersion": FW}

    def telemetry_payload(self):
        l_on = self.state["light1"] == "ON"
        f_on = self.state["fan1"] == "ON"
        return {
            "deviceId": self.device_id,
            "busVoltageV": round(12.1 + random.uniform(-0.1, 0.1), 1),
            "light1PowerW": round(4.8 + random.uniform(-0.1, 0.1), 1) if l_on else 0.0,
            "light1CurrentMa": 397 if l_on else 0,
            "fan1PowerW": round(2.1 + random.uniform(-0.1, 0.1), 1) if f_on else 0.0,
            "fan1CurrentMa": 173 if f_on else 0,
            "quality": "VALID",
            "rssi": random.randint(-70, -55),
        }

    def handle_command(self, cmd):
        cid, target, action = cmd.get("commandId"), cmd.get("target"), cmd.get("action")
        valid = (target == "door1" and action in ("OPEN", "CLOSE")) or (
            target in ("light1", "fan1") and action in ("ON", "OFF")
        ) or (
            target == "buzzer1"
            and action in ("ON", "OFF", "BEEP", "BEEP2", "BEEP_LONG", "ALARM")
        )
        if not cid or not valid:
            log(self.device_id, f"lệnh không hợp lệ, bỏ qua: {cmd}")
            return
        if cid in self.done:
            # Trùng commandId: không thực thi lại nhưng gửi lại ACK cũ (Contract mục 6)
            log(self.device_id, f"{cid} trùng, gửi lại ACK cũ")
            self.publish("ack", self.done[cid])
            return
        started = time.time()
        # Relay/buzzer đổi trạng thái tức thì; cửa phải chờ servo chạy (Contract 5.3)
        delay = self.args.door_delay if target == "door1" else 0.15
        threading.Timer(delay, self._finish, args=(cid, target, action, started)).start()

    def _finish(self, cid, target, action, started):
        with self.lock:
            if target == "door1":
                wanted = "OPEN" if action == "OPEN" else "CLOSED"
                # --fail-door mô phỏng công tắc từ không khớp lệnh -> ACK FAILED
                new_state = self.state["door1"] if self.args.fail_door else wanted
                status = "SUCCESS" if new_state == wanted else "FAILED"
            elif target == "buzzer1":
                new_state = "OFF" if action == "OFF" else "ON"
                status = "SUCCESS"
            else:
                new_state, status = action, "SUCCESS"
            self.state[target] = new_state
        ack = {
            "commandId": cid,
            "target": target,
            "status": status,
            "state": new_state,
            "latencyMs": int((time.time() - started) * 1000),
        }
        self.done[cid] = ack
        log(self.device_id, f"{cid} {target} {action} -> {status} ({ack['latencyMs']} ms)")
        self.publish("ack", ack)
        self.publish_status()


def main():
    ap = argparse.ArgumentParser(description="Thiết bị giả Node A/Node B theo Contract v1.2")
    ap.add_argument("--host", default=os.environ.get("MQTT_HOST", "localhost"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("MQTT_PORT", "1883")))
    ap.add_argument("--interval", type=float, default=5, help="chu kỳ telemetry (giây), mặc định 5")
    ap.add_argument("--scenario", choices=SCENARIOS, default="normal")
    ap.add_argument("--devices", default="env,ctrl", help="env, ctrl hoặc env,ctrl")
    ap.add_argument("--door-delay", type=float, default=2.5, help="thời gian servo chạy (giây)")
    ap.add_argument("--fail-door", action="store_true", help="công tắc từ không khớp lệnh -> ACK FAILED")
    ap.add_argument("--spoof-device-id", action="store_true", help="Node A ghi deviceId của Node B trong payload (thử backend có bỏ bản tin giả mạo không)")
    ap.add_argument("--silent-after", type=float, default=30, help="kịch bản silent: ngừng gửi sau bao nhiêu giây")
    ap.add_argument("--env-file", default=None, help="đường dẫn .env (mặc định ../.env)")
    args = ap.parse_args()

    users = load_users(args.env_file)
    wanted = {d.strip() for d in args.devices.split(",")}
    nodes = []
    for key, cls, dev in (("env", NodeA, "office-env-01"), ("ctrl", NodeB, "office-ctrl-01")):
        if key in wanted:
            if dev not in users:
                raise SystemExit(f"Không có tài khoản {dev} trong MQTT_USERS")
            nodes.append(cls(users[dev], args))
    if not nodes:
        raise SystemExit("--devices phải chứa env và/hoặc ctrl")

    print(f"Kịch bản: {args.scenario} | broker {args.host}:{args.port} | Ctrl+C để dừng", flush=True)
    threads = [threading.Thread(target=n.run, daemon=True) for n in nodes]
    for t in threads:
        t.start()
    try:
        while any(t.is_alive() for t in threads):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nĐang dừng...", flush=True)
    finally:
        for n in nodes:
            n.stop()


if __name__ == "__main__":
    main()
