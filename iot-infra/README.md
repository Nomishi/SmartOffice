# Hạ tầng – Phòng làm việc thông minh IoT (M4)

Docker Compose cho **Mosquitto** (MQTT) và **PostgreSQL**, cấu hình **credential riêng từng thiết bị + ACL theo topic**,
kèm **mock publisher** (thiết bị giả) và **script kiểm tra bảo mật** broker. Bám Contract chung v1.3 (mục 4, 5, 6, 11).

## Chạy nhanh

```bash
cp .env.example .env        # đổi hết mật khẩu trong .env
docker compose up -d        # mosquitto + postgres
docker compose ps           # chờ trạng thái healthy
```

| Dịch vụ | Cổng | Ghi chú |
| --- | --- | --- |
| Mosquitto | 1883 | MQTT thuần, bắt buộc đăng nhập (không cho ẩn danh) |
| PostgreSQL | 5432 | chỉ để dev, bỏ dòng `ports` khi triển khai thật |

`backend` (M3) có sẵn khối mẫu đang comment trong `docker-compose.yml`. Giao diện web chạy bằng `docker compose --profile ui up -d --build frontend` (cần thư mục `iot-frontend` nằm cạnh `iot-infra`), mở `http://localhost:3000`.

### Lưu ý khi dùng Windows

- Cần cài **Docker Desktop** (đang chạy) và **Python 3.10 trở lên**.
- Trong `cmd`, dấu nháy đơn `'...'` không dùng được: viết `-t "office/+/telemetry"` với nháy kép.
- File `mosquitto/entrypoint.sh` **phải để kết thúc dòng LF** (không phải CRLF). Trong VS Code, bấm `CRLF` ở góc dưới bên phải rồi chọn `LF`, lưu lại. Repo đã có `.gitattributes` để Git tự giữ LF.
- Nếu `mosquitto` báo `Restarting` và log có `Lỗi: mục số N trong MQTT_USERS ...`: sửa đúng mục N trong `.env`. Nguyên nhân hay gặp: mật khẩu có dấu cách, dấu phẩy hoặc ký tự `$`; viết `user: mat_khau` (có dấu cách sau dấu hai chấm); xuống dòng giữa chừng. Xem cấu trúc mà không lộ mật khẩu (PowerShell): `(Select-String -Path .env -Pattern '^MQTT_USERS=').Line -replace ':[^,]*',':***'`. Sửa xong chạy `docker compose up -d --force-recreate mosquitto`.
- Nếu cổng 1883 hoặc 5432 đã bị chiếm (ví dụ máy có PostgreSQL cài sẵn), sửa dòng `ports` trong `docker-compose.yml`, chẳng hạn `"5433:5432"`.

## Credential và ACL

Mỗi thiết bị đăng nhập bằng **username = deviceId** và mật khẩu riêng. Mật khẩu nằm trong `.env`, biến `MQTT_USERS`
(dạng `user:mat_khau,user2:mat_khau2`). Mỗi lần container Mosquitto khởi động, `mosquitto/entrypoint.sh` tạo lại file mật khẩu (đã băm)
từ biến này, nên **không có mật khẩu nào nằm trong repo**.

`mosquitto/acl.conf` (mặc định từ chối mọi thứ không được liệt kê):

| Ai | Được ghi (publish) | Được đọc (subscribe) |
| --- | --- | --- |
| Thiết bị `X` | `office/X/telemetry`, `office/X/status`, `office/X/ack` | `office/X/command`, `office/X/config` |
| `backend` | `office/+/command`, `office/+/config` | `office/+/telemetry`, `office/+/status`, `office/+/ack` |

Dòng `pattern ... %u` dùng username làm tên thiết bị, nên **thêm thiết bị mới không cần sửa ACL**.

### Thêm thiết bị

1. Nối vào `MQTT_USERS` trong `.env`: `,office-env-02:mat-khau-moi`
2. `docker compose up -d --force-recreate mosquitto`
3. Đưa `deviceId` và mật khẩu cho người nạp firmware. Backend và dashboard vẫn phải đăng ký thiết bị đó (màn hình Thiết bị).

### Thu hồi thiết bị (LOCKED / DECOMMISSIONED)

Xóa mục của thiết bị khỏi `MQTT_USERS`, rồi chạy lại lệnh ở bước 2. Từ lúc đó thiết bị không kết nối lại được. Các client khác
mất kết nối vài giây và tự kết nối lại (reconnect có backoff theo Contract mục 6).

## Mock publisher (thiết bị giả)

```bash
cd scripts
pip install -r requirements.txt
python mock_publisher.py                         # Node A + Node B, kịch bản normal, 5 giây/lần
```

Hoặc chạy trong Docker: `docker compose --profile mock up -d mock-publisher`.

Giả lập đúng Contract: telemetry 5 giây/lần kèm `quality`, status retained + LWT + heartbeat 30 giây, nhận `command` rồi gửi `ack`
(relay dưới 1 giây, `door1` chậm hơn), trùng `commandId` thì **không thực thi lại nhưng gửi lại ACK cũ**, nhận `config` rồi gửi `ack`,
khởi động ở trạng thái an toàn (tải OFF, cửa đóng).

