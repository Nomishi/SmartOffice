package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.Command;
import com.smartoffice.backend.domain.CommandStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface CommandRepository extends JpaRepository<Command, Long> {

    Optional<Command> findByCommandId(String commandId);

    Optional<Command> findByIdempotencyKey(String idempotencyKey);

    Page<Command> findByDeviceId(String deviceId, Pageable pageable);

    List<Command> findByStatusAndLastSentAtBefore(CommandStatus status, Instant before);

    List<Command> findByStatus(CommandStatus status);
}
