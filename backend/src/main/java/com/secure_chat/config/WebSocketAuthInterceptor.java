package com.secure_chat.config;

import java.util.Map;

import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

public class WebSocketAuthInterceptor implements HandshakeInterceptor {

    @Override
    public boolean beforeHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Map<String, Object> attributes) {

        String query = request.getURI().getQuery();

        if (query != null && query.contains("email=")) {

            // ✅ SAFELY extract email (no split bugs)
            String email = query.substring(
                    query.indexOf("email=") + 6
            );

            // Optional: remove extra params if ever added
            if (email.contains("&")) {
                email = email.substring(0, email.indexOf("&"));
            }

            // 🔥 THIS KEY NAME IS CRITICAL
            attributes.put("user", email);

            System.out.println("WebSocket connected user: " + email);
        }

        return true;
    }

    @Override
    public void afterHandshake(
            ServerHttpRequest request,
            ServerHttpResponse response,
            WebSocketHandler wsHandler,
            Exception exception) {
        // no-op
    }
}
