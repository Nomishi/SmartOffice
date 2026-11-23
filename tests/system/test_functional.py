#!/usr/bin/env python3
"""Kiểm thử chức năng trên hệ thống THẬT (đề bài mục 7.1, báo cáo Bảng 10.1).

Yêu cầu: docker compose trong deployment/ đang chạy, Node A + Node B đã kết nối broker.

  python test_functional.py                         # chạy các ca tự động
  python test_functional.py --serial-port COM7      # thêm ca offline/phục hồi (giữ Node B ở trạng thái reset qua cổng USB)
  python test_functional.py --absence               # thêm ca tự động hóa phòng trống (cần rời khỏi tầm radar ~2 phút)

Mọi thay đổi tạm thời (ngưỡng rule, khóa thiết bị, cấu hình, trạng thái đèn/quạt) đều được trả lại như cũ khi kết thúc.
Kết quả ghi vào tests/system/results/functional_<ngày>.md và .json.
"""
import argparse
import math
import sys
import time
import uuid

import requests

from common import API, items, CTRL_ID, ENV_ID, Api, Report, SseListener, Watcher, device_client, mqtt_users, now_utc, iso, parse_ts

ABSENCE_WINDOW = 150  # giây chờ đèn tự tắt (ngưỡng vắng đặt 1 phút + chu kỳ kiểm tra automation 10 s)
rep = Report("functional", tag=(sys.argv[sys.argv.index("--only") + 1].replace(",", "-") if "--only" in sys.argv else None))


def latest_power_received(api):
    tel = api.status(CTRL_ID).get("latestTelemetry") or {}
    return parse_ts(tel.get("receivedAt"))


# ------------------------------------------------------------------ CN-01, CN-16: xác thực
def tc_auth():
    users = mqtt_users  # noqa: F841 (giữ import cho rõ nguồn mật khẩu)
    r = requests.post(f"{API}/auth/login", json={"username": "operator1", "password": "sai-mat-khau-" + uuid.uuid4().hex[:4]}, timeout=10)
    ok_wrong = r.status_code == 401
    op = Api("operator1")
    rep.add("CN-01", "Đăng nhập", ok_wrong and bool(op.token),
            "Sai mật khẩu → 401; đúng → trả JWT",
            f"sai mật khẩu → HTTP {r.status_code}; đúng → JWT {len(op.token)} ký tự")

    no_token = requests.get(f"{API}/devices", timeout=10).status_code
    bad_token = requests.get(f"{API}/devices", headers={"Authorization": "Bearer abc.def.ghi"}, timeout=10).status_code
    tampered = op.token[:-4] + ("AAAA" if not op.token.endswith("AAAA") else "BBBB")
    tampered_code = requests.get(f"{API}/devices", headers={"Authorization": f"Bearer {tampered}"}, timeout=10).status_code
    rep.add("CN-16", "API từ chối token thiếu / sai (bảo mật)", no_token == 401 and bad_token == 401 and tampered_code == 401,
            "Không token, token rác, token bị sửa chữ ký → 401",
            f"không token {no_token}, token rác {bad_token}, sửa chữ ký {tampered_code}")
    return op


# ------------------------------------------------------------------ CN-02: phân quyền
def tc_viewer(op):
    viewer = Api("viewer1")
    before = op.status(CTRL_ID)["actuators"]["light1"]
    r = viewer.post(f"/devices/{CTRL_ID}/commands", {"target": "light1", "action": "ON" if before == "OFF" else "OFF"})
    r2 = viewer.put("/rules/1", {"enabled": True})
    after = op.status(CTRL_ID)["actuators"]["light1"]
    rep.add("CN-02", "Phân quyền Viewer (bảo mật)", r.status_code == 403 and r2.status_code == 403 and before == after,
            "Viewer gửi lệnh / sửa rule → 403, thiết bị không đổi",
            f"gửi lệnh → {r.status_code}, sửa rule → {r2.status_code}, light1 {before} → {after}")


