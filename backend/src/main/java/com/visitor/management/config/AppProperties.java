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
    private Visitors visitors = new Visitors();

    @Valid
    private RateLimit rateLimit = new RateLimit();

    @Valid
    private SecurityHeaders securityHeaders = new SecurityHeaders();

    @Valid
    private Notifications notifications = new Notifications();

    @Valid
    private Mobile mobile = new Mobile();

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

    public Notifications getNotifications() {
        return notifications;
    }

    public void setNotifications(Notifications notifications) {
        this.notifications = notifications;
    }

    public Mobile getMobile() {
        return mobile;
    }

    public void setMobile(Mobile mobile) {
        this.mobile = mobile;
    }

    public static class Cors {
        private String publicUrl;
        private List<String> allowedOrigins = new ArrayList<>();

        public String getPublicUrl() {
            return publicUrl;
        }

        public void setPublicUrl(String publicUrl) {
            this.publicUrl = publicUrl;
        }

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
        private String cloudName;
        private String apiKey;
        private String apiSecret;
        private String folder;

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

    public static class Notifications {
        private boolean pushEnabled = true;
        private String expoPushUrl = "https://exp.host/--/api/v2/push/send";
        private String expoAccessToken;
        @Valid
        private Reminders reminders = new Reminders();
        @Valid
        private Firebase firebase = new Firebase();

        public boolean isPushEnabled() {
            return pushEnabled;
        }

        public void setPushEnabled(boolean pushEnabled) {
            this.pushEnabled = pushEnabled;
        }

        public String getExpoPushUrl() {
            return expoPushUrl;
        }

        public void setExpoPushUrl(String expoPushUrl) {
            this.expoPushUrl = expoPushUrl;
        }

        public String getExpoAccessToken() {
            return expoAccessToken;
        }

        public void setExpoAccessToken(String expoAccessToken) {
            this.expoAccessToken = expoAccessToken;
        }

        public Reminders getReminders() {
            return reminders;
        }

        public void setReminders(Reminders reminders) {
            this.reminders = reminders;
        }

        public Firebase getFirebase() {
            return firebase;
        }

        public void setFirebase(Firebase firebase) {
            this.firebase = firebase;
        }

        public static class Firebase {
            private boolean enabled;
            private String projectId;
            private String serviceAccountPath;
            private String serviceAccountJson;
            private String serviceAccountBase64;

            public boolean isEnabled() {
                return enabled;
            }

            public void setEnabled(boolean enabled) {
                this.enabled = enabled;
            }

            public String getProjectId() {
                return projectId;
            }

            public void setProjectId(String projectId) {
                this.projectId = projectId;
            }

            public String getServiceAccountPath() {
                return serviceAccountPath;
            }

            public void setServiceAccountPath(String serviceAccountPath) {
                this.serviceAccountPath = serviceAccountPath;
            }

            public String getServiceAccountJson() {
                return serviceAccountJson;
            }

            public void setServiceAccountJson(String serviceAccountJson) {
                this.serviceAccountJson = serviceAccountJson;
            }

            public String getServiceAccountBase64() {
                return serviceAccountBase64;
            }

            public void setServiceAccountBase64(String serviceAccountBase64) {
                this.serviceAccountBase64 = serviceAccountBase64;
            }
        }

        public static class Reminders {
            private boolean enabled = true;
            @Min(10000)
            private long sweepDelayMs = 60000;
            private List<Integer> beforeStartMinutes = List.of(30, 15, 0);
            @Min(0)
            private int checkInWindowMinutesBefore = 15;
            @Min(0)
            private int overdueGraceMinutes = 10;
            @Min(0)
            private int inviteRegistrationReminderMinutesBefore = 60;
            @Min(1)
            private int lookAheadMinutes = 90;
            @Min(1)
            private int maxDispatchPerSweep = 250;

            public boolean isEnabled() {
                return enabled;
            }

            public void setEnabled(boolean enabled) {
                this.enabled = enabled;
            }

            public long getSweepDelayMs() {
                return sweepDelayMs;
            }

            public void setSweepDelayMs(long sweepDelayMs) {
                this.sweepDelayMs = sweepDelayMs;
            }

            public List<Integer> getBeforeStartMinutes() {
                return beforeStartMinutes;
            }

            public void setBeforeStartMinutes(List<Integer> beforeStartMinutes) {
                this.beforeStartMinutes = beforeStartMinutes;
            }

            public int getCheckInWindowMinutesBefore() {
                return checkInWindowMinutesBefore;
            }

            public void setCheckInWindowMinutesBefore(int checkInWindowMinutesBefore) {
                this.checkInWindowMinutesBefore = checkInWindowMinutesBefore;
            }

            public int getOverdueGraceMinutes() {
                return overdueGraceMinutes;
            }

            public void setOverdueGraceMinutes(int overdueGraceMinutes) {
                this.overdueGraceMinutes = overdueGraceMinutes;
            }

            public int getInviteRegistrationReminderMinutesBefore() {
                return inviteRegistrationReminderMinutesBefore;
            }

            public void setInviteRegistrationReminderMinutesBefore(int inviteRegistrationReminderMinutesBefore) {
                this.inviteRegistrationReminderMinutesBefore = inviteRegistrationReminderMinutesBefore;
            }

            public int getLookAheadMinutes() {
                return lookAheadMinutes;
            }

            public void setLookAheadMinutes(int lookAheadMinutes) {
                this.lookAheadMinutes = lookAheadMinutes;
            }

            public int getMaxDispatchPerSweep() {
                return maxDispatchPerSweep;
            }

            public void setMaxDispatchPerSweep(int maxDispatchPerSweep) {
                this.maxDispatchPerSweep = maxDispatchPerSweep;
            }
        }
    }

    public static class Mobile {
        private String minimumAppVersion;
        private String minimumRuntimeVersion;
        private String recommendedAppVersion;
        private String releaseChannel = "production";
        private String rolloutCohort = "stable";
        private int rolloutPercent = 100;
        private boolean forcedUpdate;
        private boolean rollback;
        private int suspiciousConcurrentSessionThreshold = 4;

        public String getMinimumAppVersion() {
            return minimumAppVersion;
        }

        public void setMinimumAppVersion(String minimumAppVersion) {
            this.minimumAppVersion = minimumAppVersion;
        }

        public String getMinimumRuntimeVersion() {
            return minimumRuntimeVersion;
        }

        public void setMinimumRuntimeVersion(String minimumRuntimeVersion) {
            this.minimumRuntimeVersion = minimumRuntimeVersion;
        }

        public String getRecommendedAppVersion() {
            return recommendedAppVersion;
        }

        public void setRecommendedAppVersion(String recommendedAppVersion) {
            this.recommendedAppVersion = recommendedAppVersion;
        }

        public String getReleaseChannel() {
            return releaseChannel;
        }

        public void setReleaseChannel(String releaseChannel) {
            this.releaseChannel = releaseChannel;
        }

        public String getRolloutCohort() {
            return rolloutCohort;
        }

        public void setRolloutCohort(String rolloutCohort) {
            this.rolloutCohort = rolloutCohort;
        }

        public int getRolloutPercent() {
            return rolloutPercent;
        }

        public void setRolloutPercent(int rolloutPercent) {
            this.rolloutPercent = rolloutPercent;
        }

        public boolean isForcedUpdate() {
            return forcedUpdate;
        }

        public void setForcedUpdate(boolean forcedUpdate) {
            this.forcedUpdate = forcedUpdate;
        }

        public boolean isRollback() {
            return rollback;
        }

        public void setRollback(boolean rollback) {
            this.rollback = rollback;
        }

        public int getSuspiciousConcurrentSessionThreshold() {
            return suspiciousConcurrentSessionThreshold;
        }

        public void setSuspiciousConcurrentSessionThreshold(int suspiciousConcurrentSessionThreshold) {
            this.suspiciousConcurrentSessionThreshold = suspiciousConcurrentSessionThreshold;
        }
    }

}
