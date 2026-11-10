import json
import random
import time
paho_mqtt = None
import paho.mqtt.client as mqtt

BROKER = "localhost"
PORT = 1883
DEVICE_ID = "office-ctrl-01"

TOPIC_COMMAND = f"office/{DEVICE_ID}/command"
TOPIC_ACK = f"office/{DEVICE_ID}/ack"
TOPIC_STATUS = f"office/{DEVICE_ID}/status"
TOPIC_TELEMETRY = f"office/{DEVICE_ID}/telemetry"

def on_connect(client, userdata, flags, rc):
    print(f"Giả lập IoT Node [{DEVICE_ID}] đã kết nối MQTT Broker! Mã phản hồi: {rc}")
    client.subscribe(TOPIC_COMMAND)
    # Gửi trạng thái ban đầu lên hệ thống
    publish_status(client, "OFF", "OFF", "CLOSED")

def on_message(client, userdata, msg):
    print(f"\n[Nhận Lệnh từ Backend] Topic: {msg.topic}")
    try:
        payload = json.loads(msg.payload.decode())
        print(f"Nội dung lệnh: {payload}")
        
        cmd_id = payload.get("commandId", "123")
        target = payload.get("target", "light1")
        action = payload.get("action", "ON")
        
        # Phản hồi lại bản tin ACK xác nhận đã nhận lệnh
        ack_payload = {
            "commandId": cmd_id,
            "status": "SUCCESS",
            "message": f"Executed {action} on {target}"
        }
        client.publish(TOPIC_ACK, json.dumps(ack_payload))
        print(f"[Gửi ACK]: {ack_payload}")
        
        # Giả lập gửi lại trạng thái thiết bị sau khi thay đổi
        publish_status(client, action if target=="light1" else "OFF", action if target=="fan1" else "OFF", "CLOSED")
        
    except Exception as e:
        print(f"Lỗi xử lý bản tin: {e}")

def publish_status(client, light, fan, door):
    status_payload = {
        "deviceId": DEVICE_ID,
        "light1": light,
        "fan1": fan,
        "door1": door,
        "timestamp": int(time.time() * 1000)
    }
    client.publish(TOPIC_STATUS, json.dumps(status_payload))
    print(f"[Gửi Status/Telemetry]: {status_payload}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

print("Đang kết nối tới MQTT Broker...")
client.connect(BROKER, PORT, 60)

# Vòng lặp giữ kết nối và định kỳ gửi telemetry (mỗi 10 giây)
client.loop_start()
try:
    while True:
        time.sleep(10)
        # Gửi dữ liệu cảm biến giả lập định kỳ
        client.publish(TOPIC_TELEMETRY, json.dumps({
            "deviceId": DEVICE_ID,
            "temperature": round(random.uniform(25.0, 30.0), 1),
            "humidity": round(random.uniform(50.0, 60.0), 1)
        }))
        print(f"[Gửi Telemetry định kỳ]")
except KeyboardInterrupt:
    print("Dừng chương trình giả lập.")
    client.loop_stop()