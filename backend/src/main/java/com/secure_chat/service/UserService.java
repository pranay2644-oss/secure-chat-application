package com.secure_chat.service;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;

@Service
public class UserService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    // ✅ CHECK EMAIL EXISTS
    public boolean existsByEmail(String email) {
        return userRepository.findByEmail(email).isPresent();
    }

    // ✅ SAVE USER (REGISTER)
    public void save(User user) {
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        userRepository.save(user);
    }

    // ✅ FIND USER BY EMAIL
    public User findByEmail(String email) {
        return userRepository
                .findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found"));
    }

    // ✅ GET ALL USERS (CHAT LIST)
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}
