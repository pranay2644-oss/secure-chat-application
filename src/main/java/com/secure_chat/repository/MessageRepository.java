package com.secure_chat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import com.secure_chat.entity.Message;

@Repository
public interface MessageRepository extends JpaRepository<Message, Long> {

    // =========================
    // 📜 GET CHAT HISTORY
    // =========================
    @Query("SELECT m FROM Message m WHERE " +
           "(m.senderId = :user1 AND m.receiverId = :user2) OR " +
           "(m.senderId = :user2 AND m.receiverId = :user1) " +
           "ORDER BY m.timestamp ASC")
    List<Message> getChatHistory(Long user1, Long user2);


    // =========================
    // 🗑️ DELETE SINGLE MESSAGE
    // =========================
    @Transactional
    void deleteById(Long id);


    // =========================
    // 🧹 DELETE FULL CONVERSATION
    // =========================
    @Transactional
    @Modifying
    @Query("DELETE FROM Message m WHERE " +
           "(m.senderId = :user1 AND m.receiverId = :user2) OR " +
           "(m.senderId = :user2 AND m.receiverId = :user1)")
    void deleteConversation(Long user1, Long user2);
}