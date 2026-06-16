package com.secure_chat.chat;

import java.security.Principal;
import java.util.Map;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Handles typing indicator events.
 *
 * Frontend sends:  /app/typing
 * Backend relays to: /topic/typing/{receiverEmail}
 *
 * Payload: { sender, receiver, typing: true|false }
 */
@Controller
public class TypingController {

    private final SimpMessagingTemplate messagingTemplate;

    public TypingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/typing")
    public void handleTyping(@Payload Map<String, Object> payload, Principal principal) {

        if (principal == null) return;

        String sender   = (String) payload.get("sender");
        String receiver = (String) payload.get("receiver");
        Boolean typing  = (Boolean) payload.getOrDefault("typing", false);

        if (receiver == null || receiver.isBlank()) return;

        // Broadcast to receiver's typing topic
        messagingTemplate.convertAndSend(
            "/topic/typing/" + receiver,
            Map.of("sender", sender, "receiver", receiver, "typing", typing)
        );
    }
}
