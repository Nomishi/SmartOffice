#!/usr/bin/env python3
"""Kiểm tra bảo mật Mosquitto (credential riêng + ACL) trên broker ĐANG CHẠY.

  docker compose up -d
  python test_acl.py                      # đọc MQTT_USERS từ ../.env
  python test_acl.py --host 192.168.1.10  # broker ở máy khác

Phục vụ hai test bảo mật bắt buộc của Contract mục 11:
  - thiết bị không đăng nhập/ghi vào topic của thiết bị khác;
  - thiết bị bị thu hồi (xóa khỏi MQTT_USERS) không kết nối được nữa.
Chạy được cả khi thiết bị hoặc mock_publisher.py đang hoạt động (test chỉ đếm bản tin mang mã riêng của nó).
Thoát với mã 0 nếu mọi test đều PASS, 1 nếu có test FAIL.
"""
import argparse
import sys
import threading
import time
import uuid

from mqtt_common import dumps, is_failure, load_users, new_client, topic

ENV, CTRL = "office-env-01", "office-ctrl-01"
results = []
# Mọi bản tin do test này gửi đều mang mã NONCE; khi đếm 'đã nhận' chỉ tính bản tin có mã này, nhờ vậy kết quả không bị
# ảnh hưởng bởi thiết bị thật hoặc mock_publisher.py đang chạy cùng lúc (kể cả bản tin retained của chúng).
NONCE = uuid.uuid4().hex[:8]


def check(name, ok, detail=""):
    results.append(ok)
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f"  ({detail})" if detail and not ok else ""), flush=True)


class Conn:
    """Một kết nối MQTT có ghi lại bản tin nhận được và kết quả SUBACK."""

    def __init__(self, host, port, username, password, label):
        self.msgs = []
        self.suback = {}
        self.rc = None
        self._ev = threading.Event()
        self.c = new_client(f"acltest-{label}-{int(time.time() * 1000) % 100000}")
        if username is not None:
            self.c.username_pw_set(username, password)
        self.c.on_connect = self._on_connect
        self.c.on_message = lambda cl, ud, m: self.msgs.append((m.topic, m.payload.decode("utf-8", "replace")))
        self.c.on_subscribe = self._on_subscribe
        try:
            self.c.connect(host, port, keepalive=30)
            self.c.loop_start()
        except OSError as e:
            raise SystemExit(f"Không kết nối được tới broker {host}:{port}: {e}")
        self._ev.wait(5)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        self.rc = reason_code
        self._ev.set()

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties=None):
        self.suback[mid] = [is_failure(r) for r in reason_codes]
        self._mid_ev.set()

    @property
    def connected(self):
        return self.rc is not None and not is_failure(self.rc)

    def subscribe(self, flt):
        """Trả về True nếu broker CHẤP NHẬN đăng ký, False nếu từ chối (ACL)."""
        self._mid_ev = threading.Event()
        _, mid = self.c.subscribe(flt, qos=1)
        self._mid_ev.wait(3)
        return not any(self.suback.get(mid, [True]))

    def publish(self, t, obj, retain=False):
        self.c.publish(t, dumps({**obj, "n": NONCE}), qos=1, retain=retain)

    def got(self, t):
        """Bản tin do chính test này gửi (có NONCE) và đã được broker giao tới kết nối này."""
        return [p for (tp, p) in self.msgs if tp == t and NONCE in p]

    def close(self):
        try:
            self.c.disconnect()
            self.c.loop_stop()
        except Exception:
            pass


