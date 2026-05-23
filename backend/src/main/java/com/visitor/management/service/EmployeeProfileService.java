package com.visitor.management.service;

import com.visitor.management.dto.ActionResponse;
import com.visitor.management.dto.EmployeePasswordUpdateRequest;
import com.visitor.management.dto.EmployeeProfileUpdateRequest;
import com.visitor.management.dto.UserProfileResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.RoleGroups;
import com.visitor.management.entity.User;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.RefreshTokenRepository;
import com.visitor.management.repository.UserRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Locale;
import java.util.regex.Pattern;

@Service
public class EmployeeProfileService {

    private static final Pattern STRONG_PASSWORD_PATTERN = Pattern.compile("^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z0-9]).{12,128}$");

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final PhoneNumberService phoneNumberService;

    public EmployeeProfileService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            PhoneNumberService phoneNumberService
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.phoneNumberService = phoneNumberService;
    }

    public UserProfileResponse profile(String actorId) {
        return toProfile(currentEmployee(actorId));
    }

    public UserProfileResponse updateProfile(String actorId, EmployeeProfileUpdateRequest request) {
        User employee = currentEmployee(actorId);

        if (request.phone() != null || request.phoneCountryCode() != null) {
            PhoneNumberService.NormalizedPhone phone = phoneNumberService.normalize(
                    request.phoneCountryCode() != null ? request.phoneCountryCode() : employee.getPhoneCountryCode(),
                    request.phone(),
                    false
            );
            employee.setPhone(phone != null ? phone.e164() : null);
            employee.setPhoneCountryCode(phone != null ? phone.countryCode() : phoneNumberService.normalizeDialCode(request.phoneCountryCode()));
        }

        if (request.employeePhotoUrl() != null) {
            employee.setEmployeePhotoUrl(trimToNull(request.employeePhotoUrl()));
        }
        if (request.emergencyContact() != null) {
            employee.setEmergencyContact(trimToNull(request.emergencyContact()));
        }
        if (request.preferredLanguage() != null) {
            employee.setPreferredLanguage(normalizeLanguage(request.preferredLanguage()));
        }
        if (request.notificationEmailEnabled() != null) {
            employee.setNotificationEmailEnabled(request.notificationEmailEnabled());
        }
        if (request.notificationInAppEnabled() != null) {
            employee.setNotificationInAppEnabled(request.notificationInAppEnabled());
        }

        return toProfile(userRepository.save(employee));
    }

    public ActionResponse updatePassword(String actorId, EmployeePasswordUpdateRequest request) {
        User employee = currentEmployee(actorId);
        if (!passwordEncoder.matches(request.currentPassword(), employee.getPasswordHash())) {
            throw new UnauthorizedException("Current password is incorrect.");
        }
        validateStrongPassword(request.newPassword());
        employee.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        employee.setPasswordChangedAt(Instant.now());
        userRepository.save(employee);
        revokeAllRefreshTokens(employee.getId());
        return ActionResponse.ok();
    }

    private User currentEmployee(String actorId) {
        User user = userRepository.findById(actorId)
                .orElseThrow(() -> new ResourceNotFoundException("Employee account was not found."));
        if (!RoleGroups.hasEmployeeWorkspaceRole(user.getRoles())) {
            throw new BadRequestException("Only employee accounts can manage employee profile settings.");
        }
        if (!user.isActive() || (user.getAccountStatus() != null && user.getAccountStatus() != AccountStatus.ACTIVE)) {
            throw new UnauthorizedException("Employee account is not active.");
        }
        return user;
    }

    private void revokeAllRefreshTokens(String userId) {
        var activeTokens = refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(userId);
        activeTokens.forEach(token -> token.setRevokedAt(Instant.now()));
        refreshTokenRepository.saveAll(activeTokens);
    }

    private UserProfileResponse toProfile(User user) {
        return new UserProfileResponse(
                user.getId(),
                user.getUsername(),
                user.getEmail(),
                user.getFullName(),
                user.getDepartment(),
                user.getEmployeeId(),
                user.getDesignation(),
                user.getEmployeeType(),
                user.getEmployeePhotoUrl(),
                user.getShiftName(),
                user.getShiftStartTime(),
                user.getShiftEndTime(),
                user.getPhone(),
                user.getPhoneCountryCode(),
                user.getEmergencyContact(),
                user.getPreferredLanguage(),
                user.getNotificationEmailEnabled(),
                user.getNotificationInAppEnabled(),
                user.isActive(),
                user.getAccountStatus() != null ? user.getAccountStatus().name() : null,
                user.getOrganizationId(),
                user.getOrganizationName(),
                user.getOrganizationCode(),
                user.getOrganizationTimezone(),
                user.getOrganizationRegionCountry(),
                user.getRoles()
        );
    }

    private void validateStrongPassword(String password) {
        if (!STRONG_PASSWORD_PATTERN.matcher(password).matches()) {
            throw new BadRequestException("Password must be 12-128 characters and include uppercase, lowercase, number, and symbol.");
        }
    }

    private String normalizeLanguage(String value) {
        String language = trimToNull(value);
        return language == null ? null : language.toLowerCase(Locale.ROOT);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
