package com.secure_chat.chat;

import java.security.Principal;

import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.*;

import com.secure_chat.entity.Message;
import com.secure_chat.entity.User;
import com.secure_chat.repository.MessageRepository;
import com.secure_chat.repository.UserRepository;
import com.secure_chat.service.MessageService;

/**
 * FIXES:
 * 1. deleteMessage now checks that the requester is the sender (prevents others deleting)
 * 2. Returns 403 if not the owner, 404 if message not found — not just silently deleting
 * 3. deleteConversation accepts email params (not IDs) — consistent with frontend
 * 4. Both notify via /user/queue/delete and /user/queue/clear
 */
@RestController
@RequestMapping("/api/chat")
public class ChatDeleteController {

    private final MessageService        messageService;
    private final MessageRepository     messageRepository;
    private final SimpMessagingTemplate messagingTemplate;
    private final UserRepository        userRepository;

    public ChatDeleteController(MessageService messageService,
                                MessageRepository messageRepository,
                                SimpMessagingTemplate messagingTemplate,
                                UserRepository userRepository) {
        this.messageService    = messageService;
        this.messageRepository = messageRepository;
        this.messagingTemplate = messagingTemplate;
        this.userRepository    = userRepository;
    }

    // ── Delete single message ──────────────────────────────────
    @DeleteMapping("/message/{id}")
    public ResponseEntity<Void> deleteMessage(@PathVariable Long id,
                                               Principal principal) {

        Message msg = messageRepository.findById(id).orElse(null);
        if (msg == null) return ResponseEntity.notFound().build();

        // FIX: only the sender may delete
        User sender = userRepository.findById(msg.getSenderId()).orElse(null);
        if (sender == null) return ResponseEntity.notFound().build();

        if (principal != null && !sender.getEmail().equals(principal.getName())) {
            return ResponseEntity.status(403).build();
        }

        User receiver = userRepository.findById(msg.getReceiverId()).orElse(null);

        messageService.deleteMessage(id);

        messagingTemplate.convertAndSendToUser(sender.getEmail(),   "/queue/delete", id);
        if (receiver != null) {
            messagingTemplate.convertAndSendToUser(receiver.getEmail(), "/queue/delete", id);
        }

        return ResponseEntity.noContent().build();
    }

    // ── Delete full conversation (by email) ────────────────────
    // FIX: accepts email strings, not numeric IDs — matches frontend call
    @DeleteMapping("/conversation")
    public ResponseEntity<Void> deleteConversation(@RequestParam String user1,
                                                    @RequestParam String user2) {

        User u1 = userRepository.findByEmail(user1).orElse(null);
        User u2 = userRepository.findByEmail(user2).orElse(null);

        if (u1 == null || u2 == null) return ResponseEntity.notFound().build();

        messageService.deleteConversation(u1.getId(), u2.getId());

        messagingTemplate.convertAndSendToUser(u1.getEmail(), "/queue/clear", "cleared");
        messagingTemplate.convertAndSendToUser(u2.getEmail(), "/queue/clear", "cleared");

        return ResponseEntity.noContent().build();
    }
}
