package com.visitor.management.controller;

import com.visitor.management.dto.ApiResponse;
import com.visitor.management.dto.QrVerificationResponse;
import com.visitor.management.service.VisitorService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/public")
public class PublicBadgeVerificationController {

    private final VisitorService visitorService;

    public PublicBadgeVerificationController(VisitorService visitorService) {
        this.visitorService = visitorService;
    }

    @GetMapping("/passes/{token}")
    public ApiResponse<QrVerificationResponse> verifyPass(@PathVariable String token) {
        return ApiResponse.ok("Badge verification loaded.", visitorService.verifyPassToken(token));
    }
}
