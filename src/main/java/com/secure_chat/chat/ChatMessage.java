package com.secure_chat.chat;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * FIXES:
 * 1. Added encryptedKeyForSender field for dual-encryption support
 * 2. Added id field so frontend duplicate-check works
 * 3. Added timestamp field so frontend can display time after WS delivery
 */
public class ChatMessage {

    // set by backend after save — lets frontend deduplicate
    private Long id;

    private String sender;
    private String receiver;

    private String encryptedContent;
    private String encryptedKey;

    // FIX: AES key wrapped with SENDER's RSA public key
    private String encryptedKeyForSender;

    private String iv;

    private String fileName;
    private String fileType;
    private Long   fileSize;

    @JsonProperty("isFile")
    private boolean isFile;

    // set by backend so frontend gets correct timestamp
    private String timestamp;

    public ChatMessage() {}

    // ── Getters & Setters ──────────────────────────────────────

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getSender() { return sender; }
    public void setSender(String sender) { this.sender = sender; }

    public String getReceiver() { return receiver; }
    public void setReceiver(String receiver) { this.receiver = receiver; }

    public String getEncryptedContent() { return encryptedContent; }
    public void setEncryptedContent(String encryptedContent) { this.encryptedContent = encryptedContent; }

    public String getEncryptedKey() { return encryptedKey; }
    public void setEncryptedKey(String encryptedKey) { this.encryptedKey = encryptedKey; }

    public String getEncryptedKeyForSender() { return encryptedKeyForSender; }
    public void setEncryptedKeyForSender(String encryptedKeyForSender) {
        this.encryptedKeyForSender = encryptedKeyForSender;
    }

    public String getIv() { return iv; }
    public void setIv(String iv) { this.iv = iv; }

    public String getFileName() { return fileName; }
    public void setFileName(String fileName) { this.fileName = fileName; }

    public String getFileType() { return fileType; }
    public void setFileType(String fileType) { this.fileType = fileType; }

    public Long getFileSize() { return fileSize; }
    public void setFileSize(Long fileSize) { this.fileSize = fileSize; }

    public boolean isFile() { return isFile; }
    public void setFile(boolean file) { this.isFile = file; }

    public String getTimestamp() { return timestamp; }
    public void setTimestamp(String timestamp) { this.timestamp = timestamp; }
}
