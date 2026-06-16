package com.secure_chat.controller;

import java.time.LocalDateTime;

import org.springframework.web.bind.annotation.*;

import com.secure_chat.service.PresenceService;

@RestController
@RequestMapping("/api/presence")
@CrossOrigin(origins = "*")
public class PresenceController {

    private final PresenceService presenceService;

    public PresenceController(PresenceService presenceService) {
        this.presenceService = presenceService;
    }

    // FIX BUG 3: renamed @PathVariable from "username" to "email" — matches what frontend sends
    @GetMapping("/{email}")
    public PresenceResponse getPresence(@PathVariable String email) {
        boolean online       = presenceService.isOnline(email);
        LocalDateTime lastSeen = presenceService.getLastSeen(email);
        return new PresenceResponse(online, lastSeen);
    }

    public record PresenceResponse(boolean online, LocalDateTime lastSeen) {}
}
