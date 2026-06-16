package com.secure_chat.entity;

import java.time.LocalDateTime;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;

/**
 * ROOT CAUSE FIX:
 * @Transient fields are ignored by Jackson by default — even when you call
 * setSender()/setReceiver() before broadcasting, Jackson sees @Transient
 * and skips them. The frontend receives msg.sender = null, so every message
 * is treated as "received" and all bubbles appear on the left.
 *
 * Fix: add @JsonProperty("sender") / @JsonProperty("receiver") on the
 * transient fields. Jackson respects @JsonProperty even on @Transient fields.
 */
@Entity
@Table(name = "messages")
public class Message {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long senderId;

    @Column(nullable = false)
    private Long receiverId;

    // FIX: @JsonProperty forces Jackson to include these in WS/REST JSON output
    //      even though JPA ignores them (@Transient)
    @Transient
    @JsonProperty("sender")
    private String sender;

    @Transient
    @JsonProperty("receiver")
    private String receiver;

    @Column(nullable = false)
    private LocalDateTime timestamp;

    @Column(columnDefinition = "LONGTEXT")
    private String encryptedContent;

    @Column(columnDefinition = "LONGTEXT")
    private String encryptedKey;

    // Dual-encryption: AES key wrapped with SENDER's RSA public key
    @Column(name = "encrypted_key_for_sender", columnDefinition = "LONGTEXT")
    private String encryptedKeyForSender;

    @Column(columnDefinition = "TEXT")
    private String iv;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "file_type")
    private String fileType;

    @Column(name = "file_size")
    private Long fileSize;

    @JsonProperty("isFile")
    @Column(name = "is_file", nullable = false)
    private Boolean file = false;

    public Message() {}

    @PrePersist
    protected void onCreate() {
        if (this.timestamp == null) this.timestamp = LocalDateTime.now();
        if (this.file == null)      this.file = false;
    }

    // ── Getters & Setters ──────────────────────────────────────

    public Long getId()                        { return id; }

    public Long getSenderId()                  { return senderId; }
    public void setSenderId(Long v)            { this.senderId = v; }

    public Long getReceiverId()                { return receiverId; }
    public void setReceiverId(Long v)          { this.receiverId = v; }

    public String getSender()                  { return sender; }
    public void setSender(String v)            { this.sender = v; }

    public String getReceiver()                { return receiver; }
    public void setReceiver(String v)          { this.receiver = v; }

    public LocalDateTime getTimestamp()        { return timestamp; }
    public void setTimestamp(LocalDateTime v)  { this.timestamp = v; }

    public String getEncryptedContent()        { return encryptedContent; }
    public void setEncryptedContent(String v)  { this.encryptedContent = v; }

    public String getEncryptedKey()            { return encryptedKey; }
    public void setEncryptedKey(String v)      { this.encryptedKey = v; }

    public String getEncryptedKeyForSender()   { return encryptedKeyForSender; }
    public void setEncryptedKeyForSender(String v) { this.encryptedKeyForSender = v; }

    public String getIv()                      { return iv; }
    public void setIv(String v)                { this.iv = v; }

    public String getFileName()                { return fileName; }
    public void setFileName(String v)          { this.fileName = v; }

    public String getFileType()                { return fileType; }
    public void setFileType(String v)          { this.fileType = v; }

    public Long getFileSize()                  { return fileSize; }
    public void setFileSize(Long v)            { this.fileSize = v; }

    public Boolean isFile()                    { return file != null ? file : false; }
    public void setFile(Boolean v)             { this.file = (v != null) ? v : false; }
}