def main():
    ap = argparse.ArgumentParser(description="Kiểm tra credential và ACL của Mosquitto")
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--port", type=int, default=1883)
    ap.add_argument("--env-file", default=None)
    ap.add_argument("--revoked", default="office-env-99", help="tài khoản KHÔNG có trong MQTT_USERS (giả lập thiết bị bị thu hồi)")
    ap.add_argument("--wait", type=float, default=1.5, help="thời gian chờ để chắc chắn bản tin bị chặn (giây)")
    a = ap.parse_args()
    users = load_users(a.env_file)
    for need in ("backend", ENV, CTRL):
        if need not in users:
            raise SystemExit(f"MQTT_USERS cần có tài khoản {need}")

    # ---- Đăng nhập ----
    anon = Conn(a.host, a.port, None, None, "anon")
    check("Kết nối ẩn danh (không username) bị từ chối", not anon.connected, f"rc={anon.rc}")
    bad = Conn(a.host, a.port, ENV, "sai-mat-khau", "bad")
    check("Sai mật khẩu bị từ chối", not bad.connected, f"rc={bad.rc}")
    gone = Conn(a.host, a.port, a.revoked, "bat-ky", "gone")
    check(f"Tài khoản đã thu hồi/không tồn tại ({a.revoked}) bị từ chối", not gone.connected, f"rc={gone.rc}")
    for x in (anon, bad, gone):
        x.close()

    be = Conn(a.host, a.port, "backend", users["backend"], "be")
    env = Conn(a.host, a.port, ENV, users[ENV], "env")
    ctrl = Conn(a.host, a.port, CTRL, users[CTRL], "ctrl")
    check("backend đăng nhập được", be.connected, f"rc={be.rc}")
    check(f"{ENV} đăng nhập được", env.connected, f"rc={env.rc}")
    check(f"{CTRL} đăng nhập được", ctrl.connected, f"rc={ctrl.rc}")
    if not (be.connected and env.connected and ctrl.connected):
        print("Dừng sớm: không đăng nhập được bằng tài khoản hợp lệ (kiểm tra MQTT_USERS và broker).")
        sys.exit(1)

    # ---- Quyền ĐỌC (subscribe) ----
    check("backend đăng ký được office/+/telemetry", be.subscribe("office/+/telemetry"))
    be.subscribe("office/+/status")
    be.subscribe("office/+/ack")
    time.sleep(0.6)
    live = sorted({t for (t, _) in be.msgs})
    if live:
        print("[INFO] Đang có thiết bị hoặc mock_publisher.py gửi dữ liệu (kể cả bản tin retained) trên: " + ", ".join(live) + ".")
        print("       Test chỉ đếm bản tin mang mã riêng của nó nên kết quả vẫn đúng; dừng mock_publisher.py nếu muốn log sạch.", flush=True)
    check(f"{CTRL} đăng ký được topic command của chính nó", ctrl.subscribe(topic(CTRL, "command")))
    ctrl.subscribe(topic(CTRL, "config"))
    check(f"{ENV} đăng ký được topic config của chính nó", env.subscribe(topic(ENV, "config")))
    # Thiết bị cố đăng ký topic ngoài quyền. Với acl_file, Mosquitto có thể vẫn chấp nhận lệnh SUBSCRIBE rồi chỉ lọc
    # bản tin khi phát; điều cần đảm bảo là KHÔNG rò rỉ bản tin, nên kiểm tra ở cuối (không dựa vào SUBACK).
    for flt in (topic(CTRL, "command"), topic(CTRL, "telemetry"), "office/+/command", "office/#"):
        accepted = env.subscribe(flt)
        print(f"[INFO] {ENV} đăng ký {flt}: broker {'chấp nhận (sẽ lọc khi phát bản tin)' if accepted else 'từ chối'}", flush=True)

    # ---- Quyền GHI (publish): bản tin bị ACL chặn sẽ bị broker lặng lẽ bỏ ----
    env.publish(topic(ENV, "telemetry"), {"deviceId": ENV, "quality": "VALID"})
    time.sleep(a.wait)
    check(f"{ENV} ghi được telemetry của chính nó (backend nhận)", len(be.got(topic(ENV, "telemetry"))) == 1)

    env.publish(topic(CTRL, "telemetry"), {"deviceId": CTRL, "quality": "VALID"})
    env.publish(topic(CTRL, "status"), {"online": True}, retain=False)
    env.publish(topic(CTRL, "ack"), {"commandId": "CMD-9999", "status": "SUCCESS"})
    time.sleep(a.wait)
    check(f"{ENV} KHÔNG ghi được telemetry giả mạo {CTRL}", not be.got(topic(CTRL, "telemetry")))
    check(f"{ENV} KHÔNG ghi được status giả mạo {CTRL}", not be.got(topic(CTRL, "status")))
    check(f"{ENV} KHÔNG ghi được ack giả mạo {CTRL}", not be.got(topic(CTRL, "ack")))

    env.publish(topic(CTRL, "command"), {"commandId": "CMD-9998", "target": "light1", "action": "ON", "issuedBy": "automation"})
    time.sleep(a.wait)
    check(f"{ENV} KHÔNG gửi được lệnh tới {CTRL} (thiết bị không được ghi command)", not ctrl.got(topic(CTRL, "command")))

    # ---- backend gửi lệnh/cấu hình xuống thiết bị ----
    be.publish(topic(CTRL, "command"), {"commandId": "CMD-0001", "target": "light1", "action": "OFF", "issuedBy": "automation"})
    be.publish(topic(CTRL, "config"), {"configId": "CFG-0001", "telemetryIntervalSec": 5})
    time.sleep(a.wait)
    check(f"backend gửi được command tới {CTRL}", len(ctrl.got(topic(CTRL, "command"))) == 1)
    check(f"{CTRL} nhận được config từ backend", len(ctrl.got(topic(CTRL, "config"))) == 1)

    # Rò rỉ khi đọc: env đã đăng ký office/# nên phải chỉ nhận được command/config của chính nó
    be.publish(topic(ENV, "config"), {"configId": "CFG-0002", "telemetryIntervalSec": 5})
    ctrl.publish(topic(CTRL, "telemetry"), {"deviceId": CTRL, "quality": "VALID"})
    ctrl.publish(topic(CTRL, "status"), {"online": True})
    ctrl.publish(topic(CTRL, "ack"), {"commandId": "CMD-0001", "status": "SUCCESS"})
    time.sleep(a.wait)
    check(f"{ENV} nhận được config của chính nó (đăng ký office/# vẫn đúng quyền)", len(env.got(topic(ENV, "config"))) == 1)
    own = {topic(ENV, "command"), topic(ENV, "config")}
    leaked = sorted({t for (t, _) in env.msgs if t not in own})
    check(f"{ENV} đăng ký office/# nhưng KHÔNG nhận bản tin của thiết bị khác", not leaked, f"nhận được: {leaked}")

    be.publish(topic(ENV, "telemetry"), {"deviceId": ENV, "quality": "VALID"})
    time.sleep(a.wait)
    check("backend KHÔNG ghi được telemetry (chỉ thiết bị mới được)", len(be.got(topic(ENV, "telemetry"))) == 1)

    for x in (be, env, ctrl):
        x.close()
    passed, total = sum(results), len(results)
    print(f"\n{passed}/{total} test đạt")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
