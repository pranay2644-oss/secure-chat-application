package com.secure_chat.chat;

import java.security.Principal;
import java.time.LocalDateTime;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.secure_chat.entity.Message;
import com.secure_chat.entity.User;
import com.secure_chat.repository.MessageRepository;
import com.secure_chat.repository.UserRepository;

/**
 * FIXES:
 * 1. Broadcasts to /topic/messages/{email} (not /user/queue/messages)
 *    so frontend topic-based subscription works correctly
 * 2. Saves encryptedKeyForSender to DB
 * 3. Sets sender/receiver email on the saved entity before broadcasting
 *    so frontend gets email strings (not just IDs) in the WS response
 * 4. Sets timestamp before save via @PrePersist   no null timestamp
 * 5. Principal null-check prevents NPE when unauthenticated WS sneaks through
 */
@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository     messageRepository;
    private final UserRepository        userRepository;

    public ChatController(SimpMessagingTemplate messagingTemplate,
                          MessageRepository messageRepository,
                          UserRepository userRepository) {
        this.messagingTemplate  = messagingTemplate;
        this.messageRepository  = messageRepository;
        this.userRepository     = userRepository;
    }

    @MessageMapping("/chat")
    public void sendMessage(@Payload ChatMessage message, Principal principal) {

        // FIX: null-check principal   reject unauthenticated WS frames
        if (principal == null) {
            System.err.println("[ERROR] Unauthenticated WS message rejected");
            return;
        }

        String senderEmail   = principal.getName();
        String receiverEmail = message.getReceiver();

        if (receiverEmail == null || receiverEmail.isBlank()) {
            System.err.println("[ERROR] Missing receiver in WS message");
            return;
        }

        User sender = userRepository.findByEmail(senderEmail)
                .orElseThrow(() -> new RuntimeException("Sender not found: " + senderEmail));

        User receiver = userRepository.findByEmail(receiverEmail)
                .orElseThrow(() -> new RuntimeException("Receiver not found: " + receiverEmail));

        //    Persist                                              
        Message entity = new Message();
        entity.setSenderId(sender.getId());
        entity.setReceiverId(receiver.getId());
        entity.setEncryptedContent(message.getEncryptedContent());
        entity.setEncryptedKey(message.getEncryptedKey());
        entity.setEncryptedKeyForSender(message.getEncryptedKeyForSender()); // FIX
        entity.setIv(message.getIv());
        entity.setFile(message.isFile());
        entity.setTimestamp(LocalDateTime.now());

        if (message.isFile()) {
            entity.setFileName(message.getFileName());
            entity.setFileType(message.getFileType());
            entity.setFileSize(message.getFileSize());
        }

        Message saved = messageRepository.save(entity);

        // FIX: populate transient email fields so JSON contains sender/receiver strings
        saved.setSender(senderEmail);
        saved.setReceiver(receiverEmail);

        // FIX Bug 3: no emoji   Windows console (cp1252) cannot display them,
        // causes "? sender ? receiver" in logs. Plain ASCII is safe everywhere.
        System.out.println("MSG: " + senderEmail + " -> " + receiverEmail
                + (message.isFile() ? " [FILE: " + message.getFileName() + "]" : " [TEXT]"));

        // FIX: broadcast to /topic/messages/{email} (topic-based, not user-queue)
        messagingTemplate.convertAndSend("/topic/messages/" + receiverEmail, saved);
        messagingTemplate.convertAndSend("/topic/messages/" + senderEmail,   saved);
    }
}
