# Kịch bản kiểm thử – Phòng làm việc thông minh IoT

Tài liệu này là kế hoạch kiểm thử theo **đề bài mục 7** (kiểm thử chức năng và phi chức năng), đối chiếu với
**Contract v1.5** và các bảng 10.1, 10.2 của báo cáo. Mỗi ca có mã, bước thực hiện, kết quả mong đợi và script tự động
chạy ca đó. Kết quả thực tế của mỗi lần chạy được ghi tự động vào [`system/results/`](system/results/).

## 1. Môi trường kiểm thử

| Thành phần | Cấu hình |
| --- | --- |
| Thiết bị | Node A `office-env-01` (AHT20, BH1750, LD2410C, MQ-135), Node B `office-ctrl-01` (relay 1 kênh + quạt mini, LED, servo + công tắc từ, còi, INA219 ×2), firmware 1.0.0 |
| Mạng | Wi-Fi 2.4 GHz từ hotspot điện thoại; ESP32 kết nối tới IP Wi-Fi của laptop |
| Máy chủ | Laptop Windows, Docker Desktop: `deployment/docker-compose.yml` (Mosquitto 2.0.20, PostgreSQL 16, backend Spring Boot, frontend nginx) |
| Tài khoản | `admin`, `operator1`, `viewer1` (mật khẩu trong `deployment/.env`, không commit) |
| Công cụ | Python 3 + `paho-mqtt`, `requests`, `pyserial` ([`system/requirements.txt`](system/requirements.txt)) |

Các ca kiểm thử chạy trên **thiết bị thật**, không dùng mock. Mọi thay đổi tạm thời (ngưỡng rule, khóa thiết bị,
cấu hình, trạng thái đèn/quạt) được script trả lại như cũ khi kết thúc.

## 2. Kiểm thử chức năng (đề bài 7.1) – `system/test_functional.py`

| Mã | Quy trình (đề bài 7.1) | Bước thực hiện | Kết quả mong đợi | Loại |
| --- | --- | --- | --- | --- |
| CN-01 | Đăng nhập và phân quyền | Đăng nhập `operator1` với mật khẩu sai, rồi đúng | Sai → 401; đúng → JWT | Tự động |
| CN-02 | Đăng nhập và phân quyền | `viewer1` gửi lệnh bật đèn và sửa rule | 403, thiết bị không đổi trạng thái | Tự động, **bảo mật** |
| CN-16 | Đăng nhập và phân quyền | Gọi API không token, token rác, token bị sửa chữ ký | 401 cả ba trường hợp | Tự động, **bảo mật** |
| CN-17 | Vòng đời thiết bị | Admin tạo thiết bị thử → activate → maintenance → activate → decommission (khi đang dùng) → lock → activate (mở khóa) → lock → decommission → activate; Operator thử đăng ký | Đúng luồng thì chuyển được; decommission khi đang dùng và kích hoạt lại sau decommission bị 409 `INVALID_TRANSITION`; Operator bị 403 | Tự động |
| CN-03 | Thiết bị gửi telemetry | Chờ bản tin Node A trên broker, đối chiếu bản ghi qua API | Có `seq`, `quality`, đủ trường; backend lưu đúng thời điểm | Tự động |
| CN-04 | Thiết bị gửi telemetry | Như CN-03 với Node B (công suất) | Lưu PowerReading | Tự động |
| CN-03b | Dashboard cập nhật dữ liệu | Gọi API lịch sử 10 phút và báo cáo năng lượng | Có dữ liệu, HTTP 200 | Tự động |
| CN-05 | Gửi và xác nhận lệnh | Bật/tắt `light1`, `fan1`, `buzzer1` qua REST (như giao diện) | ACK SUCCESS, trạng thái actuator đổi; dòng điện INA219 tăng khi bật | Tự động |
| CN-06 | Gửi và xác nhận lệnh | OPEN rồi CLOSE `door1` | ACK theo công tắc từ, < 5 s | Tự động |
| CN-11 | Gửi và xác nhận lệnh (trùng lặp) | Gửi lệnh A (ON), lệnh B (OFF), gửi lại đúng lệnh A | Không thực thi lại A, trả lại đúng ACK cũ, đèn vẫn OFF | Tự động |
| CN-13 | Cấu hình thiết bị | Đổi chu kỳ gửi Node A 5 → 7 s, đo lại; gửi giá trị sai qua API và qua MQTT | ACK SUCCESS và chu kỳ đổi thật; API 400; thiết bị trả FAILED | Tự động |
| CN-09 | Phát hiện thiết bị offline | Giữ Node B ở trạng thái reset qua cổng USB | OFFLINE + alert DEVICE_OFFLINE ≤ 90 s | Tự động (cần `--serial-port`) |
| CN-10 | Phục hồi | Thả reset | ACTIVE lại, alert tự đóng | Tự động (cần `--serial-port`) |
| CN-07 | Sinh và xử lý cảnh báo | Hạ ngưỡng TEMP_HIGH dưới nhiệt độ thật, Operator xác nhận, trả ngưỡng | Alert OPEN → ACKNOWLEDGED → tự đóng | Tự động |
| CN-08 | Tự động hóa | Đặt `absenceMinutes = 1`, mode AUTO, bật đèn, rời khỏi radar | Backend tự gửi OFF (`issuedBy = automation`) | Bán tự động (`--absence`) |
| CN-14 | Khóa / ngừng sử dụng thiết bị | Khóa Node B, gửi lệnh, chờ 12 s; kích hoạt lại | Lệnh bị 409, telemetry bị bỏ qua; hoạt động lại sau activate | Tự động, **bảo mật** |
| CN-15 | Bảo mật broker | Node A ghi vào topic Node B, subscribe command của Node B; đăng nhập sai mật khẩu | Bị chặn / bị từ chối | Tự động, **bảo mật** |
| CN-12 | Trợ lý AI | Gọi `/api/ai/chat` | Tắt AI → 503; bật → 200 | Tự động |
| CN-18 | Cảm biến lỗi | Rút dây I2C của Node A | `quality = INVALID`, alert SENSOR_FAULT; cắm lại → tự đóng | Thủ công |
| CN-19 | Sai lệch INA219 (NFR-12) | Đo dòng quạt bằng đồng hồ vạn năng, so với `fan1CurrentMa` | Sai lệch ≤ 5 % | Thủ công |

