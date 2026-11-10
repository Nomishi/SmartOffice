package com.smartoffice.backend.service;

import com.smartoffice.backend.api.ApiException;
import com.smartoffice.backend.api.dto.*;
import com.smartoffice.backend.config.SmartOfficeProperties;
import com.smartoffice.backend.domain.AccountStatus;
import com.smartoffice.backend.domain.Role;
import com.smartoffice.backend.domain.User;
import com.smartoffice.backend.repository.UserRepository;
import com.smartoffice.backend.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;
    private final SmartOfficeProperties properties;

    @Transactional
    public LoginResponse login(LoginRequest request) {
        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Sai tên đăng nhập hoặc mật khẩu"));

        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "UNAUTHORIZED", "Sai tên đăng nhập hoặc mật khẩu");
        }

        if (user.getAccountStatus() == AccountStatus.LOCKED) {
            throw new ApiException(HttpStatus.FORBIDDEN, "FORBIDDEN", "Tài khoản đã bị khóa");
        }

        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        String token = jwtProvider.generateToken(user);
        long expiresIn = properties.getSecurity().getJwtExpirationSeconds();

        return new LoginResponse(token, "Bearer", expiresIn, UserDto.from(user));
    }

    @Transactional
    public UserDto createUser(CreateUserRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Username đã tồn tại");
        }

        User user = User.builder()
                .username(request.username())
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(request.role())
                .accountStatus(AccountStatus.ACTIVE)
                .build();

        User saved = userRepository.save(user);
        return UserDto.from(saved);
    }

    @Transactional
    public void changePassword(Long userId, ChangePasswordRequest request) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy người dùng"));

        if (!passwordEncoder.matches(request.oldPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "Mật khẩu cũ không chính xác");
        }

        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepository.save(user);
    }

    public Page<UserDto> list(Pageable pageable) {
        return userRepository.findAll(pageable).map(UserDto::from);
    }

    public UserDto getById(Long userId) {
        return userRepository.findById(userId)
                .map(UserDto::from)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Không tìm thấy người dùng"));
    }
}

