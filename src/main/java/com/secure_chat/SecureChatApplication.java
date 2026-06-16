package com.secure_chat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication(scanBasePackages = "com.secure_chat")
public class SecureChatApplication {

    public static void main(String[] args) {
        SpringApplication.run(SecureChatApplication.class, args);
    }
}