Đề bài yêu cầu tối thiểu hai kiểm thử bảo mật: nhóm có **CN-02, CN-14, CN-15, CN-16**, tương ứng các ví dụ trong đề bài
(người dùng không có quyền, thiết bị bị khóa, broker từ chối sai topic, API từ chối token không hợp lệ).

## 3. Kiểm thử phi chức năng (đề bài 7.2) – `system/test_nonfunctional.py`

| Mã | Chỉ tiêu (đề bài 7.2) | Phương pháp đo | Mục tiêu |
| --- | --- | --- | --- |
| PCN-01 | Độ trễ cảm biến → dashboard (NFR-01) | Một client nghe broker và một client nghe SSE `/api/stream` (như trình duyệt) trên cùng máy; ghép từng bản tin MQTT với sự kiện SSE tương ứng trong 60 s | p95 < 2 s |
| PCN-02 | Độ trễ lệnh (NFR-02) | 20 lệnh bật/tắt đèn qua REST `wait=true`; đo khứ hồi HTTP và `latencyMs` thiết bị trả về; thêm OPEN/CLOSE cửa | p95 < 1 s; cửa < 5 s |
| PCN-03 | Tỷ lệ mất bản tin (NFR-03), độ ổn định (NFR-06) | Đếm khoảng trống của trường `seq` trong telemetry hai node trong N phút; `seq` quay về 1 nghĩa là thiết bị khởi động lại | < 1 %, không khởi động lại |
| PCN-04 | Khả năng hoạt động sau mất mạng (NFR-04) | Khởi động lại container Mosquitto, đo thời gian đến khi mỗi node gửi lại dữ liệu | < 30 s |
| PCN-05 | Số lượng client/bản tin xử lý được | 20 client SSE + 300 request API / 30 luồng song song | Không lỗi, SSE vẫn nhận dữ liệu |
| PCN-06 | Mức dùng CPU, bộ nhớ | `docker stats` các container; RAM tĩnh của firmware theo trình biên dịch | Ghi nhận |
| CN-11 | Xử lý bản tin trùng lặp (NFR-05) | Xem kiểm thử chức năng CN-11 | Không thực thi lại |

