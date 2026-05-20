package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.index.CompoundIndex;
import org.springframework.data.mongodb.core.index.CompoundIndexes;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;

@Document(collection = "mobile_device_registrations")
@CompoundIndexes({
        @CompoundIndex(name = "mobile_device_user_device_idx", def = "{'userId': 1, 'deviceId': 1}")
})
public class MobileDeviceRegistration {

    @Id
    private String id;

    @Indexed
    private String userId;

    @Indexed
    private String organizationId;

    private String organizationName;

    private String registeredByUserId;

    private String registeredByName;

    @Indexed(unique = true, sparse = true)
    private String expoPushToken;

    @Indexed(unique = true, sparse = true)
    private String fcmToken;

    private String pushProvider;

    @Indexed
    private String deviceId;

    private String installationId;

    private String deviceName;

    private String platform;

    private String platformVersion;

    private String deviceType;

    private String deviceFingerprint;

    private String appVersion;

    private String runtimeVersion;

    private String projectId;

    private String permissionStatus;

    private boolean active;

    private boolean trusted;

    private boolean biometricEnabled;

    private String trustStatus;

    private String deviceCategory;

    private String operationalRole;

    private String checkpointId;

    private String checkpointName;

    private String operationalZone;

    private boolean sharedOperationalDevice;

    private boolean scannerFirst;

    private boolean restrictedNavigation;

    private boolean autoRestoreScanner;

    private Integer inactivityTimeoutSeconds;

    private boolean rootedOrJailbroken;

    private boolean emulator;

    private boolean debugBuild;

    private boolean suspicious;

    private String integrityReasons;

    private String lastDeliveryError;

    private Instant lastSeenAt;

    private Instant lastActiveAt;

    private Instant trustEstablishedAt;

    private Instant trustRevokedAt;

    private String revokedReason;

    private Instant disabledAt;

    private String disabledReason;

    private Instant policyUpdatedAt;

    private Instant lastDeliveredAt;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getUserId() {
        return userId;
    }

    public void setUserId(String userId) {
        this.userId = userId;
    }

    public String getOrganizationId() {
        return organizationId;
    }

    public void setOrganizationId(String organizationId) {
        this.organizationId = organizationId;
    }

    public String getOrganizationName() {
        return organizationName;
    }

    public void setOrganizationName(String organizationName) {
        this.organizationName = organizationName;
    }

    public String getRegisteredByUserId() {
        return registeredByUserId;
    }

    public void setRegisteredByUserId(String registeredByUserId) {
        this.registeredByUserId = registeredByUserId;
    }

    public String getRegisteredByName() {
        return registeredByName;
    }

    public void setRegisteredByName(String registeredByName) {
        this.registeredByName = registeredByName;
    }

    public String getExpoPushToken() {
        return expoPushToken;
    }

    public void setExpoPushToken(String expoPushToken) {
        this.expoPushToken = expoPushToken;
    }

    public String getFcmToken() {
        return fcmToken;
    }

    public void setFcmToken(String fcmToken) {
        this.fcmToken = fcmToken;
    }

    public String getPushProvider() {
        return pushProvider;
    }

    public void setPushProvider(String pushProvider) {
        this.pushProvider = pushProvider;
    }

    public String getDeviceId() {
        return deviceId;
    }

    public void setDeviceId(String deviceId) {
        this.deviceId = deviceId;
    }

    public String getInstallationId() {
        return installationId;
    }

    public void setInstallationId(String installationId) {
        this.installationId = installationId;
    }

    public String getDeviceName() {
        return deviceName;
    }

