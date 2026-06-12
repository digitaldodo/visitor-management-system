package com.visitor.management.dto.formatting;

import com.visitor.management.entity.VisitorStatus;

public final class VisitorDtoFormatting {

    private VisitorDtoFormatting() {
    }

    public static String displayStatus(VisitorStatus status) {
        return switch (status) {
            case PENDING -> "Pending approval";
            case APPROVED -> "Approved";
            case REJECTED -> "Denied";
            case CHECKED_IN -> "Checked in";
            case CHECKED_OUT -> "Checked out";
            case EXPIRED -> "Expired";
            case SUSPENDED -> "Suspended";
        };
    }
}
