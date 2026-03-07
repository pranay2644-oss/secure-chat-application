package com.secure_chat.controller;

import java.time.LocalDateTime;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.secure_chat.service.PresenceService;

@RestController
@RequestMapping("/api/presence")
public class PresenceController {

    private final PresenceService presenceService;

    public PresenceController(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    @GetMapping("/{username}")
    public PresenceResponse getPresence(@PathVariable String username) {

        boolean online = presenceService.isOnline(username);
        LocalDateTime lastSeen = presenceService.getLastSeen(username);

        return new PresenceResponse(online, lastSeen);
    }

    public record PresenceResponse(
            boolean online,
            LocalDateTime lastSeen
    ) {}
}