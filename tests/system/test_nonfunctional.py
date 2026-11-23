#!/usr/bin/env python3
"""Kiểm thử phi chức năng trên hệ thống THẬT (đề bài mục 7.2, báo cáo Bảng 10.2).

  python test_nonfunctional.py                     # đo tất cả, cửa sổ đếm bản tin 5 phút
  python test_nonfunctional.py --minutes 30        # cửa sổ đếm bản tin dài hơn
  python test_nonfunctional.py --skip-broker-restart
  python test_nonfunctional.py --only loss --minutes 1440   # chạy ổn định 24 giờ (NFR-06)

Các phép đo:
  PCN-01 Độ trễ cảm biến → dashboard: bản tin MQTT tới broker → sự kiện SSE tới trình duyệt (cùng đồng hồ máy đo)
  PCN-02 Độ trễ lệnh → ACK: 20 lệnh qua REST như giao diện (wait=true), đo khứ hồi và latencyMs của thiết bị
  PCN-03 Tỷ lệ mất bản tin: đếm khoảng trống của trường seq trong telemetry hai node
  PCN-04 Phục hồi mạng: khởi động lại container Mosquitto, đo thời gian đến khi cả hai node báo online
  PCN-05 Tải đồng thời: 20 luồng SSE + 300 request API song song
  PCN-06 Tài nguyên: docker stats của các container
Kết quả ghi vào tests/system/results/nonfunctional_<ngày>.md và .json.
"""
import argparse
import statistics
import subprocess
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from common import CTRL_ID, ENV_ID, Api, Report, SseListener, Watcher, now_utc, parse_ts

rep = Report("nonfunctional", tag=(sys.argv[sys.argv.index("--only") + 1] if "--only" in sys.argv else None))
measure = {}


def pct(values, p):
    if not values:
        return None
    v = sorted(values)
    k = max(0, min(len(v) - 1, round(p / 100 * (len(v) - 1))))
    return v[k]


def summary(values, unit="ms"):
    if not values:
        return "không có mẫu"
    return (f"n={len(values)}, trung bình {statistics.mean(values):.0f} {unit}, trung vị {statistics.median(values):.0f}, "
            f"p95 {pct(values, 95):.0f}, lớn nhất {max(values):.0f}")


# ------------------------------------------------------------------ PCN-01
def nfr_latency_dashboard(op, seconds=60):
    watcher = Watcher(topics=("office/+/telemetry",), label="lat")
    sse = SseListener(op.token)
    time.sleep(1)
    start = time.time()
    time.sleep(seconds)
    sse.close()
    watcher.close()
    # ghép bản tin MQTT với sự kiện SSE theo deviceId + thứ tự thời gian
    mqtt_msgs = [(t, p) for t, topic, p, r in watcher.log if not r and t >= start]
    sse_msgs = [(t, d) for t, typ, d in sse.events if typ == "telemetry" and t >= start and isinstance(d, dict)]
    lat, used = [], set()
    for t_m, p in mqtt_msgs:
        dev = p.get("deviceId")
        cand = [(t_s, i) for i, (t_s, d) in enumerate(sse_msgs) if i not in used and d.get("deviceId") == dev and t_s >= t_m - 0.05]
        if cand:
            t_s, i = min(cand)
            if t_s - t_m < 5:
                used.add(i)
                lat.append((t_s - t_m) * 1000)
    measure["PCN-01"] = {"mqttToSseMs": lat, "mqttMessages": len(mqtt_msgs), "sseEvents": len(sse_msgs)}
    ok = bool(lat) and pct(lat, 95) < 2000
    rep.add("PCN-01", "Độ trễ cảm biến → dashboard (NFR-01)", ok, "< 2 s",
            f"broker → backend → SSE tới trình duyệt: {summary(lat)} ({len(mqtt_msgs)} bản tin trong {seconds} s)",
            "cộng thêm thời gian ESP32 đọc cảm biến + Wi-Fi (không đo được bằng đồng hồ máy này)")


