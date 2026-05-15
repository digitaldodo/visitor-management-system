package com.visitor.management.service;

import com.visitor.management.config.AppProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

@Service
public class SendGridEmailService implements EmailService {

    private static final Logger log = LoggerFactory.getLogger(SendGridEmailService.class);

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
        if (isBlank(properties.getApiKey()) || isBlank(properties.getFromEmail())) {
            log.warn("SendGrid is not configured. {} could not be delivered for {}.", description, toEmail);
            return;
        }

        Map<String, Object> payload = Map.of(
                "personalizations", List.of(Map.of(
                        "to", List.of(Map.of("email", toEmail, "name", recipientName)),
                        "subject", subject
                )),
                "from", Map.of("email", properties.getFromEmail(), "name", blankToDefault(properties.getFromName(), "AccessFlow Security")),
                "content", List.of(
                        Map.of("type", "text/plain", "value", plainText),
                        Map.of("type", "text/html", "value", html)
                )
        );

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
        return value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }
}
