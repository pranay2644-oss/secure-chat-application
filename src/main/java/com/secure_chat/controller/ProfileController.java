package com.secure_chat.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.secure_chat.dto.ProfileResponse;
import com.secure_chat.dto.ProfileUpdateRequest;
import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;

@RestController
@RequestMapping("/api/profile")
@CrossOrigin(origins = "*")
public class ProfileController {

    private final UserRepository userRepository;

    public ProfileController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /* GET /api/profile/{email} */
    @GetMapping("/{email}")
    public ResponseEntity<ProfileResponse> getProfile(@PathVariable String email) {
        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(toResponse(user));
    }

    /* PUT /api/profile/update */
    @PutMapping("/update")
    public ResponseEntity<?> updateProfile(@RequestBody ProfileUpdateRequest req) {

        if (req.getEmail() == null || req.getEmail().isBlank())
            return ResponseEntity.badRequest().body("Email is required");

        if (req.getUsername() == null || req.getUsername().isBlank())
            return ResponseEntity.badRequest().body("Username cannot be empty");

        User user = userRepository.findByEmail(req.getEmail()).orElse(null);
        if (user == null) return ResponseEntity.notFound().build();

        // Safe fields only — password and publicKey NEVER touched here
        user.setUsername(req.getUsername().trim());

        if (req.getStatusMessage() != null)
            user.setStatusMessage(req.getStatusMessage().trim());

        if (req.getProfilePicture() != null && req.getProfilePicture().startsWith("data:image"))
            user.setProfilePicture(req.getProfilePicture());

        return ResponseEntity.ok(toResponse(userRepository.save(user)));
    }

    private ProfileResponse toResponse(User user) {
        return new ProfileResponse(
            user.getId(), user.getEmail(), user.getUsername(),
            user.getStatusMessage(), user.getProfilePicture()
        );
    }
}
