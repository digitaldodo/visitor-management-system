package com.visitor.management.dto;

import java.time.Instant;
import java.util.List;

public record ErrorResponse(
        boolean success,
        String message,
        String path,
        int status,
        List<FieldError> errors,
        Instant timestamp
) {
    public record FieldError(String field, String message) {
    }

    public static ErrorResponse of(String message, String path, int status) {
        return new ErrorResponse(false, message, path, status, List.of(), Instant.now());
    }

    public static ErrorResponse of(String message, String path, int status, List<FieldError> errors) {
        return new ErrorResponse(false, message, path, status, errors, Instant.now());
    }
}
