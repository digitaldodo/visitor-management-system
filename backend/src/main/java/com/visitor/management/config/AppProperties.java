package com.visitor.management.config;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;

import java.util.ArrayList;
import java.util.List;

@Validated
@ConfigurationProperties(prefix = "app")
public class AppProperties {

    @Valid
    private Cors cors = new Cors();

    @Valid
    private Jwt jwt = new Jwt();

    @Valid
    private Cloudinary cloudinary = new Cloudinary();

    @Valid
    private Seed seed = new Seed();

    public Cors getCors() {
        return cors;
    }

    public void setCors(Cors cors) {
        this.cors = cors;
    }

    public Jwt getJwt() {
        return jwt;
    }

    public void setJwt(Jwt jwt) {
        this.jwt = jwt;
    }

    public Cloudinary getCloudinary() {
        return cloudinary;
    }

    public void setCloudinary(Cloudinary cloudinary) {
        this.cloudinary = cloudinary;
    }

    public Seed getSeed() {
        return seed;
    }

    public void setSeed(Seed seed) {
        this.seed = seed;
    }

    public static class Cors {
        private List<String> allowedOrigins = new ArrayList<>();

        public List<String> getAllowedOrigins() {
            return allowedOrigins;
        }

        public void setAllowedOrigins(List<String> allowedOrigins) {
            this.allowedOrigins = allowedOrigins;
        }
    }

    public static class Jwt {
        @NotBlank
        @Size(min = 32)
        private String secret;

        @NotBlank
        private String issuer;

        @Min(5)
        private long expirationMinutes;

        @Min(1)
        private long refreshExpirationDays = 7;

        public String getSecret() {
            return secret;
        }

        public void setSecret(String secret) {
            this.secret = secret;
        }

        public String getIssuer() {
            return issuer;
        }

        public void setIssuer(String issuer) {
            this.issuer = issuer;
        }

        public long getExpirationMinutes() {
            return expirationMinutes;
        }

        public void setExpirationMinutes(long expirationMinutes) {
            this.expirationMinutes = expirationMinutes;
        }

        public long getRefreshExpirationDays() {
            return refreshExpirationDays;
        }

        public void setRefreshExpirationDays(long refreshExpirationDays) {
            this.refreshExpirationDays = refreshExpirationDays;
        }
    }

    public static class Cloudinary {
        private String url;
        private String cloudName;
        private String apiKey;
        private String apiSecret;
        private String folder;

        public String getUrl() {
            return url;
        }

        public void setUrl(String url) {
            this.url = url;
        }

        public String getCloudName() {
            return cloudName;
        }

        public void setCloudName(String cloudName) {
            this.cloudName = cloudName;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getApiSecret() {
            return apiSecret;
        }

        public void setApiSecret(String apiSecret) {
            this.apiSecret = apiSecret;
        }

        public String getFolder() {
            return folder;
        }

        public void setFolder(String folder) {
            this.folder = folder;
        }
    }

    public static class Seed {
        private boolean testAccounts;

        public boolean isTestAccounts() {
            return testAccounts;
        }

        public void setTestAccounts(boolean testAccounts) {
            this.testAccounts = testAccounts;
        }
    }
}
