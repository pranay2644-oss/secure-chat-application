package com.secure_chat.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.secure_chat.entity.Message;

public interface MessageRepository extends JpaRepository<Message, Long> {

    // Get all messages between two users ordered by time
    List<Message> findBySenderIdAndReceiverIdOrReceiverIdAndSenderIdOrderByTimestampAsc(
            Long sender1,
            Long receiver1,
            Long sender2,
            Long receiver2
    );
}
