package com.visitor.management.service;

import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.VisitorInvite;
import com.google.zxing.BarcodeFormat;
import com.google.zxing.WriterException;
import com.google.zxing.client.j2se.MatrixToImageWriter;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SendGridEmailService implements EmailService {

    private static final DateTimeFormatter INVITE_DATE_FORMATTER = DateTimeFormatter.ofPattern("EEE, MMM d, yyyy h:mm a z");

    private final AppProperties.SendGrid properties;
    private final RestClient restClient;

    public SendGridEmailService(AppProperties appProperties, RestClient.Builder restClientBuilder) {
        this.properties = appProperties.getSendgrid();
        this.restClient = restClientBuilder
                .baseUrl("https://api.sendgrid.com")
                .build();
    }

    @Override
    public void sendPasswordResetOtp(String toEmail, String recipientName, String otp) {
        sendEmail(
                toEmail,
                safeName(recipientName),
                "Your AccessFlow password reset code",
                passwordResetPlainTextBody(recipientName, otp),
                passwordResetHtmlBody(recipientName, otp),
                "Password reset verification code"
        );
    }

    @Override
    public void sendSuperAdminCreationOtp(String toEmail, String recipientName, String otp) {
        sendEmail(
                toEmail,
                safeName(recipientName),
                "Confirm AccessFlow platform-owner creation",
                superAdminCreationPlainTextBody(recipientName, otp),
                superAdminCreationHtmlBody(recipientName, otp),
                "SUPER_ADMIN creation verification code"
        );
    }

    @Override
    public void sendVisitorEmailVerification(String toEmail, String recipientName, String verificationUrl, long expiryHours) {
        sendEmail(
                toEmail,
                safeName(recipientName),
                "Verify your AccessFlow visitor account",
                visitorVerificationPlainTextBody(recipientName, verificationUrl, expiryHours),
                visitorVerificationHtmlBody(recipientName, verificationUrl, expiryHours),
                "Visitor account verification"
        );
    }

    @Override
    public void sendVisitorInvite(VisitorInvite invite) {
        String visitorEmail = required(invite.getVisitorEmail(), "Visitor invite email address is required.");
        String inviteUrl = required(invite.getInviteUrl(), "Visitor invite URL is required.");
        String qrContentId = "accessflow-invite-qr";
        InlineAttachment qrAttachment = new InlineAttachment(
                qrContentId,
                "accessflow-invite-qr.png",
                "image/png",
                inviteQrBase64(inviteUrl)
        );
        sendEmail(
                visitorEmail,
                safeName(invite.getVisitorName()),
                "%s invited you to pre-register for %s".formatted(safeName(invite.getHostEmployeeName()), safeOrganization(invite)),
                visitorInvitePlainTextBody(invite),
                visitorInviteHtmlBody(invite, qrContentId),
                "Visitor pre-registration invite",
                List.of(qrAttachment)
        );
    }

    @Override
    public void sendNotificationEmail(String toEmail, String recipientName, String subject, String title, String message, String actionUrl) {
        sendEmail(
                toEmail,
                safeName(recipientName),
                subject,
                notificationPlainText(recipientName, title, message, actionUrl),
                notificationHtml(recipientName, title, message, actionUrl),
                "Notification"
        );
    }

    private void sendEmail(String toEmail, String recipientName, String subject, String plainText, String html, String description) {
        sendEmail(toEmail, recipientName, subject, plainText, html, description, List.of());
    }

    private void sendEmail(String toEmail, String recipientName, String subject, String plainText, String html, String description, List<InlineAttachment> attachments) {
        if (isBlank(properties.getApiKey()) || isBlank(properties.getFromEmail())) {
            throw new IllegalStateException("SendGrid email delivery is not configured.");
        }
        if (isBlank(toEmail)) {
            throw new IllegalArgumentException("%s requires a recipient email address.".formatted(description));
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("personalizations", List.of(Map.of(
                "to", List.of(Map.of("email", toEmail.trim(), "name", recipientName)),
                "subject", subject
        )));
        payload.put("from", Map.of("email", properties.getFromEmail(), "name", blankToDefault(properties.getFromName(), "AccessFlow Security")));
        payload.put("content", List.of(
                Map.of("type", "text/plain", "value", plainText),
                Map.of("type", "text/html", "value", html)
        ));
        if (attachments != null && !attachments.isEmpty()) {
            payload.put("attachments", attachments.stream()
                    .map(attachment -> Map.of(
                            "content", attachment.contentBase64(),
                            "filename", attachment.filename(),
                            "type", attachment.contentType(),
                            "disposition", "inline",
                            "content_id", attachment.contentId()
                    ))
                    .toList());
        }

        restClient.post()
                .uri("/v3/mail/send")
                .header(HttpHeaders.AUTHORIZATION, "Bearer " + properties.getApiKey())
                .contentType(MediaType.APPLICATION_JSON)
                .body(payload)
                .retrieve()
                .toBodilessEntity();
    }

    private String notificationPlainText(String recipientName, String title, String message, String actionUrl) {
        String link = isBlank(actionUrl) ? "" : "\n\nOpen AccessFlow: " + actionUrl;
        return """
                AccessFlow notification

                Hi %s,

                %s

                %s%s
                """.formatted(safeName(recipientName), title, message, link);
    }

    private String notificationHtml(String recipientName, String title, String message, String actionUrl) {
        String escapedName = escapeHtml(safeName(recipientName));
        String escapedTitle = escapeHtml(title);
        String escapedMessage = escapeHtml(message);
        String action = isBlank(actionUrl) ? "" : """
                <p style="margin:24px 0 0;"><a href="%s" style="background:#1d4ed8;border-radius:8px;color:#ffffff;display:inline-block;font-weight:800;padding:12px 16px;text-decoration:none;">Open AccessFlow</a></p>
                """.formatted(escapeHtml(actionUrl));
        return """
                <!doctype html>
                <html>
                  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#101828;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:8px;overflow:hidden;">
                            <tr>
                              <td style="background:#101828;color:#ffffff;padding:24px 28px;">
                                <div style="font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:#bfdbfe;">AccessFlow</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">%s</h1>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi %s,</p>
                                <p style="margin:0;font-size:16px;line-height:1.5;">%s</p>
                                %s
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(escapedTitle, escapedName, escapedMessage, action);
    }

    private String passwordResetPlainTextBody(String recipientName, String otp) {
        return """
                AccessFlow password reset

                Hi %s,

                Your verification code is %s.

                This code expires in 5 minutes. If you did not request a password reset, do not share this code and contact your administrator.
                """.formatted(safeName(recipientName), otp);
    }

    private String visitorVerificationPlainTextBody(String recipientName, String verificationUrl, long expiryHours) {
        return """
                AccessFlow visitor account verification

                Hi %s,

                Verify your email to activate your AccessFlow visitor account:
                %s

                This verification link expires in %d hours.

                Security notice: If you did not create this account, you can ignore this message. Your account will stay inactive until the email address is verified.
                """.formatted(safeName(recipientName), verificationUrl, expiryHours);
    }

    private String visitorInvitePlainTextBody(VisitorInvite invite) {
        String note = isBlank(invite.getNote()) ? "" : "\n\nNote from %s:\n%s".formatted(safeName(invite.getHostEmployeeName()), invite.getNote().trim());
        return """
                AccessFlow visitor pre-registration

                Hi %s,

                %s invited you to pre-register before your visit to %s.

                Visit details
                Organization: %s
                Host: %s
                Date and time: %s
                Purpose: %s
                Location: %s
                Approval status: %s

                Complete pre-registration:
                %s

                Use the QR in this email or the link above to open your invite. Your temporary access QR is issued after pre-registration%s.

                This invite expires %s.%s
                """.formatted(
                safeName(invite.getVisitorName()),
                safeName(invite.getHostEmployeeName()),
                safeOrganization(invite),
                safeOrganization(invite),
                safeName(invite.getHostEmployeeName()),
                inviteSchedule(invite),
                safeFallback(invite.getPurposeOfVisit(), "Visit"),
                locationText(invite),
                approvalStatus(invite),
                invite.getInviteUrl(),
                invite.isApprovalRequired() ? " and host approval" : "",
                inviteExpiry(invite),
                note
        );
    }

    private String passwordResetHtmlBody(String recipientName, String otp) {
        String escapedName = escapeHtml(safeName(recipientName));
        String escapedOtp = escapeHtml(otp);
        return """
                <!doctype html>
                <html>
                  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#101828;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:8px;overflow:hidden;">
                            <tr>
                              <td style="background:#101828;color:#ffffff;padding:24px 28px;">
                                <div style="font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:#bfdbfe;">AccessFlow Security</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Password reset code</h1>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi %s,</p>
                                <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Use this verification code to continue resetting your AccessFlow account password.</p>
                                <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;color:#1d4ed8;font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 20px;text-align:center;">%s</div>
                                <p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#475467;">This code expires in 5 minutes.</p>
                                <p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#b42318;"><strong>Security warning:</strong> If you did not request this reset, do not share this code and contact your administrator immediately.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(escapedName, escapedOtp);
    }

    private String visitorVerificationHtmlBody(String recipientName, String verificationUrl, long expiryHours) {
        String escapedName = escapeHtml(safeName(recipientName));
        String escapedUrl = escapeHtml(verificationUrl);
        return """
                <!doctype html>
                <html>
                  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#101828;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:8px;overflow:hidden;">
                            <tr>
                              <td style="background:#101828;color:#ffffff;padding:24px 28px;">
                                <div style="font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:#bfdbfe;">AccessFlow</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Verify your visitor account</h1>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi %s,</p>
                                <p style="margin:0 0 18px;font-size:16px;line-height:1.5;">Finish activating your AccessFlow visitor account by verifying your email address.</p>
                                <p style="margin:0 0 18px;"><a href="%s" style="background:#1d4ed8;border-radius:10px;color:#ffffff;display:inline-block;font-size:15px;font-weight:800;padding:14px 18px;text-decoration:none;">Verify email address</a></p>
                                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475467;">This verification link expires in %d hours.</p>
                                <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#475467;">If the button does not open, copy and paste this link into your browser:</p>
                                <p style="margin:0 0 18px;font-size:13px;line-height:1.6;word-break:break-word;"><a href="%s" style="color:#1d4ed8;text-decoration:none;">%s</a></p>
                                <p style="margin:0;font-size:14px;line-height:1.6;color:#b42318;"><strong>Security notice:</strong> If you did not create this account, no action is needed. AccessFlow will keep the account inactive until the address is verified.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(escapedName, escapedUrl, expiryHours, escapedUrl, escapedUrl);
    }

    private String visitorInviteHtmlBody(VisitorInvite invite, String qrContentId) {
        String escapedVisitor = escapeHtml(safeName(invite.getVisitorName()));
        String escapedHost = escapeHtml(safeName(invite.getHostEmployeeName()));
        String escapedOrganization = escapeHtml(safeOrganization(invite));
        String escapedInviteUrl = escapeHtml(invite.getInviteUrl());
        String noteHtml = isBlank(invite.getNote()) ? "" : """
                                <tr>
                                  <td style="padding:0 0 18px;">
                                    <div style="background:#f8fafc;border:1px solid #d0d5dd;border-radius:8px;padding:16px;">
                                      <p style="margin:0 0 8px;color:#475467;font-size:12px;font-weight:800;letter-spacing:0;text-transform:uppercase;">Additional note from %s</p>
                                      <p style="margin:0;color:#101828;font-size:15px;line-height:1.6;white-space:pre-line;">%s</p>
                                    </div>
                                  </td>
                                </tr>
                """.formatted(escapedHost, escapeHtml(invite.getNote().trim()));
        return """
                <!doctype html>
                <html>
                  <head>
                    <meta name="color-scheme" content="light dark">
                    <meta name="supported-color-schemes" content="light dark">
                  </head>
                  <body style="margin:0;background:#eef2f6;font-family:Arial,Helvetica,sans-serif;color:#101828;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#eef2f6;padding:24px 12px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #d0d5dd;border-radius:8px;overflow:hidden;">
                            <tr>
                              <td style="background:#0f172a;color:#ffffff;padding:26px 28px;">
                                <div style="font-size:13px;font-weight:800;letter-spacing:0;text-transform:uppercase;color:#93c5fd;">AccessFlow</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">You're invited to pre-register</h1>
                                <p style="margin:10px 0 0;color:#dbeafe;font-size:15px;line-height:1.5;">%s is expecting you at %s.</p>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:16px;line-height:1.55;">Hi %s,</p>
                                <p style="margin:0 0 22px;font-size:16px;line-height:1.55;">Please complete pre-registration before arrival so the front desk can verify your visit smoothly.</p>
                                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;">
                                  %s
                                  %s
                                  %s
                                  %s
                                  %s
                                  %s
                                </table>
                                %s
                                <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f8fafc;border:1px solid #d0d5dd;border-radius:8px;margin:0 0 22px;">
                                  <tr>
                                    <td style="padding:18px;vertical-align:middle;">
                                      <p style="margin:0 0 10px;color:#344054;font-size:13px;font-weight:800;letter-spacing:0;text-transform:uppercase;">Secure invite QR</p>
                                      <p style="margin:0;color:#475467;font-size:14px;line-height:1.5;">Scan this QR or use the button below to open your pre-registration invite. Your access QR is issued after pre-registration%s.</p>
                                    </td>
                                    <td align="right" style="padding:18px;width:132px;">
                                      <img src="cid:%s" width="116" height="116" alt="AccessFlow invite QR" style="display:block;border:1px solid #d0d5dd;border-radius:8px;background:#ffffff;padding:8px;">
                                    </td>
                                  </tr>
                                </table>
                                <p style="margin:0 0 18px;"><a href="%s" style="background:#1d4ed8;border-radius:8px;color:#ffffff;display:inline-block;font-size:15px;font-weight:800;padding:14px 18px;text-decoration:none;">Complete pre-registration</a></p>
                                <p style="margin:0 0 8px;color:#475467;font-size:13px;line-height:1.6;">If the button does not open, copy and paste this link into your browser:</p>
                                <p style="margin:0;color:#1d4ed8;font-size:13px;line-height:1.6;word-break:break-word;"><a href="%s" style="color:#1d4ed8;text-decoration:none;">%s</a></p>
                              </td>
                            </tr>
                            <tr>
                              <td style="background:#f8fafc;border-top:1px solid #e4e7ec;padding:18px 28px;">
                                <p style="margin:0;color:#667085;font-size:12px;line-height:1.5;">This invite expires %s. AccessFlow keeps visitor access tied to the host, organization, schedule, and QR verification state.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(
                escapedHost,
                escapedOrganization,
                escapedVisitor,
                detailRow("Organization", safeOrganization(invite)),
                detailRow("Host", safeName(invite.getHostEmployeeName())),
                detailRow("Date and time", inviteSchedule(invite)),
                detailRow("Purpose", safeFallback(invite.getPurposeOfVisit(), "Visit")),
                detailRow("Location", locationText(invite)),
                detailRow("Approval status", approvalStatus(invite)),
                noteHtml,
                invite.isApprovalRequired() ? " and host approval" : "",
                qrContentId,
                escapedInviteUrl,
                escapedInviteUrl,
                escapedInviteUrl,
                escapeHtml(inviteExpiry(invite))
        );
    }

    private String superAdminCreationPlainTextBody(String recipientName, String otp) {
        return """
                AccessFlow platform-owner confirmation

                Hi %s,

                Your verification code for creating another SUPER_ADMIN account is %s.

                This code expires in 5 minutes. If you did not initiate this request, do not share this code and review platform audit logs immediately.
                """.formatted(safeName(recipientName), otp);
    }

    private String superAdminCreationHtmlBody(String recipientName, String otp) {
        String escapedName = escapeHtml(safeName(recipientName));
        String escapedOtp = escapeHtml(otp);
        return """
                <!doctype html>
                <html>
                  <body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#101828;">
                    <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:32px 16px;">
                      <tr>
                        <td align="center">
                          <table role="presentation" width="100%%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e7ec;border-radius:8px;overflow:hidden;">
                            <tr>
                              <td style="background:#101828;color:#ffffff;padding:24px 28px;">
                                <div style="font-size:13px;font-weight:700;letter-spacing:0;text-transform:uppercase;color:#bfdbfe;">AccessFlow Security</div>
                                <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Platform-owner confirmation</h1>
                              </td>
                            </tr>
                            <tr>
                              <td style="padding:28px;">
                                <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">Hi %s,</p>
                                <p style="margin:0 0 20px;font-size:16px;line-height:1.5;">Use this verification code to confirm creating another AccessFlow SUPER_ADMIN account.</p>
                                <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;color:#9a3412;font-size:32px;font-weight:800;letter-spacing:8px;padding:18px 20px;text-align:center;">%s</div>
                                <p style="margin:20px 0 0;font-size:14px;line-height:1.5;color:#475467;">This code expires in 5 minutes.</p>
                                <p style="margin:12px 0 0;font-size:14px;line-height:1.5;color:#b42318;"><strong>Security warning:</strong> If you did not initiate this request, do not share this code and review platform audit logs immediately.</p>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </body>
                </html>
                """.formatted(escapedName, escapedOtp);
    }

    private String detailRow(String label, String value) {
        return """
                                  <tr>
                                    <td style="border-bottom:1px solid #e4e7ec;color:#667085;font-size:13px;padding:10px 0;width:38%%;">%s</td>
                                    <td style="border-bottom:1px solid #e4e7ec;color:#101828;font-size:14px;font-weight:700;padding:10px 0;">%s</td>
                                  </tr>
                """.formatted(escapeHtml(label), escapeHtml(value));
    }

    private String inviteQrBase64(String inviteUrl) {
        try {
            BitMatrix matrix = new QRCodeWriter().encode(inviteUrl, BarcodeFormat.QR_CODE, 320, 320);
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            MatrixToImageWriter.writeToStream(matrix, "PNG", output);
            return Base64.getEncoder().encodeToString(output.toByteArray());
        } catch (WriterException | IOException ex) {
            throw new IllegalStateException("Unable to render invite QR for email.", ex);
        }
    }

    private String inviteSchedule(VisitorInvite invite) {
        if (invite.getScheduledStartTime() == null) {
            return "Schedule pending";
        }
        ZoneId zone = safeZone(invite.getTimezone(), invite.getOrganizationTimezone());
        String start = INVITE_DATE_FORMATTER.withZone(zone).format(invite.getScheduledStartTime());
        if (invite.getScheduledEndTime() == null) {
            return start;
        }
        String end = INVITE_DATE_FORMATTER.withZone(zone).format(invite.getScheduledEndTime());
        return start + " to " + end;
    }

    private String inviteExpiry(VisitorInvite invite) {
        if (invite.getExpiresAt() == null) {
            return "after the configured invite window";
        }
        return INVITE_DATE_FORMATTER.withZone(safeZone(invite.getTimezone(), invite.getOrganizationTimezone())).format(invite.getExpiresAt());
    }

    private ZoneId safeZone(String preferred, String fallback) {
        try {
            return ZoneId.of(isBlank(preferred) ? blankToDefault(fallback, "UTC") : preferred.trim());
        } catch (RuntimeException ex) {
            return ZoneId.of("UTC");
        }
    }

    private String approvalStatus(VisitorInvite invite) {
        return invite.isApprovalRequired()
                ? "Host approval required after pre-registration"
                : "Pre-approved after registration";
    }

    private String locationText(VisitorInvite invite) {
        String organization = safeOrganization(invite);
        String code = isBlank(invite.getOrganizationCode()) ? "" : " (" + invite.getOrganizationCode().trim() + ")";
        return organization + code;
    }

    private String safeOrganization(VisitorInvite invite) {
        return safeFallback(invite.getOrganizationName(), safeFallback(invite.getOrganizationCode(), "AccessFlow site"));
    }

    private String safeFallback(String value, String fallback) {
        return isBlank(value) ? fallback : value.trim();
    }

    private String required(String value, String message) {
        if (isBlank(value)) {
            throw new IllegalArgumentException(message);
        }
        return value.trim();
    }

    private String safeName(String value) {
        return isBlank(value) ? "there" : value.trim();
    }

    private String blankToDefault(String value, String fallback) {
        return isBlank(value) ? fallback : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String escapeHtml(String value) {
        return String.valueOf(value == null ? "" : value)
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private record InlineAttachment(String contentId, String filename, String contentType, String contentBase64) {
    }
}
