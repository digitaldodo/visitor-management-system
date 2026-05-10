package com.visitor.management.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.mongodb.config.EnableMongoAuditing;
import org.springframework.context.annotation.Profile;

@Configuration
@EnableMongoAuditing
@Profile("!test & !local")
public class MongoConfig {
}