# ------------------------------------------------------------------ CN-03, CN-04: telemetry
def tc_telemetry(op, watcher):
    for case, dev, title in (("CN-03", ENV_ID, "Telemetry Node A"), ("CN-04", CTRL_ID, "Telemetry Node B")):
        watcher.drain()
        hit = watcher.wait_for(lambda t, p, r, d=dev: t == f"office/{d}/telemetry", 15)
        if not hit:
            rep.add(case, title, False, "Thiết bị gửi telemetry 5 s/lần, backend lưu", "không nhận được telemetry trong 15 s")
            continue
        t_mqtt, _, payload = hit
        time.sleep(1.5)
        tel = op.status(dev).get("latestTelemetry") or {}
        received = parse_ts(tel.get("receivedAt"))
        stored = received is not None and abs(received.timestamp() - t_mqtt) < 3
        if dev == ENV_ID:
            fields = [k for k in ("temperature", "humidity", "lux", "presence", "airRaw") if k in payload]
            detail = ", ".join(f"{k}={payload[k]}" for k in fields)
        else:
            fields = [k for k in ("busVoltageV", "light1PowerW", "fan1PowerW") if k in payload]
            detail = ", ".join(f"{k}={payload[k]}" for k in fields)
        rep.add(case, title, stored and "quality" in payload and "seq" in payload,
                "Lưu DB, có quality, dashboard đọc được qua API",
                f"seq {payload.get('seq')}, quality {payload.get('quality')}, {detail}; API receivedAt {tel.get('receivedAt')}")
    # Lịch sử theo khoảng thời gian (FR-07) và báo cáo năng lượng (FR-14)
    frm, to = iso(now_utc().replace(microsecond=0) - __import__('datetime').timedelta(minutes=10)), iso(now_utc())
    hist = op.get(f"/devices/{ENV_ID}/telemetry", **{"from": frm, "to": to, "size": 50})
    energy = op.get(f"/devices/{CTRL_ID}/energy", **{"from": frm, "to": to, "bucket": "minute"})
    n = len(items(hist.json())) if hist.ok else 0
    rep.add("CN-03b", "Tra cứu lịch sử + báo cáo năng lượng", hist.ok and n > 0 and energy.ok,
            "API lịch sử 10 phút trả dữ liệu; API năng lượng trả 200",
            f"lịch sử {hist.status_code} ({n} bản ghi/trang), năng lượng {energy.status_code}")


# ------------------------------------------------------------------ CN-05, CN-06: điều khiển
def tc_control(op):
    initial = op.status(CTRL_ID)["actuators"]
    lines, all_ok = [], True
    for target in ("light1", "fan1", "buzzer1"):
        for action in ("ON", "OFF"):
            r, rtt = op.command(CTRL_ID, target, action)
            body = r.json() if r.content else {}
            state = op.status(CTRL_ID)["actuators"].get(target)
            ok = r.ok and body.get("status") == "SUCCESS" and state == action
            all_ok &= ok
            lines.append(f"{target} {action}: {body.get('status', r.status_code)}, thiết bị {body.get('latencyMs')} ms, khứ hồi {rtt:.0f} ms")
            if target != "buzzer1" and action == "ON":
                time.sleep(6)  # chờ 1 chu kỳ telemetry để thấy dòng điện tải
                tel = op.status(CTRL_ID).get("latestTelemetry") or {}
                key = "light1CurrentMa" if target == "light1" else "fan1CurrentMa"
                lines[-1] += f", {key}={tel.get(key)}"
    rep.add("CN-05", "Điều khiển đèn / quạt / còi", all_ok, "ACK SUCCESS, trạng thái actuator đổi đúng", "; ".join(lines))
    # trả lại trạng thái ban đầu
    for target in ("light1", "fan1"):
        if initial.get(target) == "ON":
            op.command(CTRL_ID, target, "ON")

    door = []
    r1, _ = op.command(CTRL_ID, "door1", "OPEN")
    b1 = r1.json() if r1.content else {}
    door.append(f"OPEN → {b1.get('status')} ({b1.get('latencyMs')} ms)")
    r2, _ = op.command(CTRL_ID, "door1", "CLOSE")
    b2 = r2.json() if r2.content else {}
    door.append(f"CLOSE → {b2.get('status')} ({b2.get('latencyMs')} ms){', ' + b2.get('message') if b2.get('message') else ''}")
    state = op.status(CTRL_ID)["actuators"].get("door1")
    ok = b1.get("status") == "SUCCESS" and b2.get("status") == "SUCCESS" and state == "CLOSED"
    rep.add("CN-06", "Điều khiển cửa (servo + công tắc từ)", ok,
            "OPEN/CLOSE đều SUCCESS, trạng thái cửa theo công tắc từ, < 5 s",
            "; ".join(door) + f"; trạng thái cuối {state}",
            "" if ok else "lệnh FAILED khi công tắc từ không xác nhận là đúng thiết kế; cần chỉnh nam châm")


