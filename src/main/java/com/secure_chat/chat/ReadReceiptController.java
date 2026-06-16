package com.secure_chat.chat;

import java.security.Principal;
import java.util.Map;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

/**
 * Handles read receipt events.
 *
 * Frontend sends:  /app/read-receipt
 * Backend relays to: /user/queue/read-receipt  (to the original sender)
 *
 * Payload: { messageId, reader, sender, status }
 * Status values: "sent" | "delivered" | "read"
 */
@Controller
public class ReadReceiptController {

    private final SimpMessagingTemplate messagingTemplate;

    public ReadReceiptController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/read-receipt")
    public void handleReadReceipt(@Payload Map<String, Object> payload, Principal principal) {

        if (principal == null) return;

        Object  messageId = payload.get("messageId");
        String  reader    = (String) payload.get("reader");
        String  sender    = (String) payload.get("sender");  // original message sender
        String  status    = (String) payload.getOrDefault("status", "read");

        if (sender == null || sender.isBlank() || messageId == null) return;

        // Send receipt back to the original message sender
        // They subscribed to /user/queue/read-receipt
        messagingTemplate.convertAndSendToUser(
            sender,
            "/queue/read-receipt",
            Map.of(
                "messageId", messageId,
                "reader",    reader != null ? reader : "",
                "status",    status
            )
        );
    }
}
