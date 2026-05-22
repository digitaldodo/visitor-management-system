package com.visitor.management.service;

import com.visitor.management.config.CorsOriginResolver;
import com.visitor.management.dto.VisitorCreateRequest;
import com.visitor.management.dto.VisitorInviteCreateRequest;
import com.visitor.management.dto.VisitorInviteRegistrationRequest;
import com.visitor.management.dto.VisitorInviteResponse;
import com.visitor.management.dto.VisitorPassResponse;
import com.visitor.management.dto.VisitorResponse;
import com.visitor.management.entity.AccountStatus;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.NotificationStatus;
import com.visitor.management.entity.Organization;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.entity.VisitorType;
import com.visitor.management.exception.BadRequestException;
import com.visitor.management.exception.ResourceNotFoundException;
import com.visitor.management.repository.UserRepository;
import com.visitor.management.repository.VisitorInviteRepository;
import org.springframework.stereotype.Service;
import org.springframework.web.util.UriComponentsBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class VisitorInviteService {

    private static final long DEFAULT_INVITE_TTL_HOURS = 72;
    private static final long MAX_INVITE_TTL_HOURS = 24 * 14;

    private final VisitorInviteRepository visitorInviteRepository;
    private final UserRepository userRepository;
    private final OrganizationService organizationService;
    private final VisitorService visitorService;
    private final NotificationService notificationService;
    private final VisitorInviteEmailDispatcher visitorInviteEmailDispatcher;
    private final CorsOriginResolver corsOriginResolver;

    public VisitorInviteService(
            VisitorInviteRepository visitorInviteRepository,
            UserRepository userRepository,
            OrganizationService organizationService,
            VisitorService visitorService,
            NotificationService notificationService,
            VisitorInviteEmailDispatcher visitorInviteEmailDispatcher,
            CorsOriginResolver corsOriginResolver
    ) {
        this.visitorInviteRepository = visitorInviteRepository;
        this.userRepository = userRepository;
        this.organizationService = organizationService;
        this.visitorService = visitorService;
        this.notificationService = notificationService;
        this.visitorInviteEmailDispatcher = visitorInviteEmailDispatcher;
        this.corsOriginResolver = corsOriginResolver;
    }

    public VisitorInviteResponse create(VisitorInviteCreateRequest request, String hostEmployeeId) {
        User host = currentUser(hostEmployeeId);
        Organization organization = organizationService.requireActive(required(host.getOrganizationId(), "Host organization is required."));
        Instant now = Instant.now();
        String token = generateToken();
        long ttlHours = normalizeTtl(request.expiresInHours());
        Instant scheduledEnd = request.scheduledEndTime() != null
                ? request.scheduledEndTime()
                : request.scheduledStartTime().plus(Duration.ofMinutes(request.expectedDurationMinutes() != null ? request.expectedDurationMinutes() : 60));

        VisitorInvite invite = new VisitorInvite();
        invite.setTokenHash(hashToken(token));
        invite.setOrganizationId(organization.getId());
        invite.setOrganizationCode(organization.getCompanyCode());
        invite.setOrganizationName(organization.getCompanyName());
        invite.setOrganizationTimezone(organization.getTimezone());
        invite.setHostEmployeeId(host.getId());
        invite.setHostEmployeeName(host.getFullName());
        invite.setHostEmployeeEmail(host.getEmail());
        invite.setVisitorName(required(request.visitorName(), "Visitor name is required."));
        invite.setVisitorEmail(trimToNull(request.visitorEmail()));
        invite.setVisitorPhone(trimToNull(request.visitorPhone()));
        invite.setPhoneCountryCode(trimToNull(request.phoneCountryCode()));
        invite.setCompanyName(trimToNull(request.companyName()));
        invite.setPurposeOfVisit(required(request.purposeOfVisit(), "Purpose of visit is required."));
        invite.setVisitorType(request.visitorType() == null ? VisitorType.ONE_TIME : request.visitorType());
        invite.setScheduledStartTime(request.scheduledStartTime());
        invite.setScheduledEndTime(scheduledEnd);
        invite.setExpectedDurationMinutes(Duration.between(request.scheduledStartTime(), scheduledEnd).toMinutes());
        invite.setTimezone(trimToNull(request.timezone()) != null ? request.timezone() : organization.getTimezone());
        invite.setApprovalRequired(true);
        invite.setStatus(VisitorInviteStatus.INVITED);
        invite.setEmailStatus(trimToNull(request.visitorEmail()) == null ? NotificationStatus.FAILED : NotificationStatus.PENDING);
        invite.setLastEmailError(trimToNull(request.visitorEmail()) == null ? "Visitor email address was not provided." : null);
        invite.setExpiresAt(now.plus(Duration.ofHours(ttlHours)));
        invite.setNote(trimToNull(request.note()));
        invite.setCreatedAt(now);
        invite.setUpdatedAt(now);
        invite.setInviteUrl(inviteUrl(token));
        invite.setMobileInviteUrl(mobileInviteUrl(token));

        VisitorInvite saved = visitorInviteRepository.save(invite);
        notificationService.notifyUser(
                host.getId(),
                NotificationType.VISITOR_INVITE_SENT,
                "Visitor invite created",
                inviteCreatedMessage(saved),
                null,
                "/pages/employee/#requests",
                null,
                saved.getOrganizationId(),
                "invite:%s:created:recipient:%s".formatted(saved.getId(), host.getId()),
                "VISITOR_INVITE",
                saved.getId()
        );
        if (saved.getVisitorEmail() != null) {
            visitorInviteEmailDispatcher.deliverInviteEmailAsync(saved.getId());
            notifyRegisteredVisitorInviteReceived(saved);
        }
        return toResponse(saved, null);
    }

    public List<VisitorInviteResponse> listForHost(String hostEmployeeId) {
        expireStaleInvites();
        return visitorInviteRepository.findTop50ByHostEmployeeIdOrderByCreatedAtDesc(hostEmployeeId)
                .stream()
                .map(invite -> toResponse(invite, passIfReady(invite)))
                .toList();
    }

    public List<VisitorInviteResponse> listForOrganization(String actorId) {
        User actor = currentUser(actorId);
        expireStaleInvites();
        return visitorInviteRepository.findTop50ByOrganizationIdOrderByCreatedAtDesc(required(actor.getOrganizationId(), "Organization is required."))
                .stream()
                .map(invite -> toResponse(invite, passIfReady(invite)))
                .toList();
    }

    public List<VisitorInviteResponse> listForVisitorAccount(User account) {
        expireStaleInvites();
        String email = required(account.getEmail(), "Visitor account email is required.");
        String organizationId = trimToNull(account.getOrganizationId());
        List<VisitorInvite> invites = organizationId == null
                ? visitorInviteRepository.findTop50ByVisitorEmailIgnoreCaseOrderByCreatedAtDesc(email)
                : visitorInviteRepository.findTop50ByVisitorEmailIgnoreCaseAndOrganizationIdOrderByCreatedAtDesc(email, organizationId);
        return invites.stream()
                .map(invite -> toResponse(invite, passIfReady(invite)))
                .toList();
    }

    public VisitorInviteResponse viewPublic(String token) {
        VisitorInvite invite = requireByToken(token);
        Instant now = Instant.now();
        if (isExpired(invite, now)) {
            invite.setStatus(VisitorInviteStatus.EXPIRED);
            invite.setUpdatedAt(now);
            invite = visitorInviteRepository.save(invite);
        } else if (isInvited(invite.getStatus())) {
            invite.setStatus(VisitorInviteStatus.PRE_REGISTRATION_PENDING);
            invite.setViewedAt(now);
            invite.setUpdatedAt(now);
            invite = visitorInviteRepository.save(invite);
            notificationService.notifyUser(
                    invite.getHostEmployeeId(),
                NotificationType.VISITOR_INVITE_VIEWED,
                "Visitor invite viewed",
                "%s opened the pre-registration invite.".formatted(invite.getVisitorName()),
                    null,
                    "/pages/employee/#requests"
            );
        }
        return toResponse(invite, null);
    }

    public VisitorInviteResponse completeRegistration(String token, VisitorInviteRegistrationRequest request) {
        VisitorInvite invite = requireCompletableInvite(token);
        if (invite.getVisitorId() != null) {
            return toResponse(invite, null);
        }
        VisitorResponse visitor = visitorService.create(new VisitorCreateRequest(
                required(request.fullName(), "Full name is required."),
                firstNonBlank(request.phoneCountryCode(), invite.getPhoneCountryCode()),
                required(request.phone(), "Phone is required."),
                firstNonBlank(request.email(), invite.getVisitorEmail()),
                firstNonBlank(request.companyName(), invite.getCompanyName()),
                invite.getOrganizationCode(),
                firstNonBlank(request.purposeOfVisit(), invite.getPurposeOfVisit()),
                invite.getHostEmployeeName(),
                invite.getHostEmployeeId(),
                required(request.photoUrl(), "Visitor photo is required."),
                required(request.photoPublicId(), "Visitor photo is required."),
                request.scheduledStartTime() != null ? request.scheduledStartTime() : invite.getScheduledStartTime(),
                request.scheduledEndTime() != null ? request.scheduledEndTime() : invite.getScheduledEndTime(),
                request.expectedDurationMinutes() != null ? request.expectedDurationMinutes() : invite.getExpectedDurationMinutes(),
                firstNonBlank(request.timezone(), invite.getTimezone()),
                invite.getVisitorType(),
                null,
                invite.getHostEmployeeName(),
                null,
                null,
                null,
                null,
                List.of(),
                null,
                null,
                null,
                invite.getNote(),
                false,
                invite.getId()
        ), invite.getHostEmployeeId());

        Instant now = Instant.now();
        invite.setVisitorId(visitor.id());
        invite.setRegistrationCompletedAt(now);
        invite.setQrIssuedAt(null);
        invite.setStatus(VisitorInviteStatus.PENDING_APPROVAL);
        invite.setUpdatedAt(now);
        VisitorInvite saved = visitorInviteRepository.save(invite);

        notificationService.notifyUser(
                invite.getHostEmployeeId(),
                NotificationType.VISITOR_PRE_REGISTRATION_COMPLETED,
                "Visitor pre-registration completed",
                "%s completed pre-registration. Approval is pending; no badge has been issued yet.".formatted(visitor.fullName()),
                null,
                "/pages/employee/#requests"
        );
        notificationService.notifyOrganizationRoles(
                invite.getOrganizationId(),
                Set.of(Role.SECURITY_GUARD, Role.ADMIN),
                null,
                NotificationType.VISITOR_PRE_REGISTRATION_COMPLETED,
                "Visitor pre-registration completed",
                "%s completed invite registration for %s.".formatted(visitor.fullName(), invite.getHostEmployeeName()),
                null,
                "/pages/security/#visitors",
                invite.getHostEmployeeName()
        );
        notifyRegisteredVisitorPreRegistrationPending(saved, visitor);

        return toResponse(saved, null);
    }

    public VisitorInviteResponse revoke(String inviteId, String actorId, String reason) {
        VisitorInvite invite = visitorInviteRepository.findById(inviteId)
                .orElseThrow(() -> new ResourceNotFoundException("Visitor invite was not found."));
        User actor = currentUser(actorId);
        if (!hasInviteAccess(invite, actor)) {
            throw new ResourceNotFoundException("Visitor invite was not found.");
        }
        if (invite.getStatus() == VisitorInviteStatus.REVOKED || invite.getStatus() == VisitorInviteStatus.ARRIVED) {
            throw new BadRequestException("This invite can no longer be revoked.");
        }
        Instant now = Instant.now();
        invite.setStatus(VisitorInviteStatus.REVOKED);
        invite.setRevokedAt(now);
        invite.setRevokedBy(actorId);
        invite.setRevocationReason(required(reason, "Revocation reason is required."));
        invite.setUpdatedAt(now);
        VisitorInvite saved = visitorInviteRepository.save(invite);
        notificationService.notifyUser(
                invite.getHostEmployeeId(),
                NotificationType.VISITOR_INVITE_REVOKED,
                "Visitor invite revoked",
                "%s's visitor invite was revoked. %s".formatted(invite.getVisitorName(), invite.getRevocationReason()),
                null,
                "/pages/employee/#requests"
        );
        return toResponse(saved, passIfReady(saved));
    }

    public void validatePhotoUploadToken(String token) {
        requireUsableInvite(token);
    }

    private VisitorInvite requireUsableInvite(String token) {
        VisitorInvite invite = requireByToken(token);
        Instant now = Instant.now();
        if (invite.getStatus() == VisitorInviteStatus.REVOKED) {
            throw new BadRequestException("This visitor invite has been revoked.");
        }
        if (isExpired(invite, now)) {
            invite.setStatus(VisitorInviteStatus.EXPIRED);
            invite.setUpdatedAt(now);
            visitorInviteRepository.save(invite);
            throw new BadRequestException("This visitor invite has expired.");
        }
        if (invite.getVisitorId() != null) {
            throw new BadRequestException("This visitor invite has already been completed.");
        }
        return invite;
    }

    private VisitorInvite requireCompletableInvite(String token) {
        VisitorInvite invite = requireByToken(token);
        Instant now = Instant.now();
        if (invite.getStatus() == VisitorInviteStatus.REVOKED) {
            throw new BadRequestException("This visitor invite has been revoked.");
        }
        if (isExpired(invite, now)) {
            invite.setStatus(VisitorInviteStatus.EXPIRED);
            invite.setUpdatedAt(now);
            visitorInviteRepository.save(invite);
            throw new BadRequestException("This visitor invite has expired.");
        }
        if (invite.getVisitorId() != null) {
            return invite;
        }
        return invite;
    }

    private VisitorInvite requireByToken(String token) {
        return visitorInviteRepository.findByTokenHash(hashToken(required(token, "Invite token is required.")))
                .orElseThrow(() -> new ResourceNotFoundException("Visitor invite was not found."));
    }

    private VisitorPassResponse passIfReady(VisitorInvite invite) {
        if (invite.getVisitorId() == null || !isBadgeIssued(invite.getStatus())) {
            return null;
        }
        try {
            return visitorService.pass(invite.getVisitorId());
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private void expireStaleInvites() {
        Instant now = Instant.now();
        List<VisitorInvite> stale = visitorInviteRepository.findAllByStatusInAndExpiresAtBefore(
                List.of(
                        VisitorInviteStatus.INVITED,
                        VisitorInviteStatus.PRE_REGISTRATION_PENDING,
                        VisitorInviteStatus.SENT,
                        VisitorInviteStatus.VIEWED
                ),
                now
        );
        stale.forEach(invite -> {
            invite.setStatus(VisitorInviteStatus.EXPIRED);
            invite.setUpdatedAt(now);
        });
        if (!stale.isEmpty()) {
            visitorInviteRepository.saveAll(stale);
        }
    }

    private VisitorInviteResponse toResponse(VisitorInvite invite, VisitorPassResponse pass) {
        return new VisitorInviteResponse(
                invite.getId(),
                invite.getOrganizationId(),
                invite.getOrganizationName(),
                invite.getOrganizationCode(),
                invite.getOrganizationTimezone(),
                invite.getHostEmployeeId(),
                invite.getHostEmployeeName(),
                invite.getVisitorName(),
                invite.getVisitorEmail(),
                invite.getVisitorPhone(),
                invite.getPhoneCountryCode(),
                invite.getCompanyName(),
                invite.getPurposeOfVisit(),
                invite.getVisitorType(),
                invite.getScheduledStartTime(),
                invite.getScheduledEndTime(),
                invite.getExpectedDurationMinutes(),
                invite.getTimezone(),
                invite.isApprovalRequired(),
                invite.getStatus(),
                invite.getInviteUrl(),
                invite.getMobileInviteUrl(),
                lifecycleStage(invite),
                lifecycleLabel(invite),
                nextAction(invite),
                invite.getNote(),
                invite.getEmailStatus(),
                invite.getEmailSentAt(),
                invite.getLastEmailError(),
                invite.getExpiresAt(),
                invite.getViewedAt(),
                invite.getRegistrationCompletedAt(),
                invite.getQrIssuedAt(),
                invite.getArrivedAt(),
                invite.getRevokedAt(),
                invite.getRevocationReason(),
                invite.getVisitorId(),
                pass,
                invite.getCreatedAt(),
                invite.getUpdatedAt()
        );
    }

    private boolean hasInviteAccess(VisitorInvite invite, User actor) {
        if (actor.getId().equals(invite.getHostEmployeeId())) {
            return true;
        }
        return actor.getOrganizationId() != null
                && actor.getOrganizationId().equals(invite.getOrganizationId())
                && (actor.getRoles().contains(Role.ADMIN) || actor.getRoles().contains(Role.SUPER_ADMIN) || actor.getRoles().contains(Role.SECURITY_GUARD));
    }

    private void notifyRegisteredVisitorInviteReceived(VisitorInvite invite) {
        findRegisteredVisitor(invite).forEach(visitorAccount -> notificationService.notifyUser(
                visitorAccount.getId(),
                NotificationType.VISITOR_INVITE_SENT,
                "%s invited you to %s".formatted(invite.getHostEmployeeName(), safeOrganization(invite)),
                "Complete pre-registration before arrival. Your QR badge will be issued only after approval.",
                null,
                invite.getMobileInviteUrl() != null ? invite.getMobileInviteUrl() : invite.getInviteUrl(),
                invite.getHostEmployeeName(),
                invite.getOrganizationId(),
                "invite:%s:received:recipient:%s".formatted(invite.getId(), visitorAccount.getId()),
                "VISITOR_INVITE",
                invite.getId()
        ));
    }

    private void notifyRegisteredVisitorPreRegistrationPending(VisitorInvite invite, VisitorResponse visitor) {
        findRegisteredVisitor(invite).forEach(visitorAccount -> notificationService.notifyUser(
                visitorAccount.getId(),
                NotificationType.VISITOR_PRE_REGISTRATION_COMPLETED,
                "Pre-registration submitted",
                "Your pre-registration for %s is awaiting host or workplace approval.".formatted(safeOrganization(invite)),
                null,
                "/visitor/pass",
                invite.getHostEmployeeName(),
                invite.getOrganizationId(),
                "invite:%s:pending-approval:recipient:%s".formatted(invite.getId(), visitorAccount.getId()),
                "VISITOR",
                visitor.id()
        ));
    }

    private List<User> findRegisteredVisitor(VisitorInvite invite) {
        String visitorEmail = trimToNull(invite.getVisitorEmail());
        if (visitorEmail == null) {
            return List.of();
        }
        return userRepository.findByEmailIgnoreCase(visitorEmail)
                .filter(user -> user.isActive())
                .filter(user -> user.getRoles() != null && user.getRoles().contains(Role.VISITOR))
                .filter(user -> user.getAccountStatus() == null || user.getAccountStatus() == AccountStatus.ACTIVE)
                .filter(user -> {
                    String userOrganizationId = trimToNull(user.getOrganizationId());
                    return userOrganizationId == null || userOrganizationId.equals(invite.getOrganizationId());
                })
                .stream()
                .toList();
    }

    private boolean isInvited(VisitorInviteStatus status) {
        return status == VisitorInviteStatus.INVITED || status == VisitorInviteStatus.SENT;
    }

    private boolean isBadgeIssued(VisitorInviteStatus status) {
        return status == VisitorInviteStatus.BADGE_ISSUED || status == VisitorInviteStatus.QR_ISSUED;
    }

    private String lifecycleStage(VisitorInvite invite) {
        if (invite.getStatus() == VisitorInviteStatus.ARRIVED) {
            return "CHECKED_IN";
        }
        if (invite.getArrivedAt() != null) {
            return "CHECKED_IN";
        }
        if (isBadgeIssued(invite.getStatus()) || invite.getQrIssuedAt() != null) {
            return "BADGE_ISSUED";
        }
        return switch (invite.getStatus()) {
            case INVITED, SENT -> "INVITED";
            case PRE_REGISTRATION_PENDING, VIEWED -> "PRE_REGISTRATION_PENDING";
            case PRE_REGISTERED, REGISTRATION_COMPLETED -> "PRE_REGISTERED";
            case PENDING_APPROVAL -> "PENDING_APPROVAL";
            case APPROVED -> "APPROVED";
            case EXPIRED -> "EXPIRED";
            case REVOKED -> "REVOKED";
            default -> "INVITED";
        };
    }

    private String lifecycleLabel(VisitorInvite invite) {
        return switch (lifecycleStage(invite)) {
            case "INVITED" -> "Invited";
            case "PRE_REGISTRATION_PENDING" -> "Pre-registration pending";
            case "PRE_REGISTERED" -> "Pre-registered";
            case "PENDING_APPROVAL" -> "Awaiting approval";
            case "APPROVED" -> "Approved";
            case "BADGE_ISSUED" -> "Badge issued";
            case "CHECKED_IN" -> "Checked in";
            case "EXPIRED" -> "Expired";
            case "REVOKED" -> "Revoked";
            default -> "Invite active";
        };
    }

    private String nextAction(VisitorInvite invite) {
        return switch (lifecycleStage(invite)) {
            case "INVITED", "PRE_REGISTRATION_PENDING" -> "Complete visitor pre-registration.";
            case "PRE_REGISTERED", "PENDING_APPROVAL" -> "Await host or workplace approval.";
            case "APPROVED" -> "AccessFlow is preparing the approved badge.";
            case "BADGE_ISSUED" -> "Open the badge in the visitor app and present it at reception.";
            case "CHECKED_IN" -> "Follow site check-out instructions before leaving.";
            case "EXPIRED" -> "Ask the host for a new invite.";
            case "REVOKED" -> "Contact the host if this visit is still required.";
            default -> "Review invite details.";
        };
    }

    private String inviteCreatedMessage(VisitorInvite invite) {
        String base = "%s was invited to pre-register before arrival.".formatted(invite.getVisitorName());
        String note = trimToNull(invite.getNote());
        if (note == null) {
            return base;
        }
        return "%s Note: %s".formatted(base, note.length() > 120 ? note.substring(0, 120) : note);
    }

    private String safeOrganization(VisitorInvite invite) {
        String organizationName = trimToNull(invite.getOrganizationName());
        if (organizationName != null) {
            return organizationName;
        }
        String organizationCode = trimToNull(invite.getOrganizationCode());
        return organizationCode != null ? organizationCode : "AccessFlow";
    }

    private String inviteUrl(String token) {
        String frontendUrl = trimToNull(corsOriginResolver.resolvePublicOrigin());
        if (frontendUrl == null) {
            return "/visitor-invite/" + token;
        }
        return UriComponentsBuilder.fromUriString(frontendUrl)
                .replacePath(null)
                .pathSegment("visitor-invite", token)
                .build()
                .toUriString();
    }

    private String mobileInviteUrl(String token) {
        return "accessflow://visitor-invite/" + token;
    }

    private User currentUser(String userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User was not found."));
    }

    private boolean isExpired(VisitorInvite invite, Instant now) {
        return invite.getExpiresAt() != null && !invite.getExpiresAt().isAfter(now);
    }

    private long normalizeTtl(Long requestedTtlHours) {
        long value = requestedTtlHours == null ? DEFAULT_INVITE_TTL_HOURS : requestedTtlHours;
        return Math.max(1, Math.min(MAX_INVITE_TTL_HOURS, value));
    }

    private String generateToken() {
        return UUID.randomUUID() + "." + UUID.randomUUID();
    }

    private String hashToken(String token) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(hash);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is not available.", ex);
        }
    }

    private String firstNonBlank(String first, String fallback) {
        String normalized = trimToNull(first);
        return normalized != null ? normalized : trimToNull(fallback);
    }

    private String required(String value, String message) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            throw new BadRequestException(message);
        }
        return normalized;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