| Kịch bản (`--scenario`) | Dùng để thử |
| --- | --- |
| `normal` | luồng bình thường, thỉnh thoảng `SUSPECT` |
| `hot` | nhiệt độ > 30 °C → cảnh báo `TEMP_HIGH` |
| `sensor-fault` | 3 bản VALID, 4 bản INVALID liên tiếp, rồi VALID → `SENSOR_FAULT` mở rồi tự đóng |
| `absent` | `presence=false` liên tục, đèn/quạt bật sẵn → `ABSENCE_OFF`, `ENERGY_WASTE` |
| `silent` | ngừng gửi sau 30 giây (`--silent-after`) → `DEVICE_OFFLINE` sau 90 giây |

Tùy chọn khác: `--devices env` hoặc `ctrl`, `--interval`, `--door-delay`, `--fail-door` (công tắc từ không khớp lệnh → ACK `FAILED`),
`--spoof-device-id` (Node A ghi `deviceId` của Node B trong payload để thử backend có bỏ bản tin giả mạo không; ACL của broker không chặn được trường hợp này),
`--host`, `--port`. Nhấn Ctrl+C sẽ gửi `online:false` (ngắt sạch thì broker không gửi LWT).

## Gửi lệnh thử (đóng vai backend)

Khi `mock_publisher.py` đang chạy, mở terminal khác (cùng thư mục `scripts`, đã bật `.venv`):

```bash
python send_command.py light1 ON      # đèn: ON/OFF; fan1, buzzer1 tương tự
python send_command.py door1 OPEN     # cửa: OPEN/CLOSE (servo chạy nên ACK chậm hơn)
```

Script gửi lệnh vào `office/office-ctrl-01/command` bằng tài khoản `backend` rồi chờ ACK và in kết quả. Mã thoát: 0 = SUCCESS, 2 = FAILED, 3 = không có ACK, 1 = lỗi kết nối hoặc tham số. Dùng thay cho `mosquitto_pub`, vì gõ JSON có dấu nháy kép trong PowerShell rất dễ sai.

Nếu vẫn muốn dùng `mosquitto_pub` trong PowerShell, đưa JSON qua stdin (dùng `-i`, không dùng `-it`):

```powershell
'{"commandId":"CMD-9001","target":"light1","action":"ON","issuedBy":"test"}' | docker exec -i iot-mosquitto mosquitto_pub -u backend -P backend123 -t office/office-ctrl-01/command -l
```

## Kiểm tra bảo mật broker

```bash
cd scripts
python test_acl.py          # broker đang chạy, đọc MQTT_USERS từ ../.env
```

Kiểm tra 19 điều: ẩn danh/sai mật khẩu/tài khoản đã thu hồi bị từ chối; thiết bị chỉ ghi và đọc đúng topic của mình
(không giả mạo telemetry, status, ack của thiết bị khác; không nhận được bản tin của thiết bị khác dù đăng ký `office/#`; không tự gửi `command`);
backend gửi được `command`/`config` nhưng không ghi được `telemetry`. Chạy được cả khi `mock_publisher.py` hoặc thiết bị thật đang hoạt động (test chỉ đếm bản tin mang mã riêng của nó, không bị lẫn bản tin retained của thiết bị). Thoát mã 0 nếu đạt hết, 1 nếu có lỗi,
dùng được làm bằng chứng cho 2 test bảo mật bắt buộc ở Contract mục 11.

## Đã kiểm tra và chưa kiểm tra

Môi trường dựng các file này **không có Docker, Mosquitto thật và `paho-mqtt`**, nên:

- Đã chạy thử: `entrypoint.sh` (tách user/mật khẩu, báo lỗi, chạy lại không cộng dồn) với `mosquitto_passwd` giả;
  cú pháp `docker-compose.yml`; `mock_publisher.py` (20 kiểm tra) và `test_acl.py` (19 kiểm tra) trên **broker giả trong bộ nhớ**
  đọc đúng `acl.conf` và danh sách user. Khi cố ý dùng ACL lỏng, `test_acl.py` báo FAIL 10 mục (test bắt được lỗi cấu hình).
- **Chưa chạy** với Mosquitto và Docker thật. Bạn cần chạy `docker compose up -d` rồi `python test_acl.py` để xác nhận. Nếu một test
  ACL báo FAIL trên broker thật, gửi nguyên văn kết quả để chỉnh `acl.conf`.
- Tag ảnh `eclipse-mosquitto:2.0.20`: nếu `docker compose pull` báo không tìm thấy, đổi sang `eclipse-mosquitto:2`.

## Cần cả nhóm thống nhất

1. **Cấp credential khi Admin đăng ký thiết bị trên dashboard:** hiện phải sửa `.env` thủ công (bước "Thêm thiết bị"). Muốn tự động thì cần
   plugin Mosquitto Dynamic Security hoặc backend ghi trực tiếp; cần M3 và M4 chọn hướng.
2. **ACK cấu hình:** Contract nói ACK cấu hình đi chung topic `ack` nhưng chưa nêu tên trường. Mock publisher đang gửi
   `{"configId":"CFG-0001","status":"SUCCESS"}`; cần M2 và M3 xác nhận.
3. **Bản tin `INVALID`:** mock chỉ gửi `deviceId`, `quality`, `rssi` (không có giá trị đo). Cần M1 và M3 xác nhận firmware làm giống vậy.
4. **TLS (cổng 8883):** chưa bật. Khối cấu hình mẫu nằm ở cuối `mosquitto/mosquitto.conf`; bật thì ESP32 cũng phải nạp chứng chỉ CA.
