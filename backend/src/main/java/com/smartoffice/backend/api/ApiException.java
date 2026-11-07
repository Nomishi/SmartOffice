package com.smartoffice.backend.api;

import org.springframework.http.HttpStatus;

/** Lỗi nghiệp vụ trả về theo format {"error":{"code",...}} của contract mục 8.3. */
public class ApiException extends RuntimeException {

    private final HttpStatus httpStatus;
    private final String code;
    private final Object details;

    public ApiException(HttpStatus httpStatus, String code, String message) {
        this(httpStatus, code, message, null);
    }

    public ApiException(HttpStatus httpStatus, String code, String message, Object details) {
        super(message);
        this.httpStatus = httpStatus;
        this.code = code;
        this.details = details;
    }

    public HttpStatus getHttpStatus() {
        return httpStatus;
    }

    public String getCode() {
        return code;
    }

    public Object getDetails() {
        return details;
    }
}
