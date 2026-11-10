# Hardware

Danh sách linh kiện, chân GPIO và lưu ý đấu dây.

## Linh kiện

| Node | Linh kiện | Giao tiếp |
| --- | --- | --- |
| A | ESP32 | Wi-Fi 2.4GHz |
| A | AHT20 | I2C, địa chỉ `0x38` |
| A | BH1750 | I2C, địa chỉ `0x23` (chung bus AHT20) |
| A | LD2410C | UART |
| A | MQ-135 | ADC |
| B | ESP32 | Wi-Fi 2.4GHz |
| B | Relay 5V 2 kênh | GPIO |
| B | Servo SG90 | PWM |
| B | Công tắc từ FR3S | GPIO input pull-up |
| B | Buzzer 5V | GPIO |
| B | INA219 #1 (đèn) | I2C `0x40` |
| B | INA219 #2 (quạt) | I2C `0x41` (hàn bridge A0) |

## Chân GPIO đã dùng

Theo `firmware/node-b/config.h`:

| Chức năng | GPIO | Ghi chú |
| --- | ---: | --- |
| Relay light1 | 18 | active theo `RELAY_ON` |
| Relay fan1 | 19 | active theo `RELAY_ON` |
| Công tắc từ door1 | 21 | `INPUT_PULLUP` |

Node A (theo contract):

| Chức năng | Chân |
| --- | --- |
| I2C SDA | GPIO 21 |
| I2C SCL | GPIO 22 |
| AHT20 | `0x38` |
| BH1750 | `0x23` |

> Servo, buzzer và I2C của Node B chưa chốt trong `config.h`. Cần chọn chân tránh trùng
> GPIO 21 (reed) và ghi lại vào `firmware/node-b/config.h` trước khi test phần cứng.

## Đấu dây / an toàn

- Chỉ dùng tải DC 12V; không đấu trực tiếp 220V.
- Nguồn 12V cho tải và 5V cho logic **tách riêng**, chung GND.
- Cầu chì trên đường 12V.
- Diode chống xung song song quạt.
- Tụ 1000µF cho servo.
- Relay mặc định OFF khi khởi động; servo ở vị trí đóng; buzzer OFF.
- INA219 #2 cần hàn bridge A0 để đổi địa chỉ `0x41`.

## Hình ảnh / sơ đồ

- Sơ đồ kiến trúc: [`../docs/Kien_truc_IoT_tong_the.png`](../docs/Kien_truc_IoT_tong_the.png)
- ERD: [`../database/ERD_phong_lam_viec_thong_minh.png`](../database/ERD_phong_lam_viec_thong_minh.png)
- Ảnh prototype/sơ đồ nối dây chi tiết: trong `docs/reports/Phân_tích_thiết_kế_IOT.docx`
  và `docs/reports/Báo_cáo_IoT_đã_sửa.docx`.

Khi có ảnh prototype thật, thêm vào `hardware/prototype/` và cập nhật README.
