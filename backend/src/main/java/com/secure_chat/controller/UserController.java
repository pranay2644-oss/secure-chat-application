package com.secure_chat.controller;

import java.util.List;
import java.util.stream.Collectors;

import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.secure_chat.dto.UserDTO;
import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;
import com.secure_chat.service.UserService;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;
    private final UserRepository userRepository;

    public UserController(UserService userService,
                          UserRepository userRepository) {
        this.userService = userService;
        this.userRepository = userRepository;
    }

    /* ==============================
       GET ALL USERS
    ============================== */
    @GetMapping
    public List<UserDTO> getUsers() {
        return userService.getAllUsers()
                .stream()
                .map(user -> new UserDTO(
                        user.getId(),
                        user.getUsername(),
                        user.getEmail()
                ))
                .collect(Collectors.toList());
    }

    /* ==============================
       SAVE PUBLIC KEY
    ============================== */
    @PostMapping("/public-key")
    public void savePublicKey(@RequestBody String publicKey,
                              Authentication authentication) {

        String email = authentication.getName();

        User user = userRepository.findByEmail(email)
                .orElseThrow();

        user.setPublicKey(publicKey);
        userRepository.save(user);
    }

    /* ==============================
       GET USER PUBLIC KEY
    ============================== */
    @GetMapping("/public-key/{email}")
    public String getPublicKey(@PathVariable String email) {

        User user = userRepository.findByEmail(email)
                .orElseThrow();

        return user.getPublicKey();
    }
}
