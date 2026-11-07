package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "audit_logs")
@Getter
@Setter
@NoArgsConstructor
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long logId;

    @Column(name = "user_id")
    private Long userId;

    @Column(nullable = false, length = 64)
    private String action;

    @Column(length = 128)
    private String target;

    @Column(length = 64)
    private String result;

    @Column(nullable = false)
    private Instant timestamp = Instant.now();
}