# ------------------------------------------------------------------ CN-07: cảnh báo
def tc_temp_alert(op):
    admin = Api("admin")
    rule = next((r for r in admin.rules() if r.get("type") == "TEMP_HIGH"), None)
    tel = op.status(ENV_ID).get("latestTelemetry") or {}
    temp = tel.get("temperature")
    if not rule or temp is None:
        rep.add("CN-07", "Sinh và xử lý cảnh báo TEMP_HIGH", "SKIP", "Alert OPEN rồi tự đóng", "không có rule TEMP_HIGH hoặc chưa có nhiệt độ")
        return
    old_params = dict(rule.get("params") or {})
    rid = rule.get("ruleId") or rule.get("id")
    test_th = max(0, math.floor(temp) - 2)
    try:
        r = admin.put(f"/rules/{rid}", {"params": {"thresholdC": test_th, "consecutiveSamples": 1}})
        t0 = time.time()
        alert = None
        while time.time() - t0 < 40:
            alert = next((a for a in op.alerts(status="OPEN", type="TEMP_HIGH", deviceId=ENV_ID)), None)
            if alert:
                break
            time.sleep(2)
        raised = time.time() - t0 if alert else None
        ack = requests.patch(f"{API}/alerts/{alert['alertId']}/acknowledge", headers=op.h, timeout=10).status_code if alert else None
    finally:
        admin.put(f"/rules/{rid}", {"params": old_params})
    resolved = None
    if alert:
        t1 = time.time()
        while time.time() - t1 < 40:
            still = [a for a in op.alerts(type="TEMP_HIGH", deviceId=ENV_ID) if a.get("status") in ("OPEN", "ACKNOWLEDGED")]
            if not still:
                resolved = time.time() - t1
                break
            time.sleep(2)
    ok = alert is not None and ack == 200
    rep.add("CN-07", "Sinh và xử lý cảnh báo TEMP_HIGH", ok,
            "Hạ ngưỡng dưới nhiệt độ thật → alert OPEN; Operator xác nhận được; trả ngưỡng → alert đóng",
            (f"nhiệt độ {temp} °C, ngưỡng thử {test_th} °C → alert sau {raised:.0f} s, xác nhận HTTP {ack}, "
             + (f"tự đóng sau {resolved:.0f} s khi trả ngưỡng {old_params.get('thresholdC')} °C" if resolved else "chưa thấy tự đóng trong 40 s"))
            if alert else f"không có alert sau 40 s (nhiệt độ {temp}, ngưỡng {test_th})")


