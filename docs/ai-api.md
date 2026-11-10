# AI API — hướng dẫn tích hợp

AI là tính năng **tùy chọn, ngoài MVP**, bật bằng `AI_ENABLED=true`.
Frontend **không gọi trực tiếp** nhà cung cấp AI; chỉ gọi backend. API key nằm server-side.

## 1. Kiến trúc

```text
Frontend → POST /api/ai/chat (JWT)
              ↓
          Backend M3
          ├── đọc DB: device, telemetry mới nhất, alert, rule
          ├── tạo context ngắn
          └── gọi AI provider bằng AI_API_KEY
              ↓
          trả { answer, model, generatedAt }
```

## 2. Bật AI

Root `.env` / `deployment/.env`:

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o-mini
AI_TIMEOUT_MS=20000
```

Hỗ trợ mọi API tương thích **OpenAI Chat Completions**:

| Provider | `AI_BASE_URL` | `AI_MODEL` ví dụ |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| Groq | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| Ollama local | `http://host.docker.internal:11434/v1` | `llama3.1` |
| LM Studio | `http://host.docker.internal:1234/v1` | model đang load |

Với Ollama/LM Studio, `AI_API_KEY` có thể đặt giá trị bất kỳ (ví dụ `local`).

Restart backend:

```powershell
cd deployment
docker compose up -d backend
```

## 3. Endpoint

```http
POST /api/ai/chat
Authorization: Bearer <JWT>
Content-Type: application/json

{
  "message": "Nhiệt độ hôm nay có bất thường không?",
  "deviceId": "office-env-01"
}
```

`deviceId` optional:

- Có `deviceId`: context chỉ thiết bị đó.
- Không có: context 10 thiết bị + alert đang mở + rule.

Response:

```json
{
  "answer": "Nhiệt độ hiện tại 28.5°C, chưa vượt ngưỡng 30°C. Không có alert TEMP_HIGH đang mở.",
  "model": "gpt-4o-mini",
  "generatedAt": "2026-11-10T08:00:00Z"
}
```

## 4. Dữ liệu gửi cho AI

Backend chỉ gửi context ngắn:

- Thời gian hiện tại
- Thiết bị: id, type, status, mode, online, actuator, lastSeen
- Telemetry mới nhất: temperature, humidity, lux, presence, quality, airRaw
- Power mới nhất: busVoltage, light1/fan1 power, quality
- Alert đang mở (tối đa 10)
- Rule/ngưỡng hiện tại

Không gửi raw telemetry 5 giây/lần, không gửi toàn bộ lịch sử.

## 5. Bảo mật

- API key chỉ trong env backend, không trả ra frontend.
- Endpoint yêu cầu JWT.
- Không cho AI tự gửi lệnh điều khiển; AI chỉ tư vấn/giải thích.
- Không lưu hội thoại AI vào DB (có thể thêm sau).
- Cần cân nhắc chi phí/rate limit của provider.

## 6. Mã lỗi

| HTTP | code | Khi nào |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | `message` rỗng/quá 2000 ký tự |
| 401 | `UNAUTHORIZED` | Thiếu/sai JWT |
| 404 | `NOT_FOUND` | `deviceId` không tồn tại |
| 502 | `AI_UPSTREAM_ERROR` | Provider lỗi/timeout/không trả nội dung |
| 503 | `AI_UNAVAILABLE` | `AI_ENABLED=false` hoặc thiếu `AI_API_KEY` |

## 7. Test bằng curl

```powershell
$login = Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/auth/login `
  -ContentType "application/json" `
  -Body '{"username":"operator1","password":"operatorPassword123!"}'

Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/ai/chat `
  -Headers @{ Authorization = "Bearer $($login.token)" } `
  -ContentType "application/json" `
  -Body '{"message":"Tóm tắt tình trạng phòng hiện tại","deviceId":"office-env-01"}'
```

## 8. Frontend

Gọi qua `/api/ai/chat` như các API khác (nginx proxy hoặc Vite proxy).
Hiển thị:

- answer dạng markdown/text
- model + thời gian
- lỗi 503 khi AI chưa bật

Không đưa `AI_API_KEY` vào biến `VITE_*`.

## 9. Test tự động

- `ApiSmokeTest`: AI tắt → 503 `AI_UNAVAILABLE`.
- `AiIntegrationTest`: mock `AiClient`, xác nhận build context + trả answer/model.
