package com.visitor.management.dto;

public record VisitorPhotoUploadResponse(
        String url,
        String publicId,
        long bytes,
        String format
) {
}