# ------------------------------------------------------------------ CN-08: tự động hóa phòng trống
def tc_absence(op, enabled):
    if not enabled:
        rep.add("CN-08", "Tự động tắt tải khi phòng trống", "MANUAL",
                "presence=false đủ X phút, mode AUTO → backend gửi OFF; MANUAL không bị ghi đè",
                "chưa chạy: cần rời khỏi tầm radar; chạy lại với --absence")
        return
    admin = Api("admin")
    rule = next(r for r in admin.rules() if r.get("type") == "ABSENCE_OFF")
    rid, old = rule.get("ruleId") or rule.get("id"), dict(rule.get("params") or {})
    try:
        old_mode = op.status(CTRL_ID).get("mode")
        # Automation chỉ dùng bản tin VALID: chờ Node A qua giai đoạn làm nóng MQ-135 rồi mới bắt đầu bấm giờ.
        t_wait = time.time()
        while time.time() - t_wait < 300:
            if (op.status(ENV_ID).get("latestTelemetry") or {}).get("quality") == "VALID":
                break
            print("    chờ Node A gửi bản tin VALID (MQ-135 đang làm nóng)...", flush=True)
            time.sleep(10)
        admin.put(f"/rules/{rid}", {"params": dict(old, absenceMinutes=1)})
        op.post(f"/devices/{CTRL_ID}/mode", {"mode": "AUTO"})
        op.command(CTRL_ID, "light1", "ON")
        print(f">>> Hãy rời khỏi tầm radar LD2410C (ra khỏi phòng) trong khoảng {ABSENCE_WINDOW // 60 + 1} phút...", flush=True)
        t0 = time.time()
        off_by_auto = None
        first_absent = None
        while time.time() - t0 < ABSENCE_WINDOW:
            tel = op.status(ENV_ID).get("latestTelemetry") or {}
            if tel.get("presence") is False and first_absent is None:
                first_absent = time.time() - t0
            st = op.status(CTRL_ID)
            if st["actuators"]["light1"] == "OFF":
                cmds = items(op.get(f"/devices/{CTRL_ID}/commands", size=5).json())
                off_by_auto = next((c for c in cmds if c.get("issuedBy") == "automation"), None)
                break
            time.sleep(5)
        absent_txt = f"radar báo vắng từ giây {first_absent:.0f}" if first_absent is not None else "radar chưa lần nào báo vắng"
        rep.add("CN-08", "Tự động tắt tải khi phòng trống", off_by_auto is not None,
                "presence=false ≥ 1 phút, AUTO → lệnh OFF issuedBy=automation",
                (f"{absent_txt}; đèn tắt ở giây {time.time() - t0:.0f} bởi {off_by_auto.get('issuedBy')} ({off_by_auto.get('commandId')})"
                 if off_by_auto else f"{absent_txt}; đèn không tự tắt trong {ABSENCE_WINDOW} s"),
                "automation chỉ dùng bản tin quality VALID (MQ-135 làm nóng 3 phút sau khi Node A khởi động thì bản tin là SUSPECT)")
    finally:
        admin.put(f"/rules/{rid}", {"params": old})
        if old_mode and old_mode != "AUTO":
            op.post(f"/devices/{CTRL_ID}/mode", {"mode": old_mode})


# ------------------------------------------------------------------ CN-09, CN-10: offline và phục hồi
def tc_offline(op, port):
    if not port:
        for cid, title in (("CN-09", "Phát hiện thiết bị offline"), ("CN-10", "Phục hồi sau mất kết nối")):
            rep.add(cid, title, "MANUAL", "OFFLINE + DEVICE_OFFLINE ≤ 90 s; ACTIVE lại, alert tự đóng",
                    "chưa chạy: thêm --serial-port COMx của Node B")
        return
    import serial  # pyserial
    s = serial.Serial(port, 115200)
    s.dtr = False
    s.rts = True  # giữ chân EN của ESP32 ở mức thấp = thiết bị tắt
    t0 = time.time()
    offline_at = alert = None
    try:
        while time.time() - t0 < 150:
            st = op.status(CTRL_ID)
            if not st.get("online") or st.get("status") == "OFFLINE":
                offline_at = time.time() - t0
                alert = next((a for a in op.alerts(status="OPEN", type="DEVICE_OFFLINE", deviceId=CTRL_ID)), None)
                break
            time.sleep(2)
    finally:
        s.rts = False  # thả reset, thiết bị khởi động lại
        s.close()
    rep.add("CN-09", "Phát hiện thiết bị offline", offline_at is not None and alert is not None,
            "Ngắt thiết bị → LWT/OFFLINE ≤ 90 s, alert DEVICE_OFFLINE",
            f"OFFLINE sau {offline_at:.0f} s, alert {'có' if alert else 'không'}" if offline_at else "không thấy OFFLINE trong 150 s",
            "ngắt bằng cách giữ ESP32 ở trạng thái reset qua cổng USB")
    t1 = time.time()
    back = None
    while time.time() - t1 < 90:
        st = op.status(CTRL_ID)
        if st.get("online") and st.get("status") == "ACTIVE":
            back = time.time() - t1
            break
        time.sleep(2)
    time.sleep(3)
    open_alert = [a for a in op.alerts(status="OPEN", type="DEVICE_OFFLINE", deviceId=CTRL_ID)]
    rep.add("CN-10", "Phục hồi sau mất kết nối", back is not None and not open_alert,
            "Thiết bị tự kết nối lại, ACTIVE, alert tự đóng (NFR-04 < 30 s)",
            f"ACTIVE lại sau {back:.0f} s tính từ lúc thả reset, alert mở còn {len(open_alert)}" if back else "không ACTIVE lại trong 90 s")


