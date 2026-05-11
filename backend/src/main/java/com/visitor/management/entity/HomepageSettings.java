package com.visitor.management.entity;

import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.Id;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Document(collection = "homepage_settings")
public class HomepageSettings {

    @Id
    private String id;

    private boolean statsVisible;

    private boolean publicCountersVisible;

    private boolean featuredMetricsVisible;

    private boolean announcementVisible;

    private String announcementTitle;

    private String announcementBody;

    private List<String> featuredMetricKeys = new ArrayList<>();

    private List<String> publicMetricKeys = new ArrayList<>();

    private String updatedBy;

    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public boolean isStatsVisible() {
        return statsVisible;
    }

    public void setStatsVisible(boolean statsVisible) {
        this.statsVisible = statsVisible;
    }

    public boolean isPublicCountersVisible() {
        return publicCountersVisible;
    }

    public void setPublicCountersVisible(boolean publicCountersVisible) {
        this.publicCountersVisible = publicCountersVisible;
    }

    public boolean isFeaturedMetricsVisible() {
        return featuredMetricsVisible;
    }

    public void setFeaturedMetricsVisible(boolean featuredMetricsVisible) {
        this.featuredMetricsVisible = featuredMetricsVisible;
    }

    public boolean isAnnouncementVisible() {
        return announcementVisible;
    }

    public void setAnnouncementVisible(boolean announcementVisible) {
        this.announcementVisible = announcementVisible;
    }

    public String getAnnouncementTitle() {
        return announcementTitle;
    }

    public void setAnnouncementTitle(String announcementTitle) {
        this.announcementTitle = announcementTitle;
    }

    public String getAnnouncementBody() {
        return announcementBody;
    }

    public void setAnnouncementBody(String announcementBody) {
        this.announcementBody = announcementBody;
    }

    public List<String> getFeaturedMetricKeys() {
        return featuredMetricKeys;
    }

    public void setFeaturedMetricKeys(List<String> featuredMetricKeys) {
        this.featuredMetricKeys = featuredMetricKeys;
    }

    public List<String> getPublicMetricKeys() {
        return publicMetricKeys;
    }

    public void setPublicMetricKeys(List<String> publicMetricKeys) {
        this.publicMetricKeys = publicMetricKeys;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    public void setUpdatedBy(String updatedBy) {
        this.updatedBy = updatedBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(Instant updatedAt) {
        this.updatedAt = updatedAt;
    }
}
