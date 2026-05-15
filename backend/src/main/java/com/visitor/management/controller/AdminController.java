package com.visitor.management.controller;

import com.visitor.management.dto.ActionResponse;
import com.visitor.management.dto.AdminPasswordResetRequest;
import com.visitor.management.dto.AdminUserCreateRequest;
import com.visitor.management.dto.AdminUserResponse;
import com.visitor.management.dto.AdminUserRoleUpdateRequest;
import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.DepartmentCreateRequest;
import com.visitor.management.dto.DepartmentResponse;
import com.visitor.management.dto.DepartmentUpdateRequest;
import com.visitor.management.dto.EmployeeAttendanceResponse;
import com.visitor.management.dto.HomepageSettingsRequest;
import com.visitor.management.dto.PageResponse;
import com.visitor.management.dto.SearchRequest;
import com.visitor.management.dto.SuperAdminCreateRequest;
import com.visitor.management.dto.SuperAdminOtpRequest;
import com.visitor.management.dto.SuperAdminOtpResponse;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorPhotoUploadResponse;
import com.visitor.management.dto.VisitorUpdateRequest;
import com.visitor.management.config.AppProperties;
import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.service.AnalyticsService;
import com.visitor.management.service.AdminUserService;
import com.visitor.management.service.AccessAuditService;
import com.visitor.management.service.CloudinaryUploadService;
import com.visitor.management.service.DepartmentService;
import com.visitor.management.service.EmployeeAttendanceService;
import com.visitor.management.service.HomepageService;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.bind.annotation.RequestPart;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
public class AdminController {

    private final VisitorService visitorService;
    private final CloudinaryUploadService cloudinaryUploadService;
    private final AnalyticsService analyticsService;
    private final AdminUserService adminUserService;
    private final DepartmentService departmentService;
    private final EmployeeAttendanceService employeeAttendanceService;
    private final HomepageService homepageService;
    private final AccessAuditService accessAuditService;
    private final AppProperties appProperties;
    private final CorsOriginResolver corsOriginResolver;
    private final String activeProfile;

