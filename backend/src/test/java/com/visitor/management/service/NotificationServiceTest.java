package com.visitor.management.service;

import com.visitor.management.config.AppProperties;
import com.visitor.management.entity.Notification;
import com.visitor.management.entity.NotificationType;
import com.visitor.management.entity.Role;
import com.visitor.management.entity.User;
import com.visitor.management.entity.Visitor;
import com.visitor.management.entity.VisitorStatus;
import com.visitor.management.repository.MobileDeviceRegistrationRepository;
import com.visitor.management.repository.NotificationRepository;
import com.visitor.management.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class NotificationServiceTest {

    @Mock
    private NotificationRepository notificationRepository;

    @Mock
    private UserRepository userRepository;

    @Mock
    private NotificationEmailDispatcher notificationEmailDispatcher;

    @Mock
    private MobileDeviceRegistrationRepository mobileDeviceRegistrationRepository;

    @Mock
    private FirebaseCloudMessagingDispatcher firebaseCloudMessagingDispatcher;

    private AppProperties appProperties;
    private NotificationService notificationService;

    @BeforeEach
    void setUp() {
        appProperties = new AppProperties();
        appProperties.getNotifications().setPushEnabled(false);
        notificationService = new NotificationService(
                notificationRepository,
                userRepository,
                notificationEmailDispatcher,
                mobileDeviceRegistrationRepository,
                firebaseCloudMessagingDispatcher,
                appProperties
        );
    }

    @Test
    void notifyUserRejectsCrossOrganizationVisitorNotification() {
        User recipient = employee("employee-1", "org-b");
        Visitor visitor = visitor("visitor-1", "org-a", "employee-1");

        when(userRepository.findById("employee-1")).thenReturn(Optional.of(recipient));

        Notification saved = notificationService.notifyUser(
                "employee-1",
                NotificationType.VISITOR_ARRIVAL_REMINDER,
                "Visitor arriving soon",
                "Your visitor is arriving in 15 minutes.",
                visitor,
                "/employee/requests",
                null,
                null,
                "visitor:visitor-1:arrival:15",
                "VISITOR",
                "visitor-1"
        );

        assertThat(saved).isNull();
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    @Test
    void notifyUserStoresOrganizationAndDedupeMetadata() {
        User recipient = employee("employee-1", "org-a");
        Visitor visitor = visitor("visitor-1", "org-a", "employee-1");

        when(notificationRepository.existsByDedupeKey("visitor:visitor-1:arrival:15")).thenReturn(false);
        when(userRepository.findById("employee-1")).thenReturn(Optional.of(recipient));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(invocation -> invocation.getArgument(0));

        notificationService.notifyUser(
                "employee-1",
                NotificationType.VISITOR_ARRIVAL_REMINDER,
                "Visitor arriving soon",
                "Your visitor is arriving in 15 minutes.",
                visitor,
                "/employee/requests",
                null,
                null,
                "visitor:visitor-1:arrival:15",
                "VISITOR",
                "visitor-1"
        );

        ArgumentCaptor<Notification> notificationCaptor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(notificationCaptor.capture());
        Notification notification = notificationCaptor.getValue();
        assertThat(notification.getOrganizationId()).isEqualTo("org-a");
        assertThat(notification.getDedupeKey()).isEqualTo("visitor:visitor-1:arrival:15");
        assertThat(notification.getTargetType()).isEqualTo("VISITOR");
        assertThat(notification.getTargetId()).isEqualTo("visitor-1");
    }

    @Test
    void notifyUserSkipsExistingDedupeKeyBeforePersisting() {
        when(notificationRepository.existsByDedupeKey("visitor:visitor-1:arrival:15")).thenReturn(true);

        Notification saved = notificationService.notifyUser(
                "employee-1",
                NotificationType.VISITOR_ARRIVAL_REMINDER,
                "Visitor arriving soon",
                "Your visitor is arriving in 15 minutes.",
                visitor("visitor-1", "org-a", "employee-1"),
                "/employee/requests",
                null,
                "org-a",
                "visitor:visitor-1:arrival:15",
                "VISITOR",
                "visitor-1"
        );

        assertThat(saved).isNull();
        verify(userRepository, never()).findById("employee-1");
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    @Test
    void notifyUserCreatesFallbackDedupeKeyForTargetedNotifications() {
        User recipient = employee("employee-1", "org-a");
        Visitor visitor = visitor("visitor-1", "org-a", "employee-1");

        when(userRepository.findById("employee-1")).thenReturn(Optional.of(recipient));
        when(notificationRepository.save(any(Notification.class))).thenAnswer(invocation -> invocation.getArgument(0));

        notificationService.notifyUser(
                "employee-1",
                NotificationType.VISITOR_APPROVAL_REQUEST,
                "Approval required",
                "A visitor needs approval.",
                visitor,
                "/employee/requests"
        );

        ArgumentCaptor<Notification> notificationCaptor = ArgumentCaptor.forClass(Notification.class);
        verify(notificationRepository).save(notificationCaptor.capture());
        assertThat(notificationCaptor.getValue().getDedupeKey())
                .isEqualTo("notification:employee-1:VISITOR_APPROVAL_REQUEST:VISITOR:visitor-1");
    }

    @Test
    void notifyUserSkipsStaleVisitorReminderAfterCheckIn() {
        User recipient = admin("admin-1", "org-a");
        Visitor visitor = visitor("visitor-1", "org-a", "employee-1");
        visitor.setStatus(VisitorStatus.CHECKED_IN);
        visitor.setCheckInTime(java.time.Instant.now());

        when(userRepository.findById("admin-1")).thenReturn(Optional.of(recipient));

        Notification saved = notificationService.notifyUser(
                "admin-1",
                NotificationType.VISITOR_ARRIVAL_REMINDER,
                "Visitor arriving soon",
                "Your visitor is arriving in 15 minutes.",
                visitor,
                "/employee/requests"
        );

        assertThat(saved).isNull();
        verify(notificationRepository, never()).save(any(Notification.class));
    }

    private User employee(String id, String organizationId) {
        User user = new User();
        user.setId(id);
        user.setEmail(id + "@example.com");
        user.setFullName("Employee One");
        user.setOrganizationId(organizationId);
        user.setRoles(Set.of(Role.EMPLOYEE));
        user.setNotificationEmailEnabled(false);
        user.setNotificationInAppEnabled(true);
        return user;
    }

    private User admin(String id, String organizationId) {
        User user = employee(id, organizationId);
        user.setRoles(Set.of(Role.ADMIN));
        return user;
    }

    private Visitor visitor(String id, String organizationId, String hostEmployeeId) {
        Visitor visitor = new Visitor();
        visitor.setId(id);
        visitor.setFullName("Virat Kohli");
        visitor.setOrganizationId(organizationId);
        visitor.setHostEmployeeId(hostEmployeeId);
        return visitor;
    }
}
