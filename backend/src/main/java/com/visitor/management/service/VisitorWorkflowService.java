package com.visitor.management.service;

import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.repository.VisitorInviteRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Service
public class VisitorWorkflowService {

    private final VisitorInviteRepository visitorInviteRepository;

    public VisitorWorkflowService(VisitorInviteRepository visitorInviteRepository) {
        this.visitorInviteRepository = visitorInviteRepository;
    }

    public Optional<VisitorInvite> syncInviteApproved(Visitor visitor, Instant now) {
        return syncInvite(visitor, now, invite -> {
            invite.setStatus(visitor.getQrIssuedAt() == null ? VisitorInviteStatus.APPROVED : VisitorInviteStatus.BADGE_ISSUED);
            invite.setQrIssuedAt(visitor.getQrIssuedAt());
            invite.setArrivedAt(null);
        });
    }

    public Optional<VisitorInvite> syncInviteRejected(Visitor visitor, Instant now) {
        return syncInvite(visitor, now, invite -> {
            invite.setStatus(VisitorInviteStatus.REJECTED);
            invite.setQrIssuedAt(null);
            invite.setArrivedAt(null);
        });
    }

    public Optional<VisitorInvite> syncInviteCheckedIn(Visitor visitor, Instant now) {
        return syncInvite(visitor, now, invite -> {
            invite.setStatus(VisitorInviteStatus.CHECKED_IN);
            invite.setArrivedAt(visitor.getCheckInTime() == null ? now : visitor.getCheckInTime());
        });
    }

    public Optional<VisitorInvite> syncInviteCheckedOut(Visitor visitor, Instant now) {
        return syncInvite(visitor, now, invite -> invite.setStatus(VisitorInviteStatus.CHECKED_OUT));
    }

    public void expireStaleInvites() {
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

    public boolean isBadgeVisible(VisitorInvite invite) {
        return switch (canonicalStage(invite)) {
            case "BADGE_ISSUED", "CHECKED_IN", "CHECKED_OUT" -> true;
            default -> false;
        };
    }

    public String canonicalStage(VisitorInvite invite) {
        if (invite.getStatus() == VisitorInviteStatus.CHECKED_OUT) {
            return "CHECKED_OUT";
        }
        if (invite.getStatus() == VisitorInviteStatus.CHECKED_IN || invite.getStatus() == VisitorInviteStatus.ARRIVED || invite.getArrivedAt() != null) {
            return "CHECKED_IN";
        }
        if (invite.getStatus() == VisitorInviteStatus.BADGE_ISSUED
                || invite.getStatus() == VisitorInviteStatus.QR_ISSUED
                || invite.getQrIssuedAt() != null) {
            return "BADGE_ISSUED";
        }
        return switch (invite.getStatus()) {
            case INVITED, SENT -> "INVITED";
            case PRE_REGISTRATION_PENDING, VIEWED -> "PRE_REGISTRATION_PENDING";
            case PRE_REGISTERED, REGISTRATION_COMPLETED -> "PRE_REGISTERED";
            case PENDING_APPROVAL -> "PENDING_APPROVAL";
            case APPROVED -> "APPROVED";
            case REJECTED -> "REJECTED";
            case EXPIRED -> "EXPIRED";
            case REVOKED -> "REVOKED";
            default -> "INVITED";
        };
    }

    public String lifecycleLabel(VisitorInvite invite) {
        return switch (canonicalStage(invite)) {
            case "INVITED" -> "Invited";
            case "PRE_REGISTRATION_PENDING" -> "Pre-registration pending";
            case "PRE_REGISTERED" -> "Pre-registered";
            case "PENDING_APPROVAL" -> "Awaiting approval";
            case "APPROVED" -> "Approved";
            case "BADGE_ISSUED" -> "Badge issued";
            case "CHECKED_IN" -> "Checked in";
            case "CHECKED_OUT" -> "Checked out";
            case "REJECTED" -> "Rejected";
            case "EXPIRED" -> "Expired";
            case "REVOKED" -> "Revoked";
            default -> "Invite active";
        };
    }

    public String nextAction(VisitorInvite invite) {
        return switch (canonicalStage(invite)) {
            case "INVITED", "PRE_REGISTRATION_PENDING" -> "Complete visitor pre-registration.";
            case "PRE_REGISTERED", "PENDING_APPROVAL" -> "Await host or workplace approval.";
            case "APPROVED" -> "AccessFlow is preparing the approved badge.";
            case "BADGE_ISSUED" -> "Open the badge in the visitor app and present it at reception.";
            case "CHECKED_IN" -> "Follow site check-out instructions before leaving.";
            case "CHECKED_OUT" -> "Visit completed.";
            case "REJECTED" -> "Contact the host if a new visit should be requested.";
            case "EXPIRED" -> "Ask the host for a new invite.";
            case "REVOKED" -> "Contact the host if this visit is still required.";
            default -> "Review invite details.";
        };
    }

    private Optional<VisitorInvite> syncInvite(Visitor visitor, Instant now, InviteMutation mutation) {
        if (visitor == null || visitor.getId() == null) {
            return Optional.empty();
        }
        return visitorInviteRepository.findByVisitorId(visitor.getId())
                .filter(invite -> !isTerminalInvite(invite.getStatus()))
                .map(invite -> {
                    mutation.apply(invite);
                    invite.setUpdatedAt(now);
                    return visitorInviteRepository.save(invite);
                });
    }

    private boolean isTerminalInvite(VisitorInviteStatus status) {
        return status == VisitorInviteStatus.REVOKED || status == VisitorInviteStatus.EXPIRED;
    }

    @FunctionalInterface
    private interface InviteMutation {
        void apply(VisitorInvite invite);
    }
}
