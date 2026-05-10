package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.VisitorPassResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.dto.VisitorVisitRequest;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.User;
import com.visitor.management.exception.UnauthorizedException;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.service.VisitorService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/visitor")
@PreAuthorize("hasRole('VISITOR')")
public class VisitorPortalController {

    private final VisitorService visitorService;
    private final UserRepository userRepository;

    public VisitorPortalController(VisitorService visitorService, UserRepository userRepository) {
        this.visitorService = visitorService;
        this.userRepository = userRepository;
    }

    @GetMapping("/overview")
    public ApiResponse<Map<String, Object>> overview(Authentication authentication) {
        User account = currentUser(authentication);
        List<VisitorResponse> visits = visitorService.visitsForVisitorAccount(account);
        long pending = visits.stream().filter(visit -> "PENDING".equals(visit.status().name())).count();
        long approved = visits.stream().filter(visit -> "APPROVED".equals(visit.status().name()) || "CHECKED_IN".equals(visit.status().name())).count();
        return ApiResponse.ok("Visitor overview loaded.", Map.of(
                "name", account.getFullName(),
                "email", account.getEmail(),
                "pending", pending,
                "activePasses", approved
        ));
    }

    @GetMapping("/visits")
    public ApiResponse<List<VisitorResponse>> visits(Authentication authentication) {
        return ApiResponse.ok("Visitor requests loaded.", visitorService.visitsForVisitorAccount(currentUser(authentication)));
    }

    @PostMapping("/visits")
    public ApiResponse<VisitorResponse> requestVisit(
            @Valid @RequestBody VisitorVisitRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Visit request submitted.", visitorService.createForVisitorAccount(request, currentUser(authentication)));
    }

    @GetMapping("/visits/{id}/pass")
    public ApiResponse<VisitorPassResponse> pass(@PathVariable String id, Authentication authentication) {
        return ApiResponse.ok("Visitor pass loaded.", visitorService.passForVisitorAccount(id, currentUser(authentication)));
    }

    private User currentUser(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("Authentication is required.");
        }
        return userRepository.findById(authentication.getName())
                .filter(user -> user.isActive() && (user.getAccountStatus() == null || user.getAccountStatus() == AccountStatus.ACTIVE))
                .orElseThrow(() -> new UnauthorizedException("Visitor account was not found."));
    }
}
