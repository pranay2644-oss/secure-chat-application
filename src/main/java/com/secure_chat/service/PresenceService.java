package com.secure_chat.service;

import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.secure_chat.entity.User;
import com.secure_chat.repository.UserRepository;

/**
 * FIXES:
 * 1. Removed broadcastPresence() that sent the whole Set<String> — frontend
 *    subscribed to /topic/presence expecting a single email string, not a JSON array
 * 2. Saves lastSeen to database on disconnect (was only in-memory before — lost on restart)
 * 3. Removed circular dependency with SimpMessagingTemplate (presence broadcast is now
 *    done by WebSocketPresenceListener which already has the template)
 */
@Service
public class PresenceService {

    private final ConcurrentHashMap<String, Boolean>       onlineUsers = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, LocalDateTime> lastSeenMap = new ConcurrentHashMap<>();
    private final UserRepository userRepository;

    public PresenceService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    public void userOnline(String email) {
        if (email == null) return;
        onlineUsers.put(email, true);
        lastSeenMap.remove(email);
    }

    public void userOffline(String email) {
        if (email == null) return;
        onlineUsers.remove(email);
        LocalDateTime now = LocalDateTime.now();
        lastSeenMap.put(email, now);

        // FIX: persist lastSeen so it survives server restart
        userRepository.findByEmail(email).ifPresent(user -> {
            user.setLastSeen(now);
            userRepository.save(user);
        });
    }

    public boolean isOnline(String email) {
        return onlineUsers.containsKey(email);
    }

    public LocalDateTime getLastSeen(String email) {
        // prefer in-memory (more recent), fall back to DB value
        LocalDateTime inMemory = lastSeenMap.get(email);
        if (inMemory != null) return inMemory;
        return userRepository.findByEmail(email)
                .map(User::getLastSeen)
                .orElse(null);
    }
}
