package com.secure_chat.config;

import java.security.Principal;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.secure_chat.service.PresenceService;

@Component
public class WebSocketPresenceListener {

    private final PresenceService presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketPresenceListener(PresenceService presenceService,
                                     SimpMessagingTemplate messagingTemplate) {
        this.presenceService = presenceService;
        this.messagingTemplate = messagingTemplate;
    }

    @EventListener
    public void handleConnect(SessionConnectEvent event) {

        Principal user = event.getUser();

        if (user != null) {

            String username = user.getName();

            System.out.println("User ONLINE: " + username);

            presenceService.userOnline(username);

            messagingTemplate.convertAndSend("/topic/presence", username);
        }
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {

        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.wrap(event.getMessage());

        Principal user = accessor.getUser();

        if (user != null) {

            String username = user.getName();

            System.out.println("User OFFLINE: " + username);

            presenceService.userOffline(username);

            messagingTemplate.convertAndSend("/topic/presence", username);
        }
    }
}