    public AdminController(
            VisitorService visitorService,
            CloudinaryUploadService cloudinaryUploadService,
            AnalyticsService analyticsService,
            AdminUserService adminUserService,
            DepartmentService departmentService,
            EmployeeAttendanceService employeeAttendanceService,
            HomepageService homepageService,
            AccessAuditService accessAuditService,
            AppProperties appProperties,
            CorsOriginResolver corsOriginResolver,
            @Value("${spring.profiles.active:default}") String activeProfile
    ) {
        this.visitorService = visitorService;
        this.cloudinaryUploadService = cloudinaryUploadService;
        this.analyticsService = analyticsService;
        this.adminUserService = adminUserService;
        this.departmentService = departmentService;
        this.employeeAttendanceService = employeeAttendanceService;
        this.homepageService = homepageService;
        this.accessAuditService = accessAuditService;
        this.appProperties = appProperties;
        this.corsOriginResolver = corsOriginResolver;
        this.activeProfile = activeProfile;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview(Authentication authentication) {
        return ApiResponse.ok("Admin overview loaded.", Map.of(
                "area", "ADMIN",
                "metrics", visitorService.metrics(authentication.getName())
        ));
    }

    @GetMapping("/analytics")
    public ApiResponse<Map<String, Object>> analytics(Authentication authentication) {
        Map<String, Object> analytics = new java.util.LinkedHashMap<>(analyticsService.adminDashboard(authentication.getName()));
        analytics.put("workforceAttendance", employeeAttendanceService.analytics(authentication.getName()));
        return ApiResponse.ok("Admin analytics loaded.", analytics);
    }

    @GetMapping("/users")
    public ApiResponse<List<AdminUserResponse>> users(Authentication authentication) {
        return ApiResponse.ok("Admin user management loaded.", adminUserService.listUsers(authentication));
    }

    @PostMapping("/users")
    public ApiResponse<AdminUserResponse> createUser(@Valid @RequestBody AdminUserCreateRequest request, Authentication authentication) {
        return ApiResponse.ok("Internal account created.", adminUserService.createUser(request, authentication));
    }

    @PostMapping("/super-admins/otp")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<SuperAdminOtpResponse> initiateSuperAdminCreation(
            @Valid @RequestBody SuperAdminOtpRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("SUPER_ADMIN verification code sent.", adminUserService.initiateSuperAdminCreation(request, authentication));
    }

    @PostMapping("/super-admins")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<AdminUserResponse> createSuperAdmin(
            @Valid @RequestBody SuperAdminCreateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("SUPER_ADMIN account created.", adminUserService.createSuperAdmin(request, authentication));
    }

    @PatchMapping("/users/{id}/disable")
    public ApiResponse<AdminUserResponse> disableUser(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Account disabled.", adminUserService.disableUser(id, authentication));
    }

    @PatchMapping("/users/{id}/enable")
    public ApiResponse<AdminUserResponse> enableUser(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Account enabled.", adminUserService.enableUser(id, authentication));
    }

    @PatchMapping("/users/{id}/reset-password")
    public ApiResponse<AdminUserResponse> resetPassword(
            @PathVariable String id,
            @Valid @RequestBody AdminPasswordResetRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Password reset.", adminUserService.resetPassword(id, request, authentication));
    }

    @PatchMapping("/users/{id}/role")
    public ApiResponse<AdminUserResponse> updateUserRole(
            @PathVariable String id,
            @Valid @RequestBody AdminUserRoleUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Account access updated.", adminUserService.updateRole(id, request, authentication));
    }

    @GetMapping("/departments")
    public ApiResponse<List<DepartmentResponse>> departments(
            @RequestParam(required = false) String organizationId,
            @RequestParam(defaultValue = "false") boolean includeInactive,
            Authentication authentication
    ) {
        return ApiResponse.ok(
                "Departments loaded.",
                departmentService.listDepartments(authentication, organizationId, includeInactive)
        );
    }

    @PostMapping("/departments")
    public ApiResponse<DepartmentResponse> createDepartment(
            @Valid @RequestBody DepartmentCreateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Department saved.", departmentService.createDepartment(request, authentication));
    }

    @PatchMapping("/departments/{id}")
    public ApiResponse<DepartmentResponse> updateDepartment(
            @PathVariable String id,
            @Valid @RequestBody DepartmentUpdateRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Department updated.", departmentService.updateDepartment(id, request, authentication));
    }

    @GetMapping("/reports")
    public ApiResponse<List<Map<String, String>>> reports(Authentication authentication) {
        return ApiResponse.ok("Audit oversight loaded.", accessAuditService.latestSecurityOversight(authentication.getName()));
    }

    @GetMapping("/workforce-attendance")
    public ApiResponse<List<EmployeeAttendanceResponse>> workforceAttendance(Authentication authentication) {
        return ApiResponse.ok("Workforce attendance logs loaded.", employeeAttendanceService.logs(authentication.getName()));
    }

    @GetMapping("/workforce-attendance/analytics")
    public ApiResponse<Map<String, Object>> workforceAttendanceAnalytics(Authentication authentication) {
        return ApiResponse.ok("Workforce attendance analytics loaded.", employeeAttendanceService.analytics(authentication.getName()));
    }

    @GetMapping("/monitoring")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> monitoring(Authentication authentication) {
        return ApiResponse.ok("Admin system monitoring loaded.", Map.of(
                "runtime", "UP",
                "profile", activeProfile,
                "photoUploads", isCloudinaryConfigured() ? "Configured" : "Unavailable",
                "emailDelivery", isSendGridConfigured() ? "Configured" : "Unavailable",
                "rateLimit", appProperties.getRateLimit().isEnabled()
                        ? "%d requests per minute".formatted(appProperties.getRateLimit().getRequestsPerMinute())
                        : "Disabled",
                "frontendOrigins", String.join(", ", corsOriginResolver.resolveAllowedOrigins()),
                "visitors", visitorService.statusSummary(authentication.getName())
        ));
    }

    @GetMapping("/homepage-settings")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> homepageSettings() {
        return ApiResponse.ok("Homepage settings loaded.", homepageService.adminSettings());
    }

    @PutMapping("/homepage-settings")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ApiResponse<Map<String, Object>> updateHomepageSettings(@Valid @RequestBody HomepageSettingsRequest request, Authentication authentication) {
        return ApiResponse.ok("Homepage settings updated.", homepageService.updateSettings(request, authentication));
    }

    @GetMapping("/visitors")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<PageResponse<VisitorResponse>> visitors(@Valid @ModelAttribute SearchRequest request, Authentication authentication) {
        return ApiResponse.ok("Admin visitor records loaded.", visitorService.search(request, authentication.getName()));
    }

    @GetMapping("/visitors/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorResponse> visitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Admin visitor loaded.", visitorService.get(id, authentication.getName()));
    }

    @PostMapping("/visitors")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorResponse> createVisitor(@Valid @RequestBody VisitorCreateRequest request, Authentication authentication) {
        return ApiResponse.ok("Visitor registered.", visitorService.create(request, authentication.getName()));
    }

    @PostMapping(value = "/visitors/photo", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorPhotoUploadResponse> uploadVisitorPhoto(@RequestPart("file") MultipartFile file) {
        return ApiResponse.ok("Visitor photo uploaded.", cloudinaryUploadService.uploadVisitorPhoto(file));
    }

    @PutMapping("/visitors/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorResponse> updateVisitor(@PathVariable String id, @Valid @RequestBody VisitorUpdateRequest request, Authentication authentication) {
        return ApiResponse.ok("Visitor updated.", visitorService.update(id, request, authentication.getName()));
    }

    @PatchMapping("/visitors/{id}/check-in")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorResponse> checkInVisitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor checked in.", visitorService.checkIn(id, authentication.getName()));
    }

    @PatchMapping("/visitors/{id}/check-out")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<VisitorResponse> checkOutVisitor(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor checked out.", visitorService.checkOut(id, authentication.getName()));
    }

    @DeleteMapping("/visitors/{id}")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<ActionResponse> deleteVisitor(@PathVariable String id, Authentication authentication) {
        visitorService.delete(id, authentication.getName());
        return ApiResponse.ok("Visitor deleted.", ActionResponse.ok());
    }

    private boolean isCloudinaryConfigured() {
        AppProperties.Cloudinary cloudinary = appProperties.getCloudinary();
        return hasText(cloudinary.getCloudName()) && hasText(cloudinary.getApiKey()) && hasText(cloudinary.getApiSecret());
    }

    private boolean isSendGridConfigured() {
        AppProperties.SendGrid sendGrid = appProperties.getSendgrid();
        return hasText(sendGrid.getApiKey()) && hasText(sendGrid.getFromEmail());
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

}
