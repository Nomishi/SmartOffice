package com.smartoffice.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.ErrorResponse;
import com.smartoffice.backend.domain.Role;
import io.jsonwebtoken.Claims;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtProvider jwtProvider;
    private final ObjectMapper objectMapper;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String token = resolveToken(request);

        if (StringUtils.hasText(token)) {
            try {
                Claims claims = jwtProvider.parseToken(token);
                Long userId = claims.get("userId", Number.class).longValue();
                String username = claims.get("username", String.class);
                String roleStr = claims.get("role", String.class);
                Role role = Role.valueOf(roleStr);

                UserPrincipal principal = new UserPrincipal(userId, username, role);
                UsernamePasswordAuthenticationToken auth =
                        new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
                auth.setDetails(new WebAuthenticationDetailsSource().buildDetails(request));
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (ApiException ex) {
                SecurityContextHolder.clearContext();
                sendError(response, ex.getHttpStatus().value(), ex.getCode(), ex.getMessage());
                return;
            } catch (Exception ex) {
                SecurityContextHolder.clearContext();
                sendError(response, HttpServletResponse.SC_UNAUTHORIZED, "UNAUTHORIZED", "Xác thực không hợp lệ");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    private String resolveToken(HttpServletRequest request) {
        String bearer = request.getHeader("Authorization");
        if (StringUtils.hasText(bearer) && bearer.startsWith("Bearer ")) {
            return bearer.substring(7);
        }
        // Chỉ chấp nhận ?token= cho endpoint /api/stream (EventSource browser không set được header)
        if (request.getRequestURI().startsWith("/api/stream")) {
            String paramToken = request.getParameter("token");
            if (StringUtils.hasText(paramToken)) {
                return paramToken;
            }
        }
        return null;
    }

    private void sendError(HttpServletResponse response, int status, String code, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        ErrorResponse err = ErrorResponse.of(code, message, null);
        response.getWriter().write(objectMapper.writeValueAsString(err));
    }
}

