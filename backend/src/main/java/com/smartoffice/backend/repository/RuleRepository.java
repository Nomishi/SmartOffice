package com.smartoffice.backend.repository;

import com.smartoffice.backend.domain.Rule;
import com.smartoffice.backend.domain.RuleType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RuleRepository extends JpaRepository<Rule, Long> {

    List<Rule> findAllByOrderByRuleIdAsc();

    List<Rule> findByEnabledTrue();

    Optional<Rule> findByType(RuleType type);
}
