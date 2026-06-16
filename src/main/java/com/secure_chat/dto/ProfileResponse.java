package com.secure_chat.dto;

/**
 * Safe profile response — never exposes password, publicKey, or other sensitive fields.
 */
public class ProfileResponse {

    private Long   id;
    private String email;
    private String username;
    private String statusMessage;
    private String profilePicture;

    public ProfileResponse() {}

    public ProfileResponse(Long id, String email, String username,
                           String statusMessage, String profilePicture) {
        this.id             = id;
        this.email          = email;
        this.username       = username;
        this.statusMessage  = statusMessage;
        this.profilePicture = profilePicture;
    }

    public Long   getId()             { return id; }
    public String getEmail()          { return email; }
    public String getUsername()       { return username; }
    public String getStatusMessage()  { return statusMessage; }
    public String getProfilePicture() { return profilePicture; }
}