# ------------------------------------------------------------------ PCN-02
def nfr_command_latency(op, n=20):
    rtt, dev_ms, failed = [], [], 0
    initial = op.status(CTRL_ID)["actuators"]["light1"]
    for i in range(n):
        action = "ON" if i % 2 == 0 else "OFF"
        r, ms = op.command(CTRL_ID, "light1", action)
        body = r.json() if r.content else {}
        if r.ok and body.get("status") == "SUCCESS":
            rtt.append(ms)
            dev_ms.append(body.get("latencyMs") or 0)
        else:
            failed += 1
        time.sleep(0.3)
    if initial == "ON":
        op.command(CTRL_ID, "light1", "ON")
    door = []
    for action in ("OPEN", "CLOSE"):
        r, ms = op.command(CTRL_ID, "door1", action)
        b = r.json() if r.content else {}
        door.append(f"{action} {b.get('status')} khứ hồi {ms:.0f} ms (thiết bị {b.get('latencyMs')} ms)")
    measure["PCN-02"] = {"roundTripMs": rtt, "deviceLatencyMs": dev_ms, "failed": failed, "door": door}
    ok = failed == 0 and rtt and pct(rtt, 95) < 1000
    rep.add("PCN-02", "Độ trễ lệnh → ACK (NFR-02)", ok, "< 1 s cho đèn/quạt/còi; cửa < 5 s",
            f"đèn, {n} lệnh qua REST: khứ hồi {summary(rtt)}; thiết bị xử lý {summary(dev_ms)}; lỗi {failed}. Cửa: " + "; ".join(door))


# ------------------------------------------------------------------ PCN-03
def nfr_loss(minutes):
    watcher = Watcher(topics=("office/+/telemetry",), label="loss")
    print(f">>> Đếm bản tin telemetry trong {minutes} phút...", flush=True)
    end = time.time() + minutes * 60
    while time.time() < end:
        time.sleep(min(30, end - time.time()))
        print(f"    còn {max(0, end - time.time()) / 60:.1f} phút, đã nhận {len(watcher.log)} bản tin", flush=True)
    watcher.close()
    detail = []
    total_exp = total_rx = 0
    restarts = 0
    for dev in (ENV_ID, CTRL_ID):
        seqs = [p.get("seq") for t, topic, p, r in watcher.log if p.get("deviceId") == dev and isinstance(p.get("seq"), int)]
        if not seqs:
            detail.append(f"{dev}: không có bản tin")
            continue
        # seq quay về 1 nghĩa là thiết bị khởi động lại: tách đoạn
        segments, cur = [], [seqs[0]]
        for s in seqs[1:]:
            if s < cur[-1]:
                segments.append(cur)
                cur = [s]
                restarts += 1
            else:
                cur.append(s)
        segments.append(cur)
        exp = sum(seg[-1] - seg[0] + 1 for seg in segments)
        rx = len(set((i, s) for i, seg in enumerate(segments) for s in seg))
        dup = len(seqs) - rx
        total_exp += exp
        total_rx += rx
        detail.append(f"{dev}: nhận {rx}/{exp} (mất {exp - rx}, trùng {dup})")
    loss = 100 * (total_exp - total_rx) / total_exp if total_exp else None
    measure["PCN-03"] = {"minutes": minutes, "expected": total_exp, "received": total_rx, "lossPercent": loss, "deviceRestarts": restarts}
    rep.add("PCN-03", "Tỷ lệ mất bản tin (NFR-03)", loss is not None and loss < 1, "< 1 %",
            (f"{loss:.2f} % trong {minutes} phút; " if loss is not None else "") + "; ".join(detail)
            + (f"; thiết bị khởi động lại {restarts} lần" if restarts else ""))
    return restarts


# ------------------------------------------------------------------ PCN-04
def nfr_reconnect(op):
    before = {d: parse_ts(op.status(d).get("lastSeenAt")) for d in (ENV_ID, CTRL_ID)}
    t0 = time.time()
    subprocess.run(["docker", "restart", "iot-mosquitto"], check=True, capture_output=True)
    restarted = time.time()
    back = {}
    watcher = None
    for _ in range(60):
        try:
            watcher = Watcher(topics=("office/+/status", "office/+/telemetry"), label="rc")
            break
        except SystemExit:
            time.sleep(1)
    while time.time() - restarted < 90 and len(back) < 2:
        hit = watcher.wait_for(lambda t, p, r: not r and t.split("/")[1] in (ENV_ID, CTRL_ID) and t.split("/")[1] not in back, 2)
        if hit:
            back[hit[1].split("/")[1]] = hit[0] - restarted
    watcher.close()
    # Phục hồi đầu-cuối: backend phải nhận lại dữ liệu (lastSeenAt mới hơn thời điểm khởi động lại broker)
    from datetime import datetime, timezone
    restart_at = datetime.fromtimestamp(restarted, timezone.utc)
    backend_back = {}
    while time.time() - restarted < 240 and len(backend_back) < 2:
        for d in (ENV_ID, CTRL_ID):
            if d in backend_back:
                continue
            seen = parse_ts(op.status(d).get("lastSeenAt"))
            if seen and seen > restart_at:
                backend_back[d] = time.time() - restarted
        time.sleep(2)
    measure["PCN-04"] = {"brokerRestartSec": restarted - t0, "deviceBackSec": back, "backendBackSec": backend_back}
    dev_worst = max(back.values()) if len(back) == 2 else None
    be_worst = max(backend_back.values()) if len(backend_back) == 2 else None
    ok = dev_worst is not None and be_worst is not None and be_worst < 30
    rep.add("PCN-04", "Phục hồi sau khi broker khởi động lại (NFR-04)", ok, "< 30 s, đầu-cuối tới backend",
            "thiết bị gửi lại: " + ", ".join(f"{d} {s:.1f} s" for d, s in back.items())
            + "; backend nhận lại dữ liệu: " + (", ".join(f"{d} {s:.0f} s" for d, s in backend_back.items()) or "chưa trong 240 s"),
            "tính từ lúc broker chạy lại; phần chậm nằm ở client MQTT của backend (Paho tự kết nối lại với thời gian chờ tăng dần)")


