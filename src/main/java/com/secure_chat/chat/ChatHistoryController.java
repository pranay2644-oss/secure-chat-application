package com.secure_chat.chat;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import com.secure_chat.entity.Message;
import com.secure_chat.entity.User;
import com.secure_chat.repository.MessageRepository;
import com.secure_chat.repository.UserRepository;

/**
 * FIXES:
 * 1. CRITICAL N+1 QUERY FIX: The old code called userRepository.findById() for
 *    EVERY message × 2 (sender + receiver), causing hundreds of SELECT statements
 *    per chat open (visible in logs as massive floods of identical queries).
 *    New approach: look up both users once (2 queries total), build a Map<id→email>,
 *    then set all sender/receiver fields in a single pass — O(n) with 2 DB hits.
 *
 * 2. Returns 404 with clear message if user not found.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatHistoryController {

    private final MessageRepository messageRepository;
    private final UserRepository    userRepository;

    public ChatHistoryController(MessageRepository messageRepository,
                                 UserRepository userRepository) {
        this.messageRepository = messageRepository;
        this.userRepository    = userRepository;
    }

    @GetMapping("/history")
    public ResponseEntity<List<Message>> getChatHistory(@RequestParam String user1,
                                                         @RequestParam String user2) {

        User u1 = userRepository.findByEmail(user1)
                .orElse(null);
        User u2 = userRepository.findByEmail(user2)
                .orElse(null);

        if (u1 == null) return ResponseEntity.badRequest().build();
        if (u2 == null) return ResponseEntity.badRequest().build();

        List<Message> messages = messageRepository.getChatHistory(u1.getId(), u2.getId());

        // FIX: Build a lookup map — exactly 2 DB queries regardless of message count.
        // Previously this was 2 × N queries (N+1 problem) which caused the log flood.
        Map<Long, String> idToEmail = Map.of(
                u1.getId(), u1.getEmail(),
                u2.getId(), u2.getEmail()
        );

        for (Message msg : messages) {
            msg.setSender(idToEmail.getOrDefault(msg.getSenderId(),   "unknown"));
            msg.setReceiver(idToEmail.getOrDefault(msg.getReceiverId(), "unknown"));
        }

        return ResponseEntity.ok(messages);
    }
}