    public void setDeviceName(String deviceName) {
        this.deviceName = deviceName;
    }

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }

    public String getPlatformVersion() {
        return platformVersion;
    }

    public void setPlatformVersion(String platformVersion) {
        this.platformVersion = platformVersion;
    }

    public String getDeviceType() {
        return deviceType;
    }

    public void setDeviceType(String deviceType) {
        this.deviceType = deviceType;
    }

    public String getDeviceFingerprint() {
        return deviceFingerprint;
    }

    public void setDeviceFingerprint(String deviceFingerprint) {
        this.deviceFingerprint = deviceFingerprint;
    }

    public String getAppVersion() {
        return appVersion;
    }

    public void setAppVersion(String appVersion) {
        this.appVersion = appVersion;
    }

    public String getRuntimeVersion() {
        return runtimeVersion;
    }

    public void setRuntimeVersion(String runtimeVersion) {
        this.runtimeVersion = runtimeVersion;
    }

    public String getProjectId() {
        return projectId;
    }

    public void setProjectId(String projectId) {
        this.projectId = projectId;
    }

    public String getPermissionStatus() {
        return permissionStatus;
    }

    public void setPermissionStatus(String permissionStatus) {
        this.permissionStatus = permissionStatus;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public boolean isTrusted() {
        return trusted;
    }

    public void setTrusted(boolean trusted) {
        this.trusted = trusted;
    }

    public boolean isBiometricEnabled() {
        return biometricEnabled;
    }

    public void setBiometricEnabled(boolean biometricEnabled) {
        this.biometricEnabled = biometricEnabled;
    }

    public String getTrustStatus() {
        return trustStatus;
    }

    public void setTrustStatus(String trustStatus) {
        this.trustStatus = trustStatus;
    }

    public String getDeviceCategory() {
        return deviceCategory;
    }

    public void setDeviceCategory(String deviceCategory) {
        this.deviceCategory = deviceCategory;
    }

    public String getOperationalRole() {
        return operationalRole;
    }

    public void setOperationalRole(String operationalRole) {
        this.operationalRole = operationalRole;
    }

    public String getCheckpointId() {
        return checkpointId;
    }

    public void setCheckpointId(String checkpointId) {
        this.checkpointId = checkpointId;
    }

    public String getCheckpointName() {
        return checkpointName;
    }

    public void setCheckpointName(String checkpointName) {
        this.checkpointName = checkpointName;
    }

    public String getOperationalZone() {
        return operationalZone;
    }

    public void setOperationalZone(String operationalZone) {
        this.operationalZone = operationalZone;
    }

    public boolean isSharedOperationalDevice() {
        return sharedOperationalDevice;
    }

    public void setSharedOperationalDevice(boolean sharedOperationalDevice) {
        this.sharedOperationalDevice = sharedOperationalDevice;
    }

    public boolean isScannerFirst() {
        return scannerFirst;
    }

    public void setScannerFirst(boolean scannerFirst) {
        this.scannerFirst = scannerFirst;
    }

    public boolean isRestrictedNavigation() {
        return restrictedNavigation;
    }

    public void setRestrictedNavigation(boolean restrictedNavigation) {
        this.restrictedNavigation = restrictedNavigation;
    }

    public boolean isAutoRestoreScanner() {
        return autoRestoreScanner;
    }

    public void setAutoRestoreScanner(boolean autoRestoreScanner) {
        this.autoRestoreScanner = autoRestoreScanner;
    }

    public Integer getInactivityTimeoutSeconds() {
        return inactivityTimeoutSeconds;
    }

    public void setInactivityTimeoutSeconds(Integer inactivityTimeoutSeconds) {
        this.inactivityTimeoutSeconds = inactivityTimeoutSeconds;
    }

    public boolean isRootedOrJailbroken() {
        return rootedOrJailbroken;
    }

    public void setRootedOrJailbroken(boolean rootedOrJailbroken) {
        this.rootedOrJailbroken = rootedOrJailbroken;
    }

    public boolean isEmulator() {
        return emulator;
    }

    public void setEmulator(boolean emulator) {
        this.emulator = emulator;
    }

    public boolean isDebugBuild() {
        return debugBuild;
    }

    public void setDebugBuild(boolean debugBuild) {
        this.debugBuild = debugBuild;
    }

    public boolean isSuspicious() {
        return suspicious;
    }

    public void setSuspicious(boolean suspicious) {
        this.suspicious = suspicious;
    }

    public String getIntegrityReasons() {
        return integrityReasons;
    }

    public void setIntegrityReasons(String integrityReasons) {
        this.integrityReasons = integrityReasons;
    }

    public String getLastDeliveryError() {
        return lastDeliveryError;
    }

    public void setLastDeliveryError(String lastDeliveryError) {
        this.lastDeliveryError = lastDeliveryError;
    }

    public Instant getLastSeenAt() {
        return lastSeenAt;
    }

    public void setLastSeenAt(Instant lastSeenAt) {
        this.lastSeenAt = lastSeenAt;
    }

    public Instant getLastActiveAt() {
        return lastActiveAt;
    }

    public void setLastActiveAt(Instant lastActiveAt) {
        this.lastActiveAt = lastActiveAt;
    }

    public Instant getTrustEstablishedAt() {
        return trustEstablishedAt;
    }

    public void setTrustEstablishedAt(Instant trustEstablishedAt) {
        this.trustEstablishedAt = trustEstablishedAt;
    }

    public Instant getTrustRevokedAt() {
        return trustRevokedAt;
    }

    public void setTrustRevokedAt(Instant trustRevokedAt) {
        this.trustRevokedAt = trustRevokedAt;
    }

    public String getRevokedReason() {
        return revokedReason;
    }

    public void setRevokedReason(String revokedReason) {
        this.revokedReason = revokedReason;
    }

    public Instant getDisabledAt() {
        return disabledAt;
    }

    public void setDisabledAt(Instant disabledAt) {
        this.disabledAt = disabledAt;
    }

    public String getDisabledReason() {
        return disabledReason;
    }

    public void setDisabledReason(String disabledReason) {
        this.disabledReason = disabledReason;
    }

    public Instant getPolicyUpdatedAt() {
        return policyUpdatedAt;
    }

    public void setPolicyUpdatedAt(Instant policyUpdatedAt) {
        this.policyUpdatedAt = policyUpdatedAt;
    }

    public Instant getLastDeliveredAt() {
        return lastDeliveredAt;
    }

    public void setLastDeliveredAt(Instant lastDeliveredAt) {
        this.lastDeliveredAt = lastDeliveredAt;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
