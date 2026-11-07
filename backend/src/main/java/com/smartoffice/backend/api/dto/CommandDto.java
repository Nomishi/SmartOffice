package com.smartoffice.backend.api.dto;

import com.smartoffice.backend.domain.Command;
import com.smartoffice.backend.domain.CommandStatus;

import java.time.Instant;

public record CommandDto(
        String commandId,
        String deviceId,
        String target,
        String action,
        CommandStatus status,
        String issuedBy,
        Instant issuedAt,
        Instant ackAt,
        Long latencyMs
) {
    public static CommandDto from(Command c) {
        return new CommandDto(c.getCommandId(), c.getDeviceId(), c.getTarget(), c.getAction(),
                c.getStatus(), c.getIssuedBy(), c.getIssuedAt(), c.getAckAt(), c.getLatencyMs());
    }
}
