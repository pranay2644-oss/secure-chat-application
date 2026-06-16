package com.secure_chat.service;

import java.util.List;

import org.springframework.stereotype.Service;

import com.secure_chat.entity.Message;
import com.secure_chat.repository.MessageRepository;

@Service
public class MessageService {

    private final MessageRepository messageRepository;

    public MessageService(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    // 🔐 SAVE ENCRYPTED MESSAGE (TEXT OR FILE)
    public Message sendEncryptedMessage(Long senderId,
                                        Long receiverId,
                                        String encryptedContent,
                                        String encryptedKey,
                                        String iv,
                                        boolean isFile,
                                        String fileName,
                                        String fileType,
                                        Long fileSize) {

        Message message = new Message();

        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setEncryptedContent(encryptedContent);
        message.setEncryptedKey(encryptedKey);
        message.setIv(iv);
        message.setFile(isFile);

        if (isFile) {
            message.setFileName(fileName);
            message.setFileType(fileType);
            message.setFileSize(fileSize);
        }

        return messageRepository.save(message);
    }

    // 📜 GET ENCRYPTED CHAT HISTORY BETWEEN TWO USERS
    public List<Message> getChatHistory(Long user1, Long user2) {

        return messageRepository
                .findBySenderIdAndReceiverIdOrReceiverIdAndSenderIdOrderByTimestampAsc(
                        user1, user2,
                        user2, user1
                );
    }
}