# ------------------------------------------------------------------ PCN-05
def nfr_load(op):
    sses = [SseListener(op.token) for _ in range(20)]
    lat, errors = [], 0

    def one(i):
        t = time.perf_counter()
        r = op.get(f"/devices/{ENV_ID if i % 2 else CTRL_ID}/status")
        return (time.perf_counter() - t) * 1000, r.status_code

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=30) as ex:
        for ms, code in ex.map(one, range(300)):
            lat.append(ms)
            errors += code != 200
    elapsed = time.time() - t0
    time.sleep(6)
    got = [sum(1 for e in s.events if e[1] == "telemetry") for s in sses]
    for s in sses:
        s.close()
    measure["PCN-05"] = {"requestMs": lat, "errors": errors, "sseEventsPerClient": got, "seconds": elapsed}
    rep.add("PCN-05", "Tải đồng thời API + SSE", errors == 0 and min(got) > 0, "Không lỗi, mọi client SSE vẫn nhận dữ liệu",
            f"300 request / 30 luồng trong {elapsed:.1f} s ({300 / elapsed:.0f} req/s): {summary(lat)}, lỗi {errors}; "
            f"20 client SSE nhận {min(got)}–{max(got)} sự kiện telemetry trong lúc tải")


# ------------------------------------------------------------------ PCN-06
def nfr_resources(op):
    out = subprocess.run(["docker", "stats", "--no-stream", "--format", "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"],
                         capture_output=True, text=True).stdout.strip().splitlines()
    rows = [l.split("|") for l in out if l.startswith("iot-")]
    up = {d: op.status(d) for d in (ENV_ID, CTRL_ID)}
    measure["PCN-06"] = {"docker": rows}
    rep.add("PCN-06", "Mức dùng tài nguyên", "PASS", "Ghi nhận CPU / RAM",
            "; ".join(f"{n}: CPU {c}, RAM {m.split('/')[0].strip()}" for n, c, m in rows),
            "RAM ESP32: firmware dùng 15–17 % RAM tĩnh (theo trình biên dịch)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutes", type=float, default=5, help="thời gian đếm bản tin cho PCN-03")
    ap.add_argument("--skip-broker-restart", action="store_true")
    ap.add_argument("--only", choices=["latency", "command", "loss", "reconnect", "load", "resources"])
    args = ap.parse_args()
    op = Api("operator1")
    # Khởi động lại broker để CUỐI cùng: sau đó backend cần thời gian kết nối lại, các phép đo khác sẽ bị ảnh hưởng.
    steps = {
        "latency": lambda: nfr_latency_dashboard(op),
        "command": lambda: nfr_command_latency(op),
        "loss": lambda: nfr_loss(args.minutes),
        "load": lambda: nfr_load(op),
        "resources": lambda: nfr_resources(op),
        "reconnect": lambda: None if args.skip_broker_restart else nfr_reconnect(op),
    }
    for name, fn in steps.items():
        if args.only and name != args.only:
            continue
        try:
            fn()
        except Exception as e:  # noqa: BLE001
            rep.add(name, f"Lỗi khi đo {name}", "FAIL", "-", f"{type(e).__name__}: {e}")
    counts = rep.save(measure)
    sys.exit(1 if counts.get("FAIL") else 0)


if __name__ == "__main__":
    main()