# ------------------------------------------------------------------ CN-11: lệnh trùng
def tc_duplicate(op, watcher):
    cid_a, cid_b = f"CMD-DUP-{uuid.uuid4().hex[:6]}", f"CMD-DUP-{uuid.uuid4().hex[:6]}"
    topic = f"office/{CTRL_ID}/command"
    acks = {}

    def ack_of(cid):
        return lambda t, p, r: t.endswith("/ack") and p.get("commandId") == cid

    watcher.drain()
    watcher.publish(topic, {"commandId": cid_a, "target": "light1", "action": "ON", "issuedBy": "systest"})
    first = watcher.wait_for(ack_of(cid_a), 5)
    watcher.publish(topic, {"commandId": cid_b, "target": "light1", "action": "OFF", "issuedBy": "systest"})
    watcher.wait_for(ack_of(cid_b), 5)
    watcher.drain()
    watcher.publish(topic, {"commandId": cid_a, "target": "light1", "action": "ON", "issuedBy": "systest"})
    again = watcher.wait_for(ack_of(cid_a), 5)
    time.sleep(1)
    light_after = op.status(CTRL_ID)["actuators"]["light1"]
    same_ack = first and again and first[2] == again[2]
    ok = bool(same_ack) and light_after == "OFF"
    rep.add("CN-11", "Lệnh trùng commandId (NFR-05)", ok,
            "Gửi lại commandId cũ → không thực thi lại, trả lại đúng ACK cũ",
            f"ACK lần 2 {'giống hệt' if same_ack else 'KHÁC'} lần 1 ({first[2] if first else '-'}); đèn sau khi gửi lại lệnh ON cũ = {light_after}")


# ------------------------------------------------------------------ CN-12: AI
def tc_ai(op):
    r = op.post("/ai/chat", {"message": "Nhiệt độ phòng hiện tại?", "deviceId": ENV_ID})
    code = (r.json().get("error") or {}).get("code") if r.status_code >= 400 and r.content else None
    rep.add("CN-12", "API trợ lý AI", r.status_code in (200, 503),
            "AI tắt → 503 AI_UNAVAILABLE; bật → 200",
            f"HTTP {r.status_code}{' ' + code if code else ''}")


