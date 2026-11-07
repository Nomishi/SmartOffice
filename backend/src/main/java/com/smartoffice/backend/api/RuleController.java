package com.smartoffice.backend.api;

import com.smartoffice.backend.api.dto.PageResponse;
import com.smartoffice.backend.api.dto.RuleDto;
import com.smartoffice.backend.api.dto.RuleUpdateRequest;
import com.smartoffice.backend.service.RuleService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/rules")
@RequiredArgsConstructor
public class RuleController {

    private final RuleService ruleService;

    @GetMapping
    public PageResponse<RuleDto> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        List<RuleDto> all = ruleService.list();
        int safeSize = Math.min(Math.max(size, 1), 100);
        int fromIndex = Math.min(page * safeSize, all.size());
        int toIndex = Math.min(fromIndex + safeSize, all.size());
        return PageResponse.of(all.subList(fromIndex, toIndex), page, safeSize, all.size());
    }

    @PutMapping("/{id}")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('ADMIN', 'OPERATOR')")
    public RuleDto update(@PathVariable Long id, @RequestBody RuleUpdateRequest request) {
        return ruleService.update(id, request);
    }
}
