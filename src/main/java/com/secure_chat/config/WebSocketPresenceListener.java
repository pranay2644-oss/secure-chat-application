package com.secure_chat.config;

import java.security.Principal;

import org.springframework.context.event.EventListener;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.messaging.SessionConnectedEvent;
import org.springframework.web.socket.messaging.SessionDisconnectEvent;

import com.secure_chat.service.PresenceService;


@Component
public class WebSocketPresenceListener {

    private final PresenceService       presenceService;
    private final SimpMessagingTemplate messagingTemplate;

    public WebSocketPresenceListener(PresenceService presenceService,
                                     SimpMessagingTemplate messagingTemplate) {
        this.presenceService   = presenceService;
        this.messagingTemplate = messagingTemplate;
    }

    // FIX: SessionConnectedEvent   Principal IS available here
    @EventListener
    public void handleConnect(SessionConnectedEvent event) {

        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.wrap(event.getMessage());

        Principal user = accessor.getUser();
        if (user == null || user.getName() == null) {
            System.err.println("WebSocket CONNECTED but no Principal found");
            return;
        }

        String email = user.getName();
        presenceService.userOnline(email);
        messagingTemplate.convertAndSend("/topic/presence", email);
        System.out.println("ONLINE: " + email);
    }

    @EventListener
    public void handleDisconnect(SessionDisconnectEvent event) {

        SimpMessageHeaderAccessor accessor =
                SimpMessageHeaderAccessor.wrap(event.getMessage());

        Principal user = accessor.getUser();
        if (user == null || user.getName() == null) return;

        String email = user.getName();
        presenceService.userOffline(email);
        messagingTemplate.convertAndSend("/topic/presence", email);
        System.out.println("OFFLINE: " + email);
    }
}