# ------------------------------------------------------------------ CN-13: cấu hình từ xa
def tc_config(op, watcher):
    st = op.status(ENV_ID)
    lines, ok = [], True
    watcher.drain()
    r = op.put(f"/devices/{ENV_ID}/config", {"telemetryIntervalSec": 7})
    cfg = r.json() if r.ok else {}
    hit = watcher.wait_for(lambda t, p, rr: t.endswith("/ack") and p.get("configId") == cfg.get("configId"), 8) if r.ok else None
    ok &= bool(hit) and hit[2].get("status") == "SUCCESS"
    lines.append(f"PUT chu kỳ 7 s → {cfg.get('configId')} ACK {hit[2].get('status') if hit else 'không có'}")
    # chu kỳ mới có hiệu lực không: bỏ bản tin đầu (đang theo chu kỳ cũ), đo trung vị khoảng cách trong 32 s
    time.sleep(2)
    ts = []
    end = time.time() + 32
    watcher.drain()
    while time.time() < end:
        h = watcher.wait_for(lambda t, p, rr: t == f"office/{ENV_ID}/telemetry", end - time.time())
        if h:
            ts.append(h[0])
    gaps = [round(b - a, 1) for a, b in zip(ts, ts[1:])]
    gaps = gaps[1:] if len(gaps) > 2 else gaps
    med = sorted(gaps)[len(gaps) // 2] if gaps else None
    lines.append(f"khoảng cách telemetry sau đổi: {gaps} s (trung vị {med} s)")
    ok &= med is not None and 6 <= med <= 8.5
    r = op.put(f"/devices/{ENV_ID}/config", {"telemetryIntervalSec": 5})
    cfg2 = r.json() if r.ok else {}
    watcher.wait_for(lambda t, p, rr: t.endswith("/ack") and p.get("configId") == cfg2.get("configId"), 8)
    bad = op.put(f"/devices/{ENV_ID}/config", {"telemetryIntervalSec": 99999})
    lines.append(f"API giá trị sai 99999 → {bad.status_code} {(bad.json().get('error') or {}).get('code') if bad.content else ''}")
    ok &= bad.status_code == 400
    watcher.drain()
    bad_id = f"CFG-BAD-{uuid.uuid4().hex[:4]}"
    watcher.publish(f"office/{CTRL_ID}/config", {"configId": bad_id, "servoOpenDeg": 999})
    nack = watcher.wait_for(lambda t, p, rr: t.endswith("/ack") and p.get("configId") == bad_id, 6)
    lines.append(f"gửi thẳng góc servo 999 → thiết bị trả {nack[2].get('status') if nack else 'không có ACK'}")
    ok &= bool(nack) and nack[2].get("status") == "FAILED"
    rep.add("CN-13", "Thay đổi cấu hình thiết bị từ xa", ok,
            "Config hợp lệ → ACK SUCCESS và áp dụng; sai dải → API 400, thiết bị FAILED", "; ".join(lines))


# ------------------------------------------------------------------ CN-14: khóa thiết bị
def tc_lock(op):
    admin = Api("admin")
    before = latest_power_received(admin)
    r = admin.post(f"/devices/{CTRL_ID}/lock")
    try:
        time.sleep(1)
        cmd, _ = op.command(CTRL_ID, "light1", "ON")
        code = (cmd.json().get("error") or {}).get("code") if cmd.content else ""
        time.sleep(12)
        after = latest_power_received(admin)
        ignored = after == before or (after and before and after <= before)
    finally:
        admin.post(f"/devices/{CTRL_ID}/activate")
    time.sleep(7)
    resumed = latest_power_received(admin)
    cmd2, _ = op.command(CTRL_ID, "light1", "OFF")
    ok = r.ok and cmd.status_code == 409 and ignored and cmd2.ok
    rep.add("CN-14", "Khóa thiết bị: không còn nhận dữ liệu / lệnh (bảo mật)", ok,
            "LOCKED → lệnh bị 409, telemetry bị bỏ qua; kích hoạt lại → hoạt động bình thường",
            f"lock {r.status_code}; lệnh khi khóa → {cmd.status_code} {code}; telemetry trong 12 s khóa "
            f"{'không được lưu' if ignored else 'VẪN được lưu'}; sau activate telemetry {'tiếp tục' if resumed and resumed != after else 'chưa thấy'}, lệnh → {cmd2.status_code}")


# ------------------------------------------------------------------ CN-15: ACL broker
def tc_acl(watcher):
    users = mqtt_users()
    nonce = uuid.uuid4().hex[:8]
    c, rc = device_client(ENV_ID, users[ENV_ID], client_id=f"systest-acl-{nonce}")
    watcher.drain()
    c.publish(f"office/{CTRL_ID}/status", f'{{"online":false,"nonce":"{nonce}"}}', qos=1).wait_for_publish(3)
    leaked = watcher.wait_for(lambda t, p, r: p.get("nonce") == nonce, 3)
    granted = {}
    c.on_subscribe = lambda cl, ud, mid, rcs, props=None: granted.setdefault("rc", [str(x) for x in rcs])
    c.subscribe(f"office/{CTRL_ID}/command", qos=1)
    time.sleep(1.5)
    c.loop_stop()
    c.disconnect()
    c2, rc2 = device_client(ENV_ID, "mat-khau-sai-" + nonce)
    c2.loop_stop()
    sub_rc = granted.get("rc", ["?"])
    sub_denied = any("128" in x or "Not authorized" in x or "Unspecified" in x or "0x80" in x for x in sub_rc)
    ok = rc is not None and not rc.is_failure and leaked is None and rc2 is not None and rc2.is_failure
    rep.add("CN-15", "Broker từ chối truy cập sai (bảo mật)", ok,
            "Node A ghi sang topic Node B bị chặn; sai mật khẩu bị từ chối",
            f"ghi chéo topic: {'LỌT' if leaked else 'bị chặn'}; subscribe command của Node B: {sub_rc}; sai mật khẩu → {rc2}",
            "" if sub_denied else "Mosquitto có thể vẫn trả SUBACK nhưng không chuyển bản tin; xem ghi chú ACL")


# ------------------------------------------------------------------ CN-17: đăng ký / kích hoạt / ngừng thiết bị
def tc_lifecycle():
    admin = Api("admin")
    dev = f"test-device-{uuid.uuid4().hex[:6]}"
    r = admin.post("/devices", {"deviceId": dev, "name": "Thiết bị kiểm thử", "type": "ENV", "roomId": "room-01", "fwVersion": "0.0.1"})
    s1 = r.json().get("status") if r.ok else r.status_code

    def step(op):
        x = admin.post(f"/devices/{dev}/{op}")
        return x.json().get("status") if x.ok else f"{x.status_code} {x.json().get('error', {}).get('code', '')}".strip()

    steps = [("activate", "ACTIVE"), ("maintenance", "MAINTENANCE"), ("activate", "ACTIVE"),
             ("decommission", "409 INVALID_TRANSITION"),   # đang dùng: phải khóa trước
             ("lock", "LOCKED"), ("activate", "ACTIVE"),    # mở khóa
             ("lock", "LOCKED"), ("decommission", "DECOMMISSIONED"),
             ("activate", "409 INVALID_TRANSITION")]       # không hoàn tác
    got = [step(op) for op, _ in steps]
    op_reg = Api("operator1").post("/devices", {"deviceId": dev + "x", "name": "x", "type": "ENV"}).status_code
    ok = r.status_code == 201 and s1 == "REGISTERED" and got == [want for _, want in steps] and op_reg == 403
    trace = " → ".join(f"{op}:{g}" for (op, _), g in zip(steps, got))
    rep.add("CN-17", "Vòng đời thiết bị: đăng ký, kích hoạt, bảo trì, khóa/mở khóa, ngừng sử dụng", ok,
            "Đúng luồng thì chuyển được; sai luồng 409 INVALID_TRANSITION; decommission không hoàn tác; Operator không được đăng ký",
            f"{dev}: {s1} → {trace}; Operator đăng ký → {op_reg}", "thiết bị thử để lại ở trạng thái DECOMMISSIONED")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--serial-port", help="cổng COM của Node B để thử offline/phục hồi")
    ap.add_argument("--absence", action="store_true", help="thử tự động hóa phòng trống (cần rời khỏi radar)")
    ap.add_argument("--only", help="chỉ chạy các nhóm ca, phân cách dấu phẩy: viewer,telemetry,control,alert,absence,"
                                   "duplicate,ai,config,lock,acl,lifecycle,offline")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None

    def want(name):
        return only is None or name in only

    op = tc_auth() if only is None else Api("operator1")
    for dev in (ENV_ID, CTRL_ID):
        st = op.status(dev)
        if not st.get("online"):
            print(f"CẢNH BÁO: {dev} đang offline ({st.get('status')}), nhiều ca sẽ FAIL", flush=True)
    watcher = Watcher(label="func")
    try:
        steps = [("viewer", lambda: tc_viewer(op)), ("telemetry", lambda: tc_telemetry(op, watcher)),
                 ("control", lambda: tc_control(op)), ("alert", lambda: tc_temp_alert(op)),
                 ("absence", lambda: tc_absence(op, args.absence)), ("duplicate", lambda: tc_duplicate(op, watcher)),
                 ("ai", lambda: tc_ai(op)), ("config", lambda: tc_config(op, watcher)), ("lock", lambda: tc_lock(op)),
                 ("acl", lambda: tc_acl(watcher)), ("lifecycle", tc_lifecycle),
                 ("offline", lambda: tc_offline(op, args.serial_port))]
        for name, fn in steps:
            if want(name):
                fn()
    finally:
        watcher.close()
    counts = rep.save()
    sys.exit(1 if counts.get("FAIL") else 0)


if __name__ == "__main__":
    main()
