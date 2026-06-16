package com.secure_chat.chat;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.secure_chat.entity.Message;
import com.secure_chat.entity.User;
import com.secure_chat.repository.MessageRepository;
import com.secure_chat.repository.UserRepository;

@Controller
public class ChatController {

    private final SimpMessagingTemplate messagingTemplate;
    private final MessageRepository messageRepository;
    private final UserRepository userRepository;

    public ChatController(
            SimpMessagingTemplate messagingTemplate,
            MessageRepository messageRepository,
            UserRepository userRepository) {

        this.messagingTemplate = messagingTemplate;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    @MessageMapping("/chat")
    public void sendMessage(@Payload ChatMessage message) {

        System.out.println(
                "ENCRYPTED MESSAGE FROM " + message.getSender() +
                " TO " + message.getReceiver()
        );

        User sender = userRepository
                .findByEmail(message.getSender())
                .orElseThrow();

        User receiver = userRepository
                .findByEmail(message.getReceiver())
                .orElseThrow();

        Message entity = new Message();
        entity.setSenderId(sender.getId());
        entity.setReceiverId(receiver.getId());
        entity.setEncryptedContent(message.getEncryptedContent());
        entity.setEncryptedKey(message.getEncryptedKey());
        entity.setIv(message.getIv());

        if (message.isFile()) {
            entity.setFile(true);
            entity.setFileName(message.getFileName());
            entity.setFileType(message.getFileType());
            entity.setFileSize(message.getFileSize());
        }

        messageRepository.save(entity);

        // send only to receiver
        messagingTemplate.convertAndSendToUser(
                message.getReceiver(),
                "/queue/messages",
                message
        );
    }
}