package com.secure_chat.chat;

public class ChatMessage {

    private String sender;
    private String receiver;

    // 🔐 AES encrypted message OR encrypted file (base64)
    private String encryptedContent;

    // 🔐 AES key encrypted using RSA
    private String encryptedKey;

    // 🔐 Initialization Vector for AES-GCM
    private String iv;

    // ===============================
    // 📎 FILE SUPPORT
    // ===============================

    private String fileName;
    private String fileType;
    private Long fileSize;
    private boolean isFile;

    // REQUIRED by Spring
    public ChatMessage() {
    }

    // ======================
    // Getters & Setters
    // ======================

    public String getSender() {
        return sender;
    }

    public void setSender(String sender) {
        this.sender = sender;
    }

    public String getReceiver() {
        return receiver;
    }

    public void setReceiver(String receiver) {
        this.receiver = receiver;
    }

    public String getEncryptedContent() {
        return encryptedContent;
    }

    public void setEncryptedContent(String encryptedContent) {
        this.encryptedContent = encryptedContent;
    }

    public String getEncryptedKey() {
        return encryptedKey;
    }

    public void setEncryptedKey(String encryptedKey) {
        this.encryptedKey = encryptedKey;
    }

    public String getIv() {
        return iv;
    }

    public void setIv(String iv) {
        this.iv = iv;
    }

    public String getFileName() {
        return fileName;
    }

    public void setFileName(String fileName) {
        this.fileName = fileName;
    }

    public String getFileType() {
        return fileType;
    }

    public void setFileType(String fileType) {
        this.fileType = fileType;
    }

    public Long getFileSize() {
        return fileSize;
    }

    public void setFileSize(Long fileSize) {
        this.fileSize = fileSize;
    }

    public boolean isFile() {
        return isFile;
    }

    public void setFile(boolean file) {
        isFile = file;
    }
}