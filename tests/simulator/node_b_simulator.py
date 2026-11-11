"""Giả lập Node B (office-ctrl-01) theo Contract v1.3.

Chạy:
    python simulated_node.py
    MQTT_HOST=192.168.10.205 MQTT_PORT=1884 python simulated_node.py

Env:
    MQTT_HOST (default localhost)
    MQTT_PORT (default 1883)
    MQTT_USERNAME / MQTT_PASSWORD (optional, dev broker đang anonymous)
    MQTT_DEVICE_ID (default office-ctrl-01)
"""

import json
import os
import sys
import time

import paho.mqtt.client as mqtt

# Windows console mặc định cp1252 -> ép UTF-8 để không chết khi log tiếng Việt.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

BROKER = os.environ.get("MQTT_HOST", "localhost")
PORT = int(os.environ.get("MQTT_PORT", "1883"))
USERNAME = os.environ.get("MQTT_USERNAME", "")
PASSWORD = os.environ.get("MQTT_PASSWORD", "")
DEVICE_ID = os.environ.get("MQTT_DEVICE_ID", "office-ctrl-01")

TOPIC_COMMAND = f"office/{DEVICE_ID}/command"
TOPIC_CONFIG = f"office/{DEVICE_ID}/config"
TOPIC_ACK = f"office/{DEVICE_ID}/ack"
TOPIC_STATUS = f"office/{DEVICE_ID}/status"
TOPIC_TELEMETRY = f"office/{DEVICE_ID}/telemetry"

TELEMETRY_INTERVAL = 5
HEARTBEAT_INTERVAL = 30

state = {
    "light1": "OFF",
    "fan1": "OFF",
    "buzzer1": "OFF",
    "door1": "CLOSED",
}
last_sent = {"telemetry": 0.0, "status": 0.0}


def publish_json(client, topic, payload, retain=False):
    client.publish(topic, json.dumps(payload), qos=1, retain=retain)


def publish_status(client):
    payload = {
        "online": True,
        "light1": state["light1"],
        "fan1": state["fan1"],
        "buzzer1": state["buzzer1"],
        "door1": state["door1"],
        "mode": "AUTO",
        "fwVersion": "sim-1.0.0",
    }
    publish_json(client, TOPIC_STATUS, payload, retain=True)
    last_sent["status"] = time.time()
    print(f"[STATUS] {payload}")


def publish_telemetry(client):
    light_on = state["light1"] == "ON"
    fan_on = state["fan1"] == "ON"
    payload = {
        "deviceId": DEVICE_ID,
        "busVoltageV": 12.1,
        "light1PowerW": 4.8 if light_on else 0.0,
        "light1CurrentMa": 397 if light_on else 0,
        "fan1PowerW": 2.1 if fan_on else 0.0,
        "fan1CurrentMa": 173 if fan_on else 0,
        "quality": "VALID",
        "rssi": -60,
    }
    publish_json(client, TOPIC_TELEMETRY, payload)
    last_sent["telemetry"] = time.time()
    print(f"[TELEMETRY] light1={state['light1']} fan1={state['fan1']}")


def apply_command(target, action):
    if target in ("light1", "fan1"):
        if action not in ("ON", "OFF"):
            return False
        state[target] = action
        return True
    if target == "buzzer1":
        if action not in ("ON", "OFF", "BEEP", "BEEP2", "BEEP_LONG", "ALARM"):
            return False
        state["buzzer1"] = "OFF" if action == "OFF" else "ON"
        return True
    if target == "door1":
        if action not in ("OPEN", "CLOSE"):
            return False
        state["door1"] = "OPEN" if action == "OPEN" else "CLOSED"
        return True
    return False


def on_connect(client, userdata, flags, reason_code, properties):
    if reason_code.is_failure:
        print(f"[CONNECT] bị từ chối: {reason_code}. Kiểm tra username/password.")
        return
    print(f"[CONNECT] Node B giả lập {DEVICE_ID} đã kết nối {BROKER}:{PORT}")
    client.subscribe(TOPIC_COMMAND, qos=1)
    client.subscribe(TOPIC_CONFIG, qos=1)
    publish_status(client)
    publish_telemetry(client)


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode())
    except Exception:
        print(f"[WARN] bỏ qua bản tin không phải JSON trên {msg.topic}")
        return

    if msg.topic == TOPIC_CONFIG:
        config_id = payload.get("configId")
        if not config_id:
            print("[WARN] config thiếu configId, bỏ qua")
            return
        ack = {"configId": config_id, "status": "SUCCESS"}
        publish_json(client, TOPIC_ACK, ack)
        print(f"[CONFIG] nhận {config_id}: {payload}")
        return

    command_id = payload.get("commandId")
    target = payload.get("target")
    action = payload.get("action")
    if not command_id or not target:
        print(f"[WARN] command thiếu commandId/target: {payload}")
        return

    started = time.time()
    ok = apply_command(target, action)
    ack = {
        "commandId": command_id,
        "target": target,
        "status": "SUCCESS" if ok else "FAILED",
        "state": state.get(target, "OFF"),
        "latencyMs": int((time.time() - started) * 1000),
    }
    publish_json(client, TOPIC_ACK, ack)
    print(f"[ACK] {command_id} {target} {action} -> {ack['status']}")
    publish_status(client)


def main():
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"{DEVICE_ID}-sim",
        clean_session=True,
    )
    client.on_connect = on_connect
    client.on_message = on_message
    client.will_set(
        TOPIC_STATUS,
        json.dumps({"online": False}),
        qos=1,
        retain=True,
    )
    if USERNAME:
        client.username_pw_set(USERNAME, PASSWORD)

    print(f"Đang kết nối MQTT {BROKER}:{PORT} ...")
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()

    try:
        while True:
            now = time.time()
            if now - last_sent["telemetry"] >= TELEMETRY_INTERVAL:
                publish_telemetry(client)
            if now - last_sent["status"] >= HEARTBEAT_INTERVAL:
                publish_status(client)
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nDừng simulator, gửi offline retained...")
        publish_json(client, TOPIC_STATUS, {"online": False}, retain=True)
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
