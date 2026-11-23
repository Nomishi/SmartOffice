"""Hàm dùng chung cho kiểm thử hệ thống (thiết bị thật + backend + broker đang chạy).

Đọc mật khẩu từ deployment/.env (không in mật khẩu ra màn hình hay file kết quả).
"""
import json
import os
import queue
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import paho.mqtt.client as mqtt
import requests

ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = Path(os.environ.get("SMARTOFFICE_ENV", ROOT / "deployment" / ".env"))
RESULTS_DIR = Path(__file__).resolve().parent / "results"

API = os.environ.get("API_BASE", "http://localhost:3000/api")
MQTT_HOST = os.environ.get("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))

ENV_ID = "office-env-01"
CTRL_ID = "office-ctrl-01"


# ---------------------------------------------------------------- cấu hình
def load_env():
    out = {}
    if not ENV_FILE.is_file():
        raise SystemExit(f"Không thấy {ENV_FILE}. Tạo từ .env.example rồi chạy docker compose trước.")
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


ENV = load_env()


def mqtt_users():
    users = {}
    for pair in filter(None, (x.strip() for x in ENV.get("MQTT_USERS", "").split(","))):
        u, p = pair.split(":", 1)
        users[u] = p
    return users


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(s):
    if not s:
        return None
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ---------------------------------------------------------------- REST API
def items(body):
    """Trang kết quả của backend có dạng {items, page, size, total, totalPages}."""
    if isinstance(body, dict):
        return body.get("items", body.get("content", []))
    return body


class Api:
    def __init__(self, username):
        self.username = username
        pw_key = {"admin": "ADMIN_PASSWORD", "operator1": "OPERATOR_PASSWORD", "viewer1": "VIEWER_PASSWORD"}[username]
        r = requests.post(f"{API}/auth/login", json={"username": username, "password": ENV[pw_key]}, timeout=10)
        r.raise_for_status()
        self.token = r.json()["token"]
        self.h = {"Authorization": f"Bearer {self.token}"}

    def get(self, path, **params):
        return requests.get(f"{API}{path}", headers=self.h, params=params, timeout=15)

    def post(self, path, body=None, headers=None, **params):
        h = dict(self.h, **(headers or {}))
        return requests.post(f"{API}{path}", headers=h, json=body, params=params, timeout=20)

    def put(self, path, body):
        return requests.put(f"{API}{path}", headers=self.h, json=body, timeout=15)

    def status(self, device_id):
        r = self.get(f"/devices/{device_id}/status")
        r.raise_for_status()
        return r.json()

    def command(self, device_id, target, action, wait=True):
        """Gửi lệnh qua REST như giao diện web. Trả (response, thời gian khứ hồi ms)."""
        t0 = time.perf_counter()
        r = self.post(f"/devices/{device_id}/commands", {"target": target, "action": action},
                      headers={"Idempotency-Key": str(uuid.uuid4())}, wait=str(wait).lower())
        return r, (time.perf_counter() - t0) * 1000

    def alerts(self, **params):
        r = self.get("/alerts", size=50, **params)
        r.raise_for_status()
        return items(r.json())

    def rules(self):
        r = self.get("/rules")
        r.raise_for_status()
        return items(r.json())


# ---------------------------------------------------------------- MQTT
class Watcher:
    """Kết nối MQTT bằng tài khoản backend (chỉ đọc telemetry/status/ack, được ghi command/config)."""

    def __init__(self, topics=("office/+/telemetry", "office/+/status", "office/+/ack"), label="test"):
        self.q = queue.Queue()
        self.log = []
        self.lock = threading.Lock()
        self.connected = threading.Event()
        self.c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"systest-{label}-{uuid.uuid4().hex[:6]}")
        self.c.username_pw_set("backend", mqtt_users()["backend"])
        self.topics = topics
        self.c.on_connect = self._on_connect
        self.c.on_message = self._on_message
        self.c.reconnect_delay_set(1, 2)
        self.c.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
        self.c.loop_start()
        if not self.connected.wait(10):
            raise SystemExit("Không kết nối được MQTT broker bằng tài khoản backend")

    def _on_connect(self, client, userdata, flags, rc, props=None):
        if not rc.is_failure:
            for t in self.topics:
                client.subscribe(t, qos=1)
            self.connected.set()

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode() or "{}")
        except Exception:
            payload = {"_raw": msg.payload[:80]}
        item = (time.time(), msg.topic, payload, bool(msg.retain))
        with self.lock:
            self.log.append(item)
        self.q.put(item)

    def publish(self, topic, obj, retain=False):
        info = self.c.publish(topic, json.dumps(obj, separators=(",", ":")), qos=1, retain=retain)
        info.wait_for_publish(5)

    def wait_for(self, predicate, timeout):
        """Chờ bản tin thỏa predicate(topic, payload, retained). Trả (thời điểm, topic, payload) hoặc None."""
        end = time.time() + timeout
        while time.time() < end:
            try:
                t, topic, payload, retained = self.q.get(timeout=max(0.05, end - time.time()))
            except queue.Empty:
                break
            if predicate(topic, payload, retained):
                return t, topic, payload
        return None

    def drain(self):
        while not self.q.empty():
            self.q.get_nowait()

    def close(self):
        self.c.loop_stop()
        self.c.disconnect()


