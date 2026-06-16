package com.secure_chat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    /* ================================
       STOMP ENDPOINT
    ================================= */
    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/chat")
                .addInterceptors(new WebSocketAuthInterceptor())
                .setHandshakeHandler(new WebSocketUserHandshakeHandler())
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    /* ================================
       MESSAGE BROKER
    ================================= */
    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {

        registry.setApplicationDestinationPrefixes("/app");

        // Private messaging
        registry.enableSimpleBroker("/queue");

        // Required for convertAndSendToUser
        registry.setUserDestinationPrefix("/user");
    }

    /* ================================
       🔥 INCREASE MESSAGE SIZE LIMIT
    ================================= */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {

        // Default is 64KB — too small for encrypted files
        registry.setMessageSizeLimit(512 * 1024);      // 512 KB
        registry.setSendBufferSizeLimit(512 * 1024);   // 512 KB
        registry.setSendTimeLimit(20000);              // 20 seconds
    }
}