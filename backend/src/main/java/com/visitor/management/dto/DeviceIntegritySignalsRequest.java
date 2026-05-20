package com.visitor.management.dto;

import jakarta.validation.constraints.Size;

import java.util.List;

public record DeviceIntegritySignalsRequest(
        boolean rootedOrJailbroken,
        boolean emulator,
        boolean debugBuild,
        boolean suspicious,
        @Size(max = 12) List<@Size(max = 40) String> reasons
) {
}
