package com.visitor.management.dto;

import java.util.List;

public record DeviceIntegritySignalsResponse(
        boolean rootedOrJailbroken,
        boolean emulator,
        boolean debugBuild,
        boolean suspicious,
        List<String> reasons
) {
}
