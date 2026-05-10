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
    private SendGrid sendgrid = new SendGrid();

    @Valid
    private Seed seed = new Seed();

    @Valid
    private Visitors visitors = new Visitors();

    @Valid
    private RateLimit rateLimit = new RateLimit();

    @Valid
    private SecurityHeaders securityHeaders = new SecurityHeaders();

    @Valid
    private Backup backup = new Backup();

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

    public SendGrid getSendgrid() {
        return sendgrid;
    }

    public void setSendgrid(SendGrid sendgrid) {
        this.sendgrid = sendgrid;
    }

    public Seed getSeed() {
        return seed;
    }

    public void setSeed(Seed seed) {
        this.seed = seed;
    }

    public Visitors getVisitors() {
        return visitors;
    }

    public void setVisitors(Visitors visitors) {
        this.visitors = visitors;
    }

    public RateLimit getRateLimit() {
        return rateLimit;
    }

    public void setRateLimit(RateLimit rateLimit) {
        this.rateLimit = rateLimit;
    }

    public SecurityHeaders getSecurityHeaders() {
        return securityHeaders;
    }

    public void setSecurityHeaders(SecurityHeaders securityHeaders) {
        this.securityHeaders = securityHeaders;
    }

    public Backup getBackup() {
        return backup;
    }

    public void setBackup(Backup backup) {
        this.backup = backup;
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

    public static class SendGrid {
        private String apiKey;
        private String fromEmail;
        private String fromName = "AccessFlow Security";
        private String apiBaseUrl = "https://api.sendgrid.com";
        private boolean enabled = true;

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getFromEmail() {
            return fromEmail;
        }

        public void setFromEmail(String fromEmail) {
            this.fromEmail = fromEmail;
        }

        public String getFromName() {
            return fromName;
        }

        public void setFromName(String fromName) {
            this.fromName = fromName;
        }

        public String getApiBaseUrl() {
            return apiBaseUrl;
        }

        public void setApiBaseUrl(String apiBaseUrl) {
            this.apiBaseUrl = apiBaseUrl;
        }

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
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

    public static class Visitors {
        @Min(1)
        private int maxActivePerEmployee = 10;

        @Min(5)
        private long pendingApprovalTtlMinutes = 240;

        @Min(10000)
        private long expirySweepDelayMs = 60000;

        public int getMaxActivePerEmployee() {
            return maxActivePerEmployee;
        }

        public void setMaxActivePerEmployee(int maxActivePerEmployee) {
            this.maxActivePerEmployee = maxActivePerEmployee;
        }

        public long getPendingApprovalTtlMinutes() {
            return pendingApprovalTtlMinutes;
        }

        public void setPendingApprovalTtlMinutes(long pendingApprovalTtlMinutes) {
            this.pendingApprovalTtlMinutes = pendingApprovalTtlMinutes;
        }

        public long getExpirySweepDelayMs() {
            return expirySweepDelayMs;
        }

        public void setExpirySweepDelayMs(long expirySweepDelayMs) {
            this.expirySweepDelayMs = expirySweepDelayMs;
        }
    }

    public static class RateLimit {
        private boolean enabled = true;

        @Min(1)
        private int requestsPerMinute = 180;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }

        public int getRequestsPerMinute() {
            return requestsPerMinute;
        }

        public void setRequestsPerMinute(int requestsPerMinute) {
            this.requestsPerMinute = requestsPerMinute;
        }
    }

    public static class SecurityHeaders {
        private String contentSecurityPolicy = "default-src 'self'; img-src 'self' data: https: blob:; media-src 'self' blob:; connect-src 'self' https:; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";

        public String getContentSecurityPolicy() {
            return contentSecurityPolicy;
        }

        public void setContentSecurityPolicy(String contentSecurityPolicy) {
            this.contentSecurityPolicy = contentSecurityPolicy;
        }
    }

    public static class Backup {
        private String strategy = "mongodb-atlas-scheduled-snapshots";
        private String retention = "managed-by-provider";

        public String getStrategy() {
            return strategy;
        }

        public void setStrategy(String strategy) {
            this.strategy = strategy;
        }

        public String getRetention() {
            return retention;
        }

        public void setRetention(String retention) {
            this.retention = retention;
        }
    }
}
