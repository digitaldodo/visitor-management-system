package com.visitor.management.service;

public interface EmailService {
    void sendPasswordResetOtp(String toEmail, String recipientName, String otp);

    void sendNotificationEmail(String toEmail, String recipientName, String subject, String title, String message, String actionUrl);
}
