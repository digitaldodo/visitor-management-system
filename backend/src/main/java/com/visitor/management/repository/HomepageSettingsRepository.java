package com.visitor.management.repository;

import com.visitor.management.entity.HomepageSettings;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface HomepageSettingsRepository extends MongoRepository<HomepageSettings, String> {
}
