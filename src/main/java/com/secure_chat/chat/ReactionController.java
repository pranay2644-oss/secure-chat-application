package com.secure_chat.chat;

import java.security.Principal;
import java.util.Map;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Handles emoji reaction events.
 *
 * Frontend sends:  /app/reaction
 * Backend relays to:
 *   /topic/reaction/{senderEmail}   — echo back to reactor
 *   /topic/reaction/{receiverEmail} — forward to other party
 *
 * Payload: { messageId, emoji, sender, receiver, remove: true|false }
 */
@Controller
public class ReactionController {

    private final SimpMessagingTemplate messagingTemplate;

    public ReactionController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/reaction")
    public void handleReaction(@Payload Map<String, Object> payload, Principal principal) {

        if (principal == null) return;

        Object  messageId = payload.get("messageId");
        String  emoji     = (String) payload.get("emoji");
        String  sender    = (String) payload.get("sender");
        String  receiver  = (String) payload.get("receiver");
        Boolean remove    = (Boolean) payload.getOrDefault("remove", false);

        if (emoji == null || sender == null || receiver == null || messageId == null) return;

        Map<String, Object> broadcast = Map.of(
            "messageId", messageId,
            "emoji",     emoji,
            "sender",    sender,
            "remove",    remove
        );

        // Send to both parties so both UIs update
        messagingTemplate.convertAndSend("/topic/reaction/" + sender,   broadcast);
        messagingTemplate.convertAndSend("/topic/reaction/" + receiver, broadcast);
    }
}
