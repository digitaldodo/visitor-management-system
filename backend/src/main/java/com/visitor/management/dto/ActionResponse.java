package com.visitor.management.dto;

public record ActionResponse(boolean acknowledged) {
    public static ActionResponse ok() {
        return new ActionResponse(true);
    }
}
