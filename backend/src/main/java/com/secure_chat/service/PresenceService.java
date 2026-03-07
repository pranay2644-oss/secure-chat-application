package com.secure_chat.service;

import java.time.LocalDateTime;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

@Service
public class PresenceService {

    private final ConcurrentHashMap<String, Boolean> onlineUsers =
            new ConcurrentHashMap<>();

    private final ConcurrentHashMap<String, LocalDateTime> lastSeen =
            new ConcurrentHashMap<>();

    public void userOnline(String username) {
        if (username == null) return;

        onlineUsers.put(username, true);
        lastSeen.remove(username);
    }

    public void userOffline(String username) {
        if (username == null) return;

        onlineUsers.remove(username);
        lastSeen.put(username, LocalDateTime.now());
    }

    public boolean isOnline(String username) {
        return onlineUsers.containsKey(username);
    }

    public LocalDateTime getLastSeen(String username) {
        return lastSeen.get(username);
    }
}