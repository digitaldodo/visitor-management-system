package com.visitor.management.config;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@Profile("prod")
public class ProductionEnvironmentValidator implements ApplicationRunner {

    private static final String LOCAL_MONGO_URI = "mongodb://localhost:27017/visitor_management";
    private static final String LOCAL_JWT_SECRET = "local-development-secret-key-change-me-32";

    private final AppProperties properties;
    private final Environment environment;

    public ProductionEnvironmentValidator(AppProperties properties, Environment environment) {
        this.properties = properties;
        this.environment = environment;
    }

    @Override
    public void run(ApplicationArguments args) {
        List<String> missing = new ArrayList<>();

        require("MONGODB_URI", missing);
        require("JWT_SECRET", missing);
        require("CORS_ALLOWED_ORIGINS", missing);

        String mongoUri = environment.getProperty("spring.data.mongodb.uri");
        if (LOCAL_MONGO_URI.equals(mongoUri)
                || mongoUri == null
                || !mongoUri.startsWith("mongodb+srv://")
                || hasPlaceholder(mongoUri)) {
            missing.add("MONGODB_URI must point to MongoDB Atlas in production");
        }
        if (LOCAL_JWT_SECRET.equals(properties.getJwt().getSecret()) || hasPlaceholder(properties.getJwt().getSecret())) {
            missing.add("JWT_SECRET must not use a local default or placeholder value");
        }
        if (properties.getCors().getAllowedOrigins().stream().anyMatch(this::isLocalOrigin)) {
            missing.add("CORS_ALLOWED_ORIGINS must contain deployed frontend origins only");
        }
        if (properties.getCors().getAllowedOrigins().stream().anyMatch(this::isWildcardOrigin)) {
            missing.add("CORS_ALLOWED_ORIGINS must not use wildcards in production");
        }

        AppProperties.Cloudinary cloudinary = properties.getCloudinary();
        boolean hasCloudinaryUrl = hasText(cloudinary.getUrl()) && !hasPlaceholder(cloudinary.getUrl());
        boolean hasCloudinaryParts = hasText(cloudinary.getCloudName())
                && hasText(cloudinary.getApiKey())
                && hasText(cloudinary.getApiSecret())
                && !hasPlaceholder(cloudinary.getCloudName())
                && !hasPlaceholder(cloudinary.getApiKey())
                && !hasPlaceholder(cloudinary.getApiSecret());
        if (!hasCloudinaryUrl && !hasCloudinaryParts) {
            missing.add("CLOUDINARY_URL or CLOUDINARY_CLOUD_NAME/CLOUDINARY_API_KEY/CLOUDINARY_API_SECRET with real Cloudinary values");
        }

        AppProperties.SendGrid sendgrid = properties.getSendgrid();
        if (sendgrid.isEnabled()) {
            if (!hasText(sendgrid.getApiKey()) || hasPlaceholder(sendgrid.getApiKey())) {
                missing.add("SENDGRID_API_KEY with a real SendGrid key");
            }
            if (!hasText(sendgrid.getFromEmail()) || hasPlaceholder(sendgrid.getFromEmail())) {
                missing.add("SENDGRID_FROM_EMAIL with a verified sender");
            }
        }

        if (!missing.isEmpty()) {
            throw new IllegalStateException("Production environment is incomplete: " + String.join(", ", missing));
        }
    }

    private void require(String name, List<String> missing) {
        if (!hasText(environment.getProperty(name))) {
            missing.add(name);
        }
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private boolean isLocalOrigin(String origin) {
        return origin != null && (origin.contains("localhost") || origin.contains("127.0.0.1"));
    }

    private boolean isWildcardOrigin(String origin) {
        return origin != null && origin.trim().equals("*");
    }

    private boolean hasPlaceholder(String value) {
        if (value == null) {
            return false;
        }
        String normalized = value.toLowerCase();
        return normalized.contains("replace-with")
                || normalized.contains("example.com")
                || normalized.contains("cluster.example")
                || normalized.contains("user:password")
                || normalized.contains("api_key")
                || normalized.contains("api_secret")
                || normalized.contains("cloud_name")
                || normalized.contains("cloudname");
    }
}