def device_client(username, password, client_id=None):
    """Kết nối MQTT bằng một tài khoản thiết bị. Trả (client, reason_code_string)."""
    result = {}
    ev = threading.Event()
    c = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=client_id or f"systest-{uuid.uuid4().hex[:8]}")
    c.username_pw_set(username, password)

    def on_connect(client, userdata, flags, rc, props=None):
        result["rc"] = rc
        ev.set()

    c.on_connect = on_connect
    c.connect(MQTT_HOST, MQTT_PORT, keepalive=30)
    c.loop_start()
    ev.wait(8)
    return c, result.get("rc")


# ---------------------------------------------------------------- SSE
class SseListener:
    """Nghe /api/stream như dashboard. Ghi (thời điểm nhận, type, data)."""

    def __init__(self, token):
        self.events = []
        self.stop = threading.Event()
        self.ready = threading.Event()
        self.t = threading.Thread(target=self._run, args=(token,), daemon=True)
        self.t.start()
        self.ready.wait(10)

    def _run(self, token):
        try:
            with requests.get(f"{API}/stream", headers={"Authorization": f"Bearer {token}", "Accept": "text/event-stream"},
                              stream=True, timeout=(5, 120)) as r:
                self.ready.set()
                data = []
                for raw in r.iter_lines(decode_unicode=True):
                    if self.stop.is_set():
                        return
                    if raw is None:
                        continue
                    if raw.startswith("data:"):
                        data.append(raw[5:].strip())
                    elif raw == "" and data:
                        try:
                            msg = json.loads("".join(data))
                            self.events.append((time.time(), msg.get("type"), msg.get("data")))
                        except Exception:
                            pass
                        data = []
        except Exception as e:  # noqa: BLE001
            self.events.append((time.time(), "_error", str(e)))
            self.ready.set()

    def close(self):
        self.stop.set()


# ---------------------------------------------------------------- ghi kết quả
class Report:
    def __init__(self, name, tag=None):
        self.name = name + (f"_{tag}" if tag else "")
        self.rows = []
        self.started = now_utc()

    def add(self, case_id, title, verdict, expected, actual, note=""):
        verdict = verdict if isinstance(verdict, str) else ("PASS" if verdict else "FAIL")
        self.rows.append({"id": case_id, "title": title, "verdict": verdict,
                          "expected": expected, "actual": actual, "note": note})
        mark = {"PASS": "PASS", "FAIL": "FAIL", "SKIP": "SKIP", "MANUAL": "MANUAL"}.get(verdict, verdict)
        print(f"[{mark:6}] {case_id} {title}: {actual}" + (f"  ({note})" if note else ""), flush=True)

    def save(self, extra=None):
        RESULTS_DIR.mkdir(exist_ok=True)
        stamp = self.started.astimezone().strftime("%Y-%m-%d_%H%M%S")
        base = RESULTS_DIR / f"{self.name}_{stamp}"
        data = {"suite": self.name, "startedAt": iso(self.started), "finishedAt": iso(now_utc()),
                "api": API, "broker": f"{MQTT_HOST}:{MQTT_PORT}", "results": self.rows}
        if extra:
            data["measurements"] = extra
        base.with_suffix(".json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        lines = [f"# Kết quả {self.name}", "",
                 f"Chạy lúc {self.started.astimezone().strftime('%H:%M %d/%m/%Y')} (giờ máy), API `{API}`, broker `{MQTT_HOST}:{MQTT_PORT}`.", "",
                 "| ID | Hạng mục | Kết quả mong đợi | Kết quả thực | Đánh giá |",
                 "| --- | --- | --- | --- | --- |"]
        for r in self.rows:
            actual = r["actual"] + (f" — {r['note']}" if r["note"] else "")
            lines.append(f"| {r['id']} | {r['title']} | {r['expected']} | {actual} | **{r['verdict']}** |")
        counts = {v: sum(1 for r in self.rows if r["verdict"] == v) for v in ("PASS", "FAIL", "SKIP", "MANUAL")}
        lines += ["", "Tổng: " + ", ".join(f"{k} {v}" for k, v in counts.items() if v)]
        base.with_suffix(".md").write_text("\n".join(lines) + "\n", encoding="utf-8")
        print(f"\nĐã ghi {base.with_suffix('.md').relative_to(ROOT)} và .json")
        return counts
