package com.visitor.management.service;

import com.cloudinary.Cloudinary;
import com.visitor.management.config.AppProperties;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.exception.BadRequestException;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class CloudinaryUploadService {

    private static final long MAX_IMAGE_BYTES = 3L * 1024L * 1024L;
    private static final Set<String> ALLOWED_MIME_TYPES = Set.of("image/jpeg", "image/png", "image/webp");

    private final Cloudinary cloudinary;
    private final AppProperties.Cloudinary properties;

    public CloudinaryUploadService(Cloudinary cloudinary, AppProperties properties) {
        this.cloudinary = cloudinary;
        this.properties = properties.getCloudinary();
    }

    public VisitorPhotoUploadResponse uploadVisitorPhoto(MultipartFile file) {
        return uploadImage(file, "visitor-photos", "visitor-");
    }

    public VisitorPhotoUploadResponse uploadEmployeePhoto(MultipartFile file) {
        return uploadImage(file, "employee-photos", "employee-");
    }

    private VisitorPhotoUploadResponse uploadImage(MultipartFile file, String folderSuffix, String publicIdPrefix) {
        validate(file);

        try {
            String folder = folder(folderSuffix);
            String publicId = publicIdPrefix + UUID.randomUUID();
            Map<?, ?> result = cloudinary.uploader().upload(file.getBytes(), Map.of(
                    "folder", folder,
                    "public_id", publicId,
                    "resource_type", "image",
                    "overwrite", false,
                    "quality", "auto:good",
                    "fetch_format", "auto",
                    "use_filename", false,
                    "unique_filename", true
            ));

            String secureUrl = stringValue(result.get("secure_url"));
            String uploadedPublicId = stringValue(result.get("public_id"));
            String format = stringValue(result.get("format"));
            Object bytesValue = result.get("bytes");
            long bytes = bytesValue instanceof Number number ? number.longValue() : file.getSize();

            if (secureUrl == null || uploadedPublicId == null) {
                throw new BadRequestException("Image upload failed. Please try again.");
            }

            return new VisitorPhotoUploadResponse(secureUrl, uploadedPublicId, bytes, format);
        } catch (IOException ex) {
            throw new BadRequestException("Image upload failed. Please try again.");
        } catch (RuntimeException ex) {
            if (ex instanceof BadRequestException) {
                throw ex;
            }
            throw new BadRequestException("Cloudinary upload is unavailable or not configured.");
        }
    }

    private void validate(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BadRequestException("Photo is required.");
        }

        if (file.getSize() > MAX_IMAGE_BYTES) {
            throw new BadRequestException("Photo must be 3 MB or smaller.");
        }

        String contentType = file.getContentType();
        if (contentType == null || !ALLOWED_MIME_TYPES.contains(contentType.toLowerCase())) {
            throw new BadRequestException("Photo must be a JPEG, PNG, or WebP image.");
        }

        try {
            byte[] bytes = file.getBytes();
            if (!hasValidImageSignature(bytes, contentType)) {
                throw new BadRequestException("Photo content does not match an allowed image format.");
            }
        } catch (IOException ex) {
            throw new BadRequestException("Photo could not be read.");
        }
    }

    private boolean hasValidImageSignature(byte[] bytes, String contentType) {
        if (bytes.length < 12) {
            return false;
        }
        String normalized = contentType.toLowerCase();
        if ("image/jpeg".equals(normalized)) {
            return (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8;
        }
        if ("image/png".equals(normalized)) {
            return (bytes[0] & 0xff) == 0x89
                    && bytes[1] == 0x50
                    && bytes[2] == 0x4e
                    && bytes[3] == 0x47;
        }
        if ("image/webp".equals(normalized)) {
            return bytes[0] == 0x52
                    && bytes[1] == 0x49
                    && bytes[2] == 0x46
                    && bytes[3] == 0x46
                    && bytes[8] == 0x57
                    && bytes[9] == 0x45
                    && bytes[10] == 0x42
                    && bytes[11] == 0x50;
        }
        return false;
    }

    private String folder(String suffix) {
        String root = properties.getFolder();
        if (root == null || root.isBlank()) {
            return suffix;
        }
        return root.replaceAll("/+$", "") + "/" + suffix;
    }

    private String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
