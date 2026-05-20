package com.visitor.management.controller;

import com.visitor.management.dto.ActionResponse;
import com.visitor.management.dto.AccountProfileUpdateRequest;
import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.AuthRequest;
import com.visitor.management.dto.AuthResponse;
import com.visitor.management.dto.EmailVerificationDispatchRequest;
import com.visitor.management.dto.EmailVerificationDispatchResponse;
import com.visitor.management.dto.EmailVerificationStatusResponse;
import com.visitor.management.dto.EmployeePasswordUpdateRequest;
import com.visitor.management.dto.ForgotPasswordRequest;
import com.visitor.management.dto.ForgotPasswordResponse;
import com.visitor.management.dto.LogoutRequest;
import com.visitor.management.dto.RefreshTokenRequest;
import com.visitor.management.dto.RegisterRequest;
import com.visitor.management.dto.ResetPasswordRequest;
import com.visitor.management.dto.UserProfileResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VerifyOtpRequest;
import com.visitor.management.dto.VerifyOtpResponse;
import com.visitor.management.service.AuthService;
import com.visitor.management.service.CloudinaryUploadService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping({"/api/v1/auth", "/api/auth", "/auth"})
public class AuthController {

    private final AuthService authService;
    private final CloudinaryUploadService cloudinaryUploadService;

    public AuthController(AuthService authService, CloudinaryUploadService cloudinaryUploadService) {
        this.authService = authService;
        this.cloudinaryUploadService = cloudinaryUploadService;
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody AuthRequest request, HttpServletRequest servletRequest) {
        return authService.login(request, clientFingerprint(servletRequest));
    }

    @PostMapping("/register")
    public ApiResponse<EmailVerificationDispatchResponse> register(
            @Valid @RequestBody RegisterRequest request,
            Authentication authentication,
            HttpServletRequest servletRequest
    ) {
        return ApiResponse.ok(
                "Verify your email to activate your AccessFlow account.",
                authService.register(request, authentication, clientFingerprint(servletRequest))
        );
    }

    @PostMapping("/refresh")
    public ApiResponse<AuthResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ApiResponse.ok("Token refreshed.", authService.refresh(request));
    }

    @PostMapping("/logout")
    public ApiResponse<ActionResponse> logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
        return ApiResponse.ok("Logged out.", ActionResponse.ok());
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<ForgotPasswordResponse>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        return ResponseEntity
                .status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok("If the account exists, a verification code has been sent.", authService.forgotPassword(request)));
    }

    @PostMapping("/resend-verification")
    public ResponseEntity<ApiResponse<EmailVerificationDispatchResponse>> resendVerification(
            @Valid @RequestBody EmailVerificationDispatchRequest request,
            HttpServletRequest servletRequest
    ) {
        return ResponseEntity
                .status(HttpStatus.ACCEPTED)
                .body(ApiResponse.ok(
                        "If the visitor account is waiting for verification, a new email has been sent.",
                        authService.resendVisitorVerification(request, clientFingerprint(servletRequest))
                ));
    }

    @GetMapping("/verify-email")
    public ApiResponse<EmailVerificationStatusResponse> verifyEmail(
            @RequestParam String token,
            HttpServletRequest servletRequest
    ) {
        return ApiResponse.ok(
                "Email verified. Your AccessFlow visitor account is now active.",
                authService.verifyVisitorEmail(token, clientFingerprint(servletRequest))
        );
    }

    @PostMapping("/verify-otp")
    public ApiResponse<VerifyOtpResponse> verifyOtp(@Valid @RequestBody VerifyOtpRequest request) {
        return ApiResponse.ok("Code verified.", authService.verifyOtp(request));
    }

    @PostMapping("/reset-password")
    public ApiResponse<ActionResponse> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authService.resetPassword(request);
        return ApiResponse.ok("Password updated.", ActionResponse.ok());
    }

    @GetMapping("/me")
    public ApiResponse<UserProfileResponse> me(Authentication authentication) {
        return ApiResponse.ok("Current user loaded.", authService.currentUser(authentication));
    }

    @PatchMapping("/profile")
    public ApiResponse<UserProfileResponse> updateProfile(
            @Valid @RequestBody AccountProfileUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Account profile updated.", authService.updateAccountProfile(authentication, request));
    }

    @PatchMapping("/profile/password")
    public ApiResponse<ActionResponse> updatePassword(
            @Valid @RequestBody EmployeePasswordUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok(
                "Account password updated.",
                authService.updateAccountPassword(authentication, request.currentPassword(), request.newPassword())
        );
    }

    @PostMapping(value = "/profile/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResponse<VisitorPhotoUploadResponse> uploadProfilePhoto(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok("Account photo uploaded.", cloudinaryUploadService.uploadAccountPhoto(file));
    }

    private String clientFingerprint(HttpServletRequest request) {
        String forwardedFor = request.getHeader("X-Forwarded-For");
        String ip = forwardedFor == null || forwardedFor.isBlank() ? request.getRemoteAddr() : forwardedFor.split(",")[0].trim();
        String userAgent = request.getHeader("User-Agent");
        String normalizedAgent = userAgent == null || userAgent.isBlank() ? "unknown-agent" : userAgent.trim();
        if (normalizedAgent.length() > 160) {
            normalizedAgent = normalizedAgent.substring(0, 160);
        }
        return ip + ":" + normalizedAgent;
    }
}