Chạy ổn định 24 giờ (NFR-06): `python test_nonfunctional.py --only loss --minutes 1440`.

## 4. Kiểm thử tự động sẵn có

| Phần | Lệnh | Nội dung |
| --- | --- | --- |
| Backend | `cd backend && mvn verify` | API, xác thực/RBAC, SSE, rule, năng lượng, quality |
| Frontend | `cd frontend && npm test` | Hàm định dạng, mock server, realtime |
| Broker ACL | `python tests/mqtt/test_acl.py` | Credential riêng, ACL theo deviceId |
| Firmware | `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/node-a` (và node-b) | Biên dịch được với core ESP32 3.x |

## 5. Kết quả

Kết quả mỗi lần chạy nằm trong [`system/results/`](system/results/) (file `.md` để đọc, `.json` chứa số đo chi tiết).
Bảng 10.1 và 10.2 của báo cáo lấy số liệu từ các file này.

### Kết quả mới nhất (11/11/2026, firmware 1.0.0, hotspot điện thoại)

Mỗi ca lấy lần chạy gần nhất; các lần chạy cũ đã được thay thế bởi lần chạy lại nên không giữ file.

**Chức năng: 16/17 ca đạt.**

| Mã | Kết quả | File |
| --- | --- | --- |
| CN-01 | **PASS**: sai mật khẩu → 401, đúng → JWT | `functional_2026-11-11_0520` |
| CN-02 | **PASS**: Viewer gửi lệnh / sửa rule → 403, đèn không đổi | `functional_2026-11-11_0520` |
| CN-03 | **PASS**: telemetry Node A quality VALID, lưu DB, API đọc được | `functional_2026-11-11_0520` |
| CN-03b | **PASS**: API lịch sử và báo cáo năng lượng trả 200 | `functional_2026-11-11_0520` |
| CN-04 | **PASS**: telemetry Node B (INA219) lưu DB | `functional_2026-11-11_0520` |
| CN-05 | **PASS**: bật/tắt đèn, quạt, còi đều SUCCESS, thiết bị xử lý 2 ms; INA219 đo LED ≈30 mA, quạt ≈604 mA khi bật | `functional_2026-11-11_0556` |
| CN-06 | **FAIL**: OPEN SUCCESS (52 ms), CLOSE FAILED (2501 ms) vì công tắc từ chưa báo đóng. Lỗi lắp nam châm, firmware báo đúng trạng thái đọc được | `functional_2026-11-11_0556` |
| CN-07 | **PASS**: TEMP_HIGH sinh sau 6 s, Operator xác nhận được, trả ngưỡng → tự đóng sau 4 s | `functional_2026-11-11_0520` |
| CN-08 | **PASS**: radar báo vắng, backend tự gửi `light1 OFF` (`issuedBy = automation`) sau 76 s với ngưỡng vắng tạm 1 phút, chế độ AUTO. Phần MANUAL chưa kiểm thử riêng | `functional_absence_2026-11-11_064040` |
| CN-09 | **PASS**: OFFLINE sau 28 s, có alert DEVICE_OFFLINE (giữ Node B ở trạng thái reset) | `functional_2026-11-11_0520` |
| CN-10 | **PASS**: ACTIVE lại sau 6 s, alert tự đóng | `functional_2026-11-11_0520` |
| CN-11 | **PASS**: gửi lại commandId cũ → nhận đúng ACK cũ, không thực thi lại | `functional_2026-11-11_0520` |
| CN-12 | **PASS**: AI tắt → 503 AI_UNAVAILABLE | `functional_2026-11-11_0520` |
| CN-13 | **PASS**: config 7 s có hiệu lực (đo 7,0 / 7,2 / 7,0 s), API từ chối 99999 (400), thiết bị trả FAILED cho góc servo 999 | `functional_2026-11-11_0556` |
| CN-14 | **PASS**: thiết bị LOCKED → lệnh 409, telemetry bị bỏ qua; kích hoạt lại hoạt động bình thường | `functional_2026-11-11_0520` |
| CN-15 | **PASS**: broker chặn ghi chéo topic, từ chối sai mật khẩu | `functional_2026-11-11_0520` |
| CN-16 | **PASS**: không token / token rác / sửa chữ ký → 401 | `functional_2026-11-11_0520` |
| CN-17 | **PASS**: REGISTERED → ACTIVE → MAINTENANCE → ACTIVE; decommission khi đang dùng → 409; LOCKED → mở khóa → ACTIVE; LOCKED → DECOMMISSIONED; kích hoạt lại → 409 `INVALID_TRANSITION`; Operator không đăng ký được | `functional_lifecycle_2026-11-11_102233` |

