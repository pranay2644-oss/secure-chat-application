package com.secure_chat.config;

import java.security.Principal;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;

/**
 
 *
 * This interceptor ensures every STOMP CONNECT frame carries the Principal so that
 * @MessageMapping handlers can call principal.getName() without getting null.
 */
public class WebSocketAuthChannelInterceptor implements ChannelInterceptor {

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {

        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor == null) return message;

        // On CONNECT, the session already has a user (set by WebSocketUserHandshakeHandler).
        // Nothing extra needed — the handshake handler already bound the Principal.
        // On subsequent frames (SEND, SUBSCRIBE) the session user is automatically carried.

        // Guard: if for any reason user is null, reject the SEND frame
        if (StompCommand.SEND.equals(accessor.getCommand())) {
            Principal user = accessor.getUser();
            if (user == null) {
                System.err.println("[ERROR] Rejected unauthenticated STOMP SEND frame");
                return null; // drop the frame
            }
        }

        return message;
    }
}
