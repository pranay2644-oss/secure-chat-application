package com.secure_chat.security;

import java.io.IOException;

import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

public class JwtFilterSkippingWebSocket extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // 🔥 Skip JWT only for WebSocket handshake endpoints
        if (path.startsWith("/chat")
                || path.startsWith("/app")
                || path.startsWith("/user")
                || path.startsWith("/queue")
                || path.startsWith("/topic")) {

            filterChain.doFilter(request, response);
            return;
        }

        // ✅ For all other requests, continue normally
        filterChain.doFilter(request, response);
    }
}
