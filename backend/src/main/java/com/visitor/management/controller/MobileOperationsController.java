package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.MobileSessionPolicyResponse;
import com.visitor.management.dto.MobileTelemetryRequest;
import com.visitor.management.dto.MobileTelemetryResponse;
import com.visitor.management.dto.OperationalEventBatchResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.User;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.service.OperationalEventStreamService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

@RestController
@RequestMapping("/api/v1/mobile")
public class MobileOperationsController {

    private static final Logger log = LoggerFactory.getLogger(MobileOperationsController.class);

    private final UserRepository userRepository;
    private final OperationalEventStreamService operationalEventStreamService;

    public MobileOperationsController(
            UserRepository userRepository,
            OperationalEventStreamService operationalEventStreamService
    ) {
        this.userRepository = userRepository;
        this.operationalEventStreamService = operationalEventStreamService;
    }

    @PostMapping("/telemetry")
    public ApiResponse<MobileTelemetryResponse> telemetry(
            @Valid @RequestBody MobileTelemetryRequest request,
            Authentication authentication
    ) {
        int diagnosticCount = request.diagnostics() == null ? 0 : request.diagnostics().size();
        int metricCount = request.metrics() == null ? 0 : request.metrics().size();
        int accepted = diagnosticCount + metricCount;

        if (accepted > 0 && log.isInfoEnabled()) {
            log.info(
                    "Accepted mobile telemetry batch for user {}: diagnostics={}, metrics={}",
                    authentication.getName(),
                    diagnosticCount,
                    metricCount
            );
        }

        return ApiResponse.ok("Mobile telemetry accepted.", new MobileTelemetryResponse(accepted));
    }

    @GetMapping("/operations/events")
    public ApiResponse<OperationalEventBatchResponse> operationalEvents(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "80") int limit,
            Authentication authentication
    ) {
        return ApiResponse.ok("Operational events loaded.", operationalEventStreamService.events(authentication.getName(), cursor, limit));
    }

    @GetMapping(value = "/operations/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter operationalStream(
            @RequestParam(required = false) String cursor,
            Authentication authentication
    ) {
        SseEmitter emitter = new SseEmitter(35_000L);
        try {
            OperationalEventBatchResponse batch = operationalEventStreamService.events(authentication.getName(), cursor, 80);
            emitter.send(SseEmitter.event()
                    .id(batch.cursor())
                    .name(batch.heartbeat() ? "heartbeat" : "operations")
                    .data(batch));
            emitter.complete();
        } catch (IOException ex) {
            emitter.completeWithError(ex);
        }
        return emitter;
    }

    @GetMapping("/session-policy")
    public ApiResponse<MobileSessionPolicyResponse> sessionPolicy(Authentication authentication) {
        User user = userRepository.findById(authentication.getName()).orElse(null);
        boolean sessionValid = user != null && user.isActive() && user.getAccountStatus() == AccountStatus.ACTIVE;

        MobileSessionPolicyResponse response = new MobileSessionPolicyResponse(
                sessionValid,
                !sessionValid,
                sessionValid ? null : "user-revoked-or-disabled",
                false,
                0,
                "personal",
                false,
                false,
                true
        );

        return ApiResponse.ok("Mobile session policy loaded.", response);
    }
}
