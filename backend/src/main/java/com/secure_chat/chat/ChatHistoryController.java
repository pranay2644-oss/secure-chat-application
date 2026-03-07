package com.secure_chat.chat;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.secure_chat.entity.Message;
import com.secure_chat.entity.User;
import com.secure_chat.repository.MessageRepository;
import com.secure_chat.repository.UserRepository;

@RestController
@RequestMapping("/api/chat")
public class ChatHistoryController {

    private final MessageRepository messageRepository;
    private final UserRepository userRepository;

    public ChatHistoryController(MessageRepository messageRepository,
                                 UserRepository userRepository) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    @GetMapping("/history")
    public List<Message> getChatHistory(
            @RequestParam String user1,
            @RequestParam String user2) {

        // 🔍 Convert email → User
        User sender = userRepository
                .findByEmail(user1)
                .orElseThrow(() -> new RuntimeException("User1 not found"));

        User receiver = userRepository
                .findByEmail(user2)
                .orElseThrow(() -> new RuntimeException("User2 not found"));

        // 🔐 Fetch encrypted conversation sorted by time
        return messageRepository
                .findBySenderIdAndReceiverIdOrReceiverIdAndSenderIdOrderByTimestampAsc(
                        sender.getId(), receiver.getId(),
                        receiver.getId(), sender.getId()
                );
    }
}
