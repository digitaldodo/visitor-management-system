package com.visitor.management.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.lang.management.ManagementFactory;
import java.util.Arrays;

@Component
public class DeploymentStartupLogger {

    private static final Logger log = LoggerFactory.getLogger(DeploymentStartupLogger.class);

    private final Environment environment;

    public DeploymentStartupLogger(Environment environment) {
        this.environment = environment;
    }

    @EventListener
    public void onWebServerInitialized(WebServerInitializedEvent event) {
        String configuredPort = environment.getProperty("PORT", "not-set");
        String serverAddress = environment.getProperty("server.address", "0.0.0.0");
        log.info(
                "AccessFlow backend listening on {}:{} (PORT={}, activeProfiles={})",
                serverAddress,
                event.getWebServer().getPort(),
                configuredPort,
                Arrays.toString(environment.getActiveProfiles())
        );
    }

    @EventListener
    public void onApplicationReady(ApplicationReadyEvent event) {
        log.info(
                "AccessFlow backend ready in {} ms with health endpoints at /api/v1/health and /api/v1/health/live",
                ManagementFactory.getRuntimeMXBean().getUptime()
        );
    }
}
