package com.secure_chat.entity;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ===============================
    // BASIC MESSAGE INFO
    // ===============================

    @Column(nullable = false)
    private Long senderId;

    @Column(nullable = false)
    private Long receiverId;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    // ===============================
    // 🔐 ENCRYPTED DATA (TEXT OR FILE)
    // ===============================

    @Column(columnDefinition = "LONGTEXT")
    private String encryptedContent;

    @Column(columnDefinition = "TEXT")
    private String encryptedKey;

    @Column(columnDefinition = "TEXT")
    private String iv;

    // ===============================
    // 📎 FILE SUPPORT FIELDS
    // ===============================

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "file_type")
    private String fileType;

    @Column(name = "file_size")
    private Long fileSize;

    // ✅ FIXED: Use Boolean wrapper instead of primitive
    @Column(name = "is_file", nullable = false)
    private Boolean file = false;

    // ===============================
    // CONSTRUCTORS
    // ===============================

    public Message() {
        this.timestamp = LocalDateTime.now();
        this.file = false;
    }

    public Message(Long senderId,
                   Long receiverId,
                   String encryptedContent,
                   String encryptedKey,
                   String iv,
                   Boolean file) {

        this.senderId = senderId;
        this.receiverId = receiverId;
        this.encryptedContent = encryptedContent;
        this.encryptedKey = encryptedKey;
        this.iv = iv;
        this.file = (file != null) ? file : false;
        this.timestamp = LocalDateTime.now();
    }

    // ===============================
    // GETTERS & SETTERS
    // ===============================

    public Long getId() {
        return id;
    }

    public Long getSenderId() {
        return senderId;
    }

    public void setSenderId(Long senderId) {
        this.senderId = senderId;
    }

    public Long getReceiverId() {
        return receiverId;
    }

    public void setReceiverId(Long receiverId) {
        this.receiverId = receiverId;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
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

    // ✅ Safe Boolean getter
    public Boolean isFile() {
        return file != null ? file : false;
    }

    public void setFile(Boolean file) {
        this.file = (file != null) ? file : false;
    }
}