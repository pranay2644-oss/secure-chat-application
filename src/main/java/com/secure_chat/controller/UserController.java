package com.secure_chat.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import com.secure_chat.dto.UserDTO;
import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;
import com.secure_chat.service.UserService;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService    userService;
    private final UserRepository userRepository;

    public UserController(UserService userService, UserRepository userRepository) {
        this.userService    = userService;
        this.userRepository = userRepository;
    }

    // FIX BUG 4: exclude current user serverside
    // FIX BUG 11: profilePicture sent as-is (needed for sidebar avatars)
    //             but trimmed to null if empty string
    @GetMapping
    public List<UserDTO> getUsers(Authentication authentication) {
        String currentEmail = authentication != null ? authentication.getName() : null;
        return userService.getAllUsers()
                .stream()
                .filter(user -> !user.getEmail().equals(currentEmail)) // FIX BUG 4
                .map(user -> new UserDTO(
                        user.getId(),
                        user.getUsername(),
                        user.getEmail(),
                        user.getProfilePicture(),
                        user.getStatusMessage()
                ))
                .collect(Collectors.toList());
    }

    @PostMapping("/public-key")
    public void savePublicKey(@RequestBody String publicKey, Authentication authentication) {
        String email = authentication.getName();
        User user = userRepository.findByEmail(email).orElseThrow();
        user.setPublicKey(publicKey);
        userRepository.save(user);
    }

    @GetMapping("/public-key/{email}")
    public String getPublicKey(@PathVariable String email) {
        return userRepository.findByEmail(email).orElseThrow().getPublicKey();
    }
}
