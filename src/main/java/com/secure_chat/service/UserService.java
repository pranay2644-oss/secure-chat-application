package com.secure_chat.service;

import java.util.List;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;

/**
 * FIX: save() now only encodes the password ONCE.
 * Previously AuthController encoded it, then save() encoded again → double-hashed password
 * that never matched on login. Now save() is the single place that encodes.
 */
@Service
public class UserService {

    private final UserRepository  userRepository;
    private final PasswordEncoder passwordEncoder;

    public UserService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder) {
        this.userRepository  = userRepository;
        this.passwordEncoder = passwordEncoder;
    }

    public boolean existsByEmail(String email) {
        return userRepository.findByEmail(email).isPresent();
    }

    // FIX: encode password exactly once here
    public void save(User user) {
        user.setPassword(passwordEncoder.encode(user.getPassword()));
        userRepository.save(user);
    }

    public User findByEmail(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new RuntimeException("User not found: " + email));
    }

    public List<User> getAllUsers() {
        return userRepository.findAll();
    }
}
