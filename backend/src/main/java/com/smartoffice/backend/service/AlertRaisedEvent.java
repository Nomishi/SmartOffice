package com.smartoffice.backend.service;

import com.smartoffice.backend.domain.Alert;

/** Phát ra sau khi một alert mới được tạo, dùng cho các trigger phụ như còi. */
public record AlertRaisedEvent(Alert alert) {
}
