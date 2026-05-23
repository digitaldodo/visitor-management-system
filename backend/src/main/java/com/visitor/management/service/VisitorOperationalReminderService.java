package com.visitor.management.service;

import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorInvite;
import com.visitor.management.entity.VisitorInviteStatus;
import com.visitor.management.entity.VisitorStatus;
import org.springframework.data.domain.Sort;
import org.springframework.data.mongodb.core.MongoTemplate;
import org.springframework.data.mongodb.core.query.Criteria;
import org.springframework.data.mongodb.core.query.Query;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.FormatStyle;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class VisitorOperationalReminderService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter
            .ofLocalizedTime(FormatStyle.SHORT)
            .withLocale(Locale.ENGLISH);
    private static final String EMPLOYEE_VISITOR_ACTION_URL = "/employee/requests";
    private static final String SECURITY_VISITOR_ACTION_URL = "/pages/security/#visitors";

    private final MongoTemplate mongoTemplate;
    private final NotificationService notificationService;
    private final AppProperties appProperties;

    public VisitorOperationalReminderService(
            MongoTemplate mongoTemplate,
            NotificationService notificationService,
            AppProperties appProperties
    ) {
        this.mongoTemplate = mongoTemplate;
        this.notificationService = notificationService;
        this.appProperties = appProperties;
    }

    public int dispatchDueReminders() {
        AppProperties.Notifications.Reminders reminders = appProperties.getNotifications().getReminders();
        if (!reminders.isEnabled()) {
            return 0;
        }

        Instant now = Instant.now();
        int limit = Math.max(1, reminders.getMaxDispatchPerSweep());
        int dispatched = 0;
        dispatched += dispatchCheckInWindowReminders(now, reminders, limit - dispatched);
        dispatched += dispatchArrivalReminders(now, reminders, limit - dispatched);
        dispatched += dispatchInviteRegistrationReminders(now, reminders, limit - dispatched);
        dispatched += dispatchOverdueReminders(now, reminders, limit - dispatched);
        return dispatched;
    }

    private int dispatchArrivalReminders(Instant now, AppProperties.Notifications.Reminders reminders, int remaining) {
        if (remaining <= 0) {
            return 0;
        }

        List<Integer> reminderMinutes = normalizedReminderMinutes(reminders.getBeforeStartMinutes());
        if (reminderMinutes.isEmpty()) {
            return 0;
        }

        int maxBeforeMinutes = reminderMinutes.stream().max(Integer::compareTo).orElse(0);
        Instant lookAhead = now.plus(Duration.ofMinutes(Math.max(maxBeforeMinutes, reminders.getLookAheadMinutes())));
        Query query = new Query()
                .addCriteria(Criteria.where("status").is(VisitorStatus.APPROVED))
                .addCriteria(Criteria.where("scheduledStartTime").gte(now.minus(Duration.ofMinutes(1))).lte(lookAhead))
                .addCriteria(Criteria.where("hostEmployeeId").ne(null))
                .with(Sort.by(Sort.Direction.ASC, "scheduledStartTime"))
                .limit(Math.max(1, remaining * 3));

        int dispatched = 0;
        for (Visitor visitor : mongoTemplate.find(query, Visitor.class)) {
            if (dispatched >= remaining || visitor.getScheduledStartTime() == null || visitor.getCheckInTime() != null) {
                continue;
            }

            Integer dueMinutes = mostRelevantDueMinute(now, visitor.getScheduledStartTime(), reminderMinutes);
            if (dueMinutes == null) {
                continue;
            }

            String title = dueMinutes == 0 ? "Visitor scheduled now" : "Visitor arriving soon";
            String message = dueMinutes == 0
                    ? "Your visitor %s is scheduled for now.".formatted(visitor.getFullName())
                    : "Your visitor %s is arriving in %d minutes.".formatted(visitor.getFullName(), dueMinutes);
            if (sendHostVisitorNotification(
                    visitor,
                    NotificationType.VISITOR_ARRIVAL_REMINDER,
                    title,
                    messageWithNote(message, visitor.getNotes()),
                    "visitor:%s:arrival:%d:%d".formatted(visitor.getId(), visitor.getScheduledStartTime().toEpochMilli(), dueMinutes)
            )) {
                dispatched++;
            }
        }
        return dispatched;
    }

    private int dispatchCheckInWindowReminders(Instant now, AppProperties.Notifications.Reminders reminders, int remaining) {
        if (remaining <= 0 || reminders.getCheckInWindowMinutesBefore() < 0) {
            return 0;
        }

        Instant lookAhead = now.plus(Duration.ofMinutes(Math.max(reminders.getCheckInWindowMinutesBefore(), reminders.getLookAheadMinutes())));
        Query query = new Query()
                .addCriteria(Criteria.where("status").is(VisitorStatus.APPROVED))
                .addCriteria(Criteria.where("accessWindowStartTime").gte(now.minus(Duration.ofMinutes(1))).lte(lookAhead))
                .addCriteria(Criteria.where("hostEmployeeId").ne(null))
                .with(Sort.by(Sort.Direction.ASC, "accessWindowStartTime"))
                .limit(Math.max(1, remaining * 2));

        int dispatched = 0;
        for (Visitor visitor : mongoTemplate.find(query, Visitor.class)) {
            if (dispatched >= remaining || visitor.getAccessWindowStartTime() == null || visitor.getCheckInTime() != null) {
                continue;
            }
            Instant reminderAt = visitor.getAccessWindowStartTime().minus(Duration.ofMinutes(reminders.getCheckInWindowMinutesBefore()));
            if (now.isBefore(reminderAt)) {
                continue;
            }

            String message = "Visitor check-in window begins shortly for %s.".formatted(visitor.getFullName());
            if (sendHostVisitorNotification(
                    visitor,
                    NotificationType.VISITOR_CHECK_IN_WINDOW_REMINDER,
                    "Visitor check-in window opening",
                    messageWithNote(message, visitor.getNotes()),
                    "visitor:%s:check-in-window:%d".formatted(visitor.getId(), visitor.getAccessWindowStartTime().toEpochMilli())
            )) {
                dispatched++;
            }
        }
        return dispatched;
    }

    private int dispatchInviteRegistrationReminders(Instant now, AppProperties.Notifications.Reminders reminders, int remaining) {
        if (remaining <= 0 || reminders.getInviteRegistrationReminderMinutesBefore() <= 0) {
            return 0;
        }

        Instant lookAhead = now.plus(Duration.ofMinutes(Math.max(reminders.getInviteRegistrationReminderMinutesBefore(), reminders.getLookAheadMinutes())));
        Query query = new Query()
                .addCriteria(Criteria.where("status").in(
                        VisitorInviteStatus.INVITED,
                        VisitorInviteStatus.PRE_REGISTRATION_PENDING,
                        VisitorInviteStatus.SENT,
                        VisitorInviteStatus.VIEWED
                ))
                .addCriteria(Criteria.where("scheduledStartTime").gte(now.minus(Duration.ofMinutes(1))).lte(lookAhead))
                .addCriteria(Criteria.where("hostEmployeeId").ne(null))
                .with(Sort.by(Sort.Direction.ASC, "scheduledStartTime"))
                .limit(Math.max(1, remaining * 2));

        int dispatched = 0;
        for (VisitorInvite invite : mongoTemplate.find(query, VisitorInvite.class)) {
            if (dispatched >= remaining || invite.getScheduledStartTime() == null || invite.getExpiresAt() == null || !invite.getExpiresAt().isAfter(now)) {
                continue;
            }
            Instant reminderAt = invite.getScheduledStartTime().minus(Duration.ofMinutes(reminders.getInviteRegistrationReminderMinutesBefore()));
            if (now.isBefore(reminderAt)) {
                continue;
            }

            String message = "%s has not completed pre-registration for the %s visit yet."
                    .formatted(invite.getVisitorName(), formatTime(invite.getScheduledStartTime(), invite.getTimezone()));
            if (notificationService.notifyUser(
                    invite.getHostEmployeeId(),
                    NotificationType.VISITOR_INVITE_REGISTRATION_REMINDER,
                    "Visitor pre-registration pending",
                    messageWithNote(message, invite.getNote()),
                    null,
                    EMPLOYEE_VISITOR_ACTION_URL,
                    null,
                    invite.getOrganizationId(),
                    "invite:%s:registration-reminder:%d".formatted(invite.getId(), invite.getScheduledStartTime().toEpochMilli()),
                    "VISITOR_INVITE",
                    invite.getId()
            ) != null) {
                dispatched++;
            }
        }
        return dispatched;
    }

    private int dispatchOverdueReminders(Instant now, AppProperties.Notifications.Reminders reminders, int remaining) {
        if (remaining <= 0) {
            return 0;
        }

        Duration grace = Duration.ofMinutes(reminders.getOverdueGraceMinutes());
        Query awaitingCheckInQuery = new Query()
                .addCriteria(Criteria.where("status").is(VisitorStatus.APPROVED))
                .addCriteria(Criteria.where("scheduledStartTime").lte(now.minus(grace)))
                .with(Sort.by(Sort.Direction.ASC, "scheduledStartTime"))
                .limit(Math.max(1, remaining));

        int dispatched = 0;
        for (Visitor visitor : mongoTemplate.find(awaitingCheckInQuery, Visitor.class)) {
            if (dispatched >= remaining || visitor.getCheckInTime() != null) {
                continue;
            }
            if (visitor.getAccessWindowEndTime() != null && !visitor.getAccessWindowEndTime().isAfter(now)) {
                continue;
            }
            String message = "%s has not checked in for the scheduled %s visit."
                    .formatted(visitor.getFullName(), formatTime(visitor.getScheduledStartTime(), visitor.getScheduledTimezone()));
            dispatched += sendOverdueNotification(visitor, "Visitor arrival overdue", message, "arrival-overdue");
        }

        if (dispatched >= remaining) {
            return dispatched;
        }

        Query stillOnsiteQuery = new Query()
                .addCriteria(Criteria.where("status").is(VisitorStatus.CHECKED_IN))
                .addCriteria(Criteria.where("scheduledEndTime").lte(now.minus(grace)))
                .with(Sort.by(Sort.Direction.ASC, "scheduledEndTime"))
                .limit(Math.max(1, remaining - dispatched));

        for (Visitor visitor : mongoTemplate.find(stillOnsiteQuery, Visitor.class)) {
            if (dispatched >= remaining || visitor.getCheckOutTime() != null) {
                continue;
            }
            String message = "%s is still checked in beyond the scheduled visit window.".formatted(visitor.getFullName());
            dispatched += sendOverdueNotification(visitor, "Visitor visit overdue", message, "onsite-overdue");
        }
        return dispatched;
    }

    private int sendOverdueNotification(Visitor visitor, String title, String message, String keySuffix) {
        String dedupeKey = "visitor:%s:%s:%d".formatted(visitor.getId(), keySuffix, dueReference(visitor));
        int sent = 0;
        if (sendHostVisitorNotification(visitor, NotificationType.VISITOR_OVERDUE, title, messageWithNote(message, visitor.getNotes()), dedupeKey + ":host")) {
            sent++;
        }
        sent += notificationService.notifyOrganizationRoles(
                visitor.getOrganizationId(),
                Set.of(Role.SECURITY_GUARD, Role.ADMIN),
                visitor.getHostEmployeeId(),
                NotificationType.VISITOR_OVERDUE,
                title,
                message,
                visitor,
                SECURITY_VISITOR_ACTION_URL,
                visitor.getHostEmployee(),
                dedupeKey + ":ops",
                "VISITOR",
                visitor.getId()
        );
        return sent > 0 ? 1 : 0;
    }

    private boolean sendHostVisitorNotification(Visitor visitor, NotificationType type, String title, String message, String dedupeKey) {
        if (visitor.getHostEmployeeId() == null || visitor.getHostEmployeeId().isBlank()) {
            return false;
        }
        return notificationService.notifyUser(
                visitor.getHostEmployeeId(),
                type,
                title,
                message,
                visitor,
                EMPLOYEE_VISITOR_ACTION_URL,
                null,
                visitor.getOrganizationId(),
                dedupeKey + ":recipient:" + visitor.getHostEmployeeId(),
                "VISITOR",
                visitor.getId()
        ) != null;
    }

    private List<Integer> normalizedReminderMinutes(List<Integer> configuredMinutes) {
        if (configuredMinutes == null) {
            return List.of();
        }
        return configuredMinutes.stream()
                .filter(value -> value != null && value >= 0)
                .distinct()
                .sorted(Comparator.naturalOrder())
                .toList();
    }

    private Integer mostRelevantDueMinute(Instant now, Instant scheduledStart, List<Integer> reminderMinutes) {
        return reminderMinutes.stream()
                .filter(minutes -> !now.isBefore(scheduledStart.minus(Duration.ofMinutes(minutes))))
                .min(Integer::compareTo)
                .orElse(null);
    }

    private long dueReference(Visitor visitor) {
        Instant reference = visitor.getScheduledEndTime() != null ? visitor.getScheduledEndTime() : visitor.getScheduledStartTime();
        return reference == null ? 0L : reference.toEpochMilli();
    }

    private String formatTime(Instant value, String timezone) {
        if (value == null) {
            return "scheduled";
        }
        ZoneId zoneId = ZoneId.systemDefault();
        String normalizedTimezone = trimToNull(timezone);
        if (normalizedTimezone != null) {
            try {
                zoneId = ZoneId.of(normalizedTimezone);
            } catch (Exception ignored) {
                zoneId = ZoneId.systemDefault();
            }
        }
        return TIME_FORMATTER.withZone(zoneId).format(value);
    }

    private String messageWithNote(String message, String note) {
        String normalizedNote = trimToNull(note);
        if (normalizedNote == null) {
            return message;
        }
        return "%s Note: %s".formatted(message, normalizedNote.length() > 120 ? normalizedNote.substring(0, 120) : normalizedNote);
    }

    private String trimToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
