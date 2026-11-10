#!/bin/sh
# Tạo file mật khẩu Mosquitto từ biến MQTT_USERS ("user:mat_khau,user2:mat_khau2") mỗi lần container khởi động.
# Nhờ vậy không có mật khẩu nào nằm trong repo; thêm/thu hồi thiết bị = sửa .env rồi tạo lại container.
set -eu

AUTH_DIR="${AUTH_DIR:-/mosquitto/auth}"
PASSWD="$AUTH_DIR/passwd"

if [ -z "${MQTT_USERS:-}" ]; then
  echo "Lỗi: thiếu biến MQTT_USERS (dạng user:mat_khau,user2:mat_khau2)" >&2
  exit 1
fi

mkdir -p "$AUTH_DIR"
rm -f "$PASSWD"

# Tách theo dấu phẩy, bỏ ký tự \r (file .env tạo trên Windows) và khoảng trắng ở hai đầu mỗi mục.
# Thông báo lỗi chỉ nêu số thứ tự và tên người dùng, không in mật khẩu ra log.
echo "$MQTT_USERS" | tr -d '\r' | tr ',' '\n' | {
  i=0
  first=1
  while IFS= read -r raw; do
    pair=$(printf '%s' "$raw" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
    [ -z "$pair" ] && continue
    i=$((i + 1))
    case "$pair" in
      *:*) ;;
      *) echo "Lỗi: mục số $i trong MQTT_USERS thiếu dấu ':' (cần dạng user:mat_khau). Có thể mật khẩu chứa dấu phẩy hoặc dấu cách." >&2; exit 1 ;;
    esac
    user="${pair%%:*}"
    pass="${pair#*:}"
    if [ -z "$user" ]; then
      echo "Lỗi: mục số $i trong MQTT_USERS có tên người dùng rỗng." >&2; exit 1
    fi
    if [ -z "$pass" ]; then
      echo "Lỗi: mục số $i (user=$user) có mật khẩu rỗng. Nếu mật khẩu có ký tự \$ thì Docker Compose đã coi nó là biến; hãy bỏ ký tự \$." >&2; exit 1
    fi
    case "$pair" in
      *[[:space:]]*) echo "Lỗi: mục số $i (user=$user) có khoảng trắng bên trong (ví dụ 'user: mat_khau'). Mật khẩu không được chứa dấu cách." >&2; exit 1 ;;
    esac
    if [ "$first" = 1 ]; then
      mosquitto_passwd -c -b "$PASSWD" "$user" "$pass"
      first=0
    else
      mosquitto_passwd -b "$PASSWD" "$user" "$pass"
    fi
  done
  if [ "$i" -eq 0 ]; then
    echo "Lỗi: MQTT_USERS không có mục nào hợp lệ." >&2; exit 1
  fi
}

chown mosquitto:mosquitto "$PASSWD" || echo "Cảnh báo: không chown được file mật khẩu" >&2
chmod 0700 "$PASSWD"

# acl.conf được mount chỉ đọc nên không chown/chmod trực tiếp được; sao chép sang thư mục riêng
# với đúng chủ sở hữu và quyền 0700 (Mosquitto sẽ từ chối nạp file ACL sai quyền ở các bản sau).
ACL_SRC="${ACL_SRC:-/mosquitto/config/acl.conf}"
ACL_DST="$AUTH_DIR/acl.conf"
cp "$ACL_SRC" "$ACL_DST"
chown mosquitto:mosquitto "$ACL_DST" || echo "Cảnh báo: không chown được file ACL" >&2
chmod 0700 "$ACL_DST"

echo "Đã nạp $(grep -c ':' "$PASSWD") tài khoản MQTT"
exec "$@"
