package com.smartoffice.backend.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

@Entity
@Table(name = "rules")
@Getter
@Setter
@NoArgsConstructor
public class Rule {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long ruleId;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, unique = true, length = 32)
    private RuleType type;

    @Column(nullable = false)
    private boolean enabled = true;

    /** JSON object, ví dụ {"thresholdC":30,"consecutiveSamples":3}. */
    @Column(name = "params_json", columnDefinition = "text")
    private String paramsJson = "{}";

    /** JSON object, ví dụ {"alert":true,"severity":"MEDIUM"}. */
    @Column(name = "action_json", columnDefinition = "text")
    private String actionJson = "{}";

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
