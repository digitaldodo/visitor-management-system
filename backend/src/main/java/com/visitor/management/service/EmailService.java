package com.visitor.management.service;

public interface EmailService {
    void sendPasswordResetOtp(String toEmail, String recipientName, String otp);
}
