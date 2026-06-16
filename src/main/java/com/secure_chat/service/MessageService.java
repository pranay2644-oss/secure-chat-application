package com.secure_chat.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.secure_chat.entity.Message;
import com.secure_chat.repository.MessageRepository;

@Service
public class MessageService {

    private final MessageRepository messageRepository;

    public MessageService(MessageRepository messageRepository) {
        this.messageRepository = messageRepository;
    }

    // FIX BUG 1: added encryptedKeyForSender parameter
    public Message sendEncryptedMessage(Long senderId, Long receiverId,
                                        String encryptedContent,
                                        String encryptedKey,
                                        String encryptedKeyForSender,
                                        String iv,
                                        boolean isFile,
                                        String fileName, String fileType, Long fileSize) {
        Message message = new Message();
        message.setSenderId(senderId);
        message.setReceiverId(receiverId);
        message.setEncryptedContent(encryptedContent);
        message.setEncryptedKey(encryptedKey);
        message.setEncryptedKeyForSender(encryptedKeyForSender); // FIX
        message.setIv(iv);
        message.setFile(isFile);
        if (isFile) {
            message.setFileName(fileName);
            message.setFileType(fileType);
            message.setFileSize(fileSize);
        }
        return messageRepository.save(message);
    }

    public List<Message> getChatHistory(Long user1, Long user2) {
        return messageRepository.getChatHistory(user1, user2);
    }

    @Transactional
    public void deleteMessage(Long messageId) {
        messageRepository.deleteById(messageId);
    }

    @Transactional
    public void deleteConversation(Long user1, Long user2) {
        messageRepository.deleteConversation(user1, user2);
    }
}
