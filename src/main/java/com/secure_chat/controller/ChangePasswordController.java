package com.secure_chat.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;

/**
 * Handles password change requests from the profile page.
 * Verifies the current password before setting the new one.
 */
@RestController
@RequestMapping("/api/profile")
@CrossOrigin(origins = "*")
public class ChangePasswordController {

    private final UserRepository  userRepository;
    private final PasswordEncoder passwordEncoder;

    public ChangePasswordController(UserRepository userRepository,
                                    PasswordEncoder passwordEncoder) {
        this.userRepository  = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    /**
     * POST /api/profile/change-password
     *
     * Request body:
     * {
     *   "email":           "user@example.com",
     *   "currentPassword": "oldPassword123",
     *   "newPassword":     "newPassword456"
     * }
     */
    @PostMapping("/change-password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, String> request) {

        String email           = request.get("email");
        String currentPassword = request.get("currentPassword");
        String newPassword     = request.get("newPassword");

        // ── Validation ──────────────────────────────────────────
        if (email == null || currentPassword == null || newPassword == null) {
            return ResponseEntity.badRequest()
                    .body("email, currentPassword, and newPassword are required");
        }

        if (newPassword.length() < 6) {
            return ResponseEntity.badRequest()
                    .body("New password must be at least 6 characters");
        }

        // ── Find user ───────────────────────────────────────────
        User user = userRepository.findByEmail(email)
                .orElse(null);

        if (user == null) {
            return ResponseEntity.status(404).body("User not found");
        }

        // ── Verify current password ─────────────────────────────
        if (!passwordEncoder.matches(currentPassword, user.getPassword())) {
            return ResponseEntity.status(400).body("Current password is incorrect");
        }

        // ── Reject same password ────────────────────────────────
        if (passwordEncoder.matches(newPassword, user.getPassword())) {
            return ResponseEntity.badRequest()
                    .body("New password must be different from the current password");
        }

        // ── Update ──────────────────────────────────────────────
        user.setPassword(passwordEncoder.encode(newPassword));
        userRepository.save(user);

        return ResponseEntity.ok(Map.of("message", "Password changed successfully"));
    }
}
