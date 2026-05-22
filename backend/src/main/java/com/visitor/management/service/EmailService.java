package com.visitor.management.service;

import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.Visitor;

public interface EmailService {
    void sendPasswordResetOtp(String toEmail, String recipientName, String otp);

    void sendSuperAdminCreationOtp(String toEmail, String recipientName, String otp);

    void sendVisitorEmailVerification(String toEmail, String recipientName, String verificationUrl, long expiryHours);

    void sendVisitorInvite(VisitorInvite invite);

    void sendVisitorApprovedBadge(Visitor visitor);

    void sendNotificationEmail(String toEmail, String recipientName, String subject, String title, String message, String actionUrl);
}
