package com.visitor.management.contract;

import com.visitor.management.dto.formatting.VisitorDtoFormatting;
import com.visitor.management.entity.VisitorStatus;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VisitorDtoFormattingContractTest {

    @Test
    void visitorStatusLabelsRemainStableForApiDtos() {
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.PENDING)).isEqualTo("Pending approval");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.APPROVED)).isEqualTo("Approved");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.REJECTED)).isEqualTo("Denied");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.CHECKED_IN)).isEqualTo("Checked in");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.CHECKED_OUT)).isEqualTo("Checked out");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.EXPIRED)).isEqualTo("Expired");
        assertThat(VisitorDtoFormatting.displayStatus(VisitorStatus.SUSPENDED)).isEqualTo("Suspended");
    }
}
