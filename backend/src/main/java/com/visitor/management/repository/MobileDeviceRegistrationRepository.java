package com.visitor.management.repository;

import com.visitor.management.entity.MobileDeviceRegistration;
import org.springframework.data.mongodb.repository.MongoRepository;

import java.util.List;
import java.util.Optional;

public interface MobileDeviceRegistrationRepository extends MongoRepository<MobileDeviceRegistration, String> {
    Optional<MobileDeviceRegistration> findByExpoPushToken(String expoPushToken);

    Optional<MobileDeviceRegistration> findByFcmToken(String fcmToken);

    List<MobileDeviceRegistration> findAllByUserId(String userId);

    List<MobileDeviceRegistration> findAllByUserIdAndActiveTrue(String userId);

    List<MobileDeviceRegistration> findAllByUserIdAndDeviceId(String userId, String deviceId);
}
