package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.EmergencyBroadcastRequest;
import com.visitor.management.dto.EmergencyEvacuationRegisterResponse;
import com.visitor.management.dto.EmergencyFlagRequest;
import com.visitor.management.dto.EmergencyIncidentResponse;
import com.visitor.management.dto.EmergencyLockdownRequest;
import com.visitor.management.dto.EmergencyPanicRequest;
import com.visitor.management.dto.EmergencyStateResponse;
import com.visitor.management.service.EmergencyOperationsService;
import jakarta.validation.Valid;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/emergency")
public class EmergencyOperationsController {

    private final EmergencyOperationsService emergencyOperationsService;

    public EmergencyOperationsController(EmergencyOperationsService emergencyOperationsService) {
        this.emergencyOperationsService = emergencyOperationsService;
    }

    @GetMapping("/state")
    public ApiResponse<EmergencyStateResponse> state(Authentication authentication) {
        return ApiResponse.ok("Emergency operational state loaded.", emergencyOperationsService.state(authentication.getName()));
    }

    @GetMapping("/feed")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'SECURITY_GUARD')")
    public ApiResponse<List<EmergencyIncidentResponse>> feed(Authentication authentication) {
        return ApiResponse.ok("Emergency incident feed loaded.", emergencyOperationsService.feed(authentication.getName()));
    }

    @GetMapping("/evacuation-register")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'SECURITY_GUARD')")
    public ApiResponse<EmergencyEvacuationRegisterResponse> evacuationRegister(Authentication authentication) {
        return ApiResponse.ok("Emergency evacuation register loaded.", emergencyOperationsService.evacuationRegister(authentication.getName()));
    }

    @PostMapping("/panic")
    @PreAuthorize("hasAnyRole('ADMIN', 'SECURITY_GUARD')")
    public ApiResponse<EmergencyIncidentResponse> panic(
            @Valid @RequestBody EmergencyPanicRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Panic alert dispatched.", emergencyOperationsService.triggerPanic(request, authentication.getName()));
    }

    @PostMapping("/broadcasts")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<EmergencyIncidentResponse> broadcast(
            @Valid @RequestBody EmergencyBroadcastRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Emergency broadcast dispatched.", emergencyOperationsService.broadcast(request, authentication.getName()));
    }

    @PostMapping("/lockdown")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<EmergencyStateResponse> startLockdown(
            @Valid @RequestBody EmergencyLockdownRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Emergency lockdown started.", emergencyOperationsService.startLockdown(request, authentication.getName()));
    }

    @PatchMapping("/lockdown/clear")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN')")
    public ApiResponse<EmergencyStateResponse> clearLockdown(
            @Valid @RequestBody EmergencyLockdownRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Emergency lockdown cleared.", emergencyOperationsService.clearLockdown(request, authentication.getName()));
    }

    @PostMapping("/visitors/{id}/suspicious")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'SECURITY_GUARD')")
    public ApiResponse<EmergencyIncidentResponse> flagVisitor(
            @PathVariable String id,
            @Valid @RequestBody EmergencyFlagRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Suspicious visitor incident recorded.", emergencyOperationsService.flagVisitor(id, request, authentication.getName()));
    }

    @PostMapping("/workforce/{id}/suspicious")
    @PreAuthorize("hasAnyRole('SUPER_ADMIN', 'ADMIN', 'SECURITY_GUARD')")
    public ApiResponse<EmergencyIncidentResponse> flagWorkforce(
            @PathVariable String id,
            @Valid @RequestBody EmergencyFlagRequest request,
            Authentication authentication
    ) {
        return ApiResponse.ok("Suspicious workforce incident recorded.", emergencyOperationsService.flagWorkforce(id, request, authentication.getName()));
    }
}
