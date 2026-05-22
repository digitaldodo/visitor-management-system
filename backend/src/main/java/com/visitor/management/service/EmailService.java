package com.visitor.management.service;

import com.visitor.management.entity.VisitorInvite;

public interface EmailService {
    void sendPasswordResetOtp(String toEmail, String recipientName, String otp);

    void sendSuperAdminCreationOtp(String toEmail, String recipientName, String otp);

    void sendVisitorEmailVerification(String toEmail, String recipientName, String verificationUrl, long expiryHours);

    void sendVisitorInvite(VisitorInvite invite);

    void sendNotificationEmail(String toEmail, String recipientName, String subject, String title, String message, String actionUrl);
}
