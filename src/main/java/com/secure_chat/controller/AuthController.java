package com.secure_chat.controller;

import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.secure_chat.entity.User;
import com.secure_chat.security.JwtUtil;
import com.secure_chat.service.UserService;

/**
 * FIXES:
 * 1. generateToken(user) instead of generateToken(email) — embeds userId in JWT
 *    so frontend parseJwt() can set window.currentUserId correctly
 * 2. Password double-encoding bug fixed — UserService.save() was encoding again
 *    after AuthController already encoded. Now AuthController just stores raw
 *    and lets UserService encode once.
 * 3. register() returns 400 with clear message on duplicate email
 * 4. login() returns userId + username in response body (handy for frontend)
 */
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserService     userService;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil         jwtUtil;

    public AuthController(UserService userService,
                          PasswordEncoder passwordEncoder,
                          JwtUtil jwtUtil) {
        this.userService     = userService;
        this.passwordEncoder = passwordEncoder;
        this.jwtUtil         = jwtUtil;
    }

    // ── Register ───────────────────────────────────────────────
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {

        String username = request.get("username");
        String email    = request.get("email");
        String password = request.get("password");

        if (username == null || email == null || password == null) {
            return ResponseEntity.badRequest().body("username, email and password are required");
        }

        if (userService.existsByEmail(email)) {
            return ResponseEntity.badRequest().body("Email already registered");
        }

        User user = new User();
        user.setUsername(username);
        user.setEmail(email);
        user.setPassword(password);  // plain — UserService.save() encodes it

        userService.save(user);

        return ResponseEntity.ok(Map.of("message", "Registration successful"));
    }

    // ── Login ──────────────────────────────────────────────────
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {

        String email    = request.get("email");
        String password = request.get("password");

        if (email == null || password == null) {
            return ResponseEntity.badRequest().body("email and password are required");
        }

        User user;
        try {
            user = userService.findByEmail(email);
        } catch (RuntimeException e) {
            return ResponseEntity.status(401).body("Invalid email or password");
        }

        if (!passwordEncoder.matches(password, user.getPassword())) {
            return ResponseEntity.status(401).body("Invalid email or password");
        }

        // FIX: embed userId in the token
        String token = jwtUtil.generateToken(user);

        return ResponseEntity.ok(Map.of(
                "token",    token,
                "userId",   user.getId(),
                "username", user.getUsername(),
                "email",    user.getEmail()
        ));
    }
}
