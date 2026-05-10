package com.visitor.management.config;

import com.cloudinary.Cloudinary;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class CloudinaryConfig {

    @Bean
    public Cloudinary cloudinary(AppProperties properties) {
        AppProperties.Cloudinary cloudinary = properties.getCloudinary();

        if (hasText(cloudinary.getUrl())) {
            return new Cloudinary(cloudinary.getUrl());
        }

        if (hasText(cloudinary.getCloudName()) && hasText(cloudinary.getApiKey()) && hasText(cloudinary.getApiSecret())) {
            Map<String, Object> config = new HashMap<>();
            config.put("cloud_name", cloudinary.getCloudName());
            config.put("api_key", cloudinary.getApiKey());
            config.put("api_secret", cloudinary.getApiSecret());
            return new Cloudinary(config);
        }

        return new Cloudinary();
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