**Phi chức năng: 5/6 ca đạt.**

| Mã | Kết quả | File |
| --- | --- | --- |
| PCN-01 | **PASS**: broker → backend → SSE trung bình 3 ms, p95 6 ms (24 bản tin). Chưa gồm thời gian ESP32 đọc cảm biến và truyền Wi-Fi | `nonfunctional_latency_2026-11-11_072949` |
| PCN-02 | **PASS**: 20/20 lệnh thành công, khứ hồi trung vị 163 ms, p95 185 ms; thiết bị xử lý 2 ms. Cửa OPEN 185 ms | `nonfunctional_command_2026-11-11_060503` |
| PCN-03 | **PASS**: mất 0,00 % trong 5 phút (Node A 60/60, Node B 59/59) | `nonfunctional_loss_2026-11-11_060516` |
| PCN-04 | **FAIL**: hai thiết bị gửi lại sau 0,5–0,6 s, nhưng backend nhận lại dữ liệu sau **112 s** (mục tiêu < 30 s). Phục hồi khi chính thiết bị mất kết nối (CN-10) đạt 6 s | `nonfunctional_reconnect_2026-11-11_061025` |
| PCN-05 | **PASS**: 300 request, 469 req/s, p95 81 ms, 0 lỗi; 20 client SSE đều nhận dữ liệu | `nonfunctional_load_2026-11-11_061017` |
| PCN-06 | **PASS** (ghi nhận): backend 434 MiB RAM, CPU 2,6 %; PostgreSQL 44 MiB; Mosquitto 4 MiB; firmware dùng 15–17 % RAM tĩnh | `nonfunctional_resources_2026-11-11_073051` |

**Chưa kiểm thử:** sai lệch INA219 so với đồng hồ vạn năng (CN-19, NFR-12), chạy liên tục 24 giờ (NFR-06), mô phỏng ≥ 10 node (NFR-07).

### Lỗi tìm ra trong quá trình kiểm thử

- **Firmware mất kết nối MQTT liên tục (lỗi `-9` của thư viện MQTT 256dpi).** Lần đo đầu, thiết bị kết nối lại hàng chục lần,
  mất 29,7 % bản tin và 10/20 lệnh lỗi. Nguyên nhân: firmware chỉ chờ broker xác nhận (CONNACK/PUBACK) 1,5 s, trong khi hotspot
  điện thoại có lúc trễ gần 1 s và mất gói. Đã tăng `MQTT_TIMEOUT_MS` lên 5 s; sau khi sửa, hai node gửi đủ telemetry, không
  kết nối lại. PCN-02 và PCN-03 ở bảng trên đo trước khi tăng thời gian chờ (lúc mạng ổn định), nên cần chạy lại để xác nhận.
- **Node A tự reset do sụt nguồn** (`Brownout detector was triggered`) khi Wi-Fi phát công suất tối đa, làm CN-08 lần đầu thất bại
  (bản tin luôn SUSPECT vì MQ-135 phải làm nóng lại sau mỗi lần reset). Cần nguồn USB đủ dòng cho Node A.
- **Backend phục hồi chậm sau khi broker khởi động lại (PCN-04):** client Paho của backend kết nối lại với thời gian chờ tăng dần,
  lệnh subscribe trong `connectComplete` bị hết thời gian chờ; dashboard không cập nhật trong khoảng đó. Thuộc phần backend (M3).
- **Đóng cửa báo FAILED (CN-06):** nam châm chưa áp sát công tắc từ khi servo ở vị trí đóng. Lỗi lắp ráp.
