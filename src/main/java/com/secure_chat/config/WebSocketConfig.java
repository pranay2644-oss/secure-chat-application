package com.secure_chat.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.*;

/**
 * FIXES:
 * 1. Added /topic to simple broker — previously only /queue was enabled,
 *    so /topic/messages/{email} subscriptions silently received nothing
 * 2. Registered WebSocketAuthChannelInterceptor on the inbound channel
 *    so @MessageMapping handlers get a valid Principal
 * 3. Increased transport size limits for encrypted file payloads
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/chat")
                .addInterceptors(new WebSocketAuthInterceptor())
                .setHandshakeHandler(new WebSocketUserHandshakeHandler())
                .setAllowedOriginPatterns("*")
                .withSockJS();
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.setApplicationDestinationPrefixes("/app");

        // FIX: must include /topic so /topic/messages/{email} actually delivers
        registry.enableSimpleBroker("/queue", "/topic");

        registry.setUserDestinationPrefix("/user");
    }

    /**
     * FIX: register the STOMP header interceptor so Principal is set
     * on every inbound frame — required for @MessageMapping to work.
     */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(new WebSocketAuthChannelInterceptor());
    }

    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registry) {
        registry.setMessageSizeLimit(10 * 1024 * 1024);   // 10 MB — encrypted files are large
        registry.setSendBufferSizeLimit(10 * 1024 * 1024);
        registry.setSendTimeLimit(30_000);
    }
}
