package com.secure_chat.dto;

public class UserDTO {
    private Long   id;
    private String username;
    private String email;
    private String profilePicture;  // base64 or null
    private String statusMessage;

    public UserDTO(Long id, String username, String email,
                   String profilePicture, String statusMessage) {
        this.id             = id;
        this.username       = username;
        this.email          = email;
        this.profilePicture = profilePicture;
        this.statusMessage  = statusMessage;
    }

    public Long   getId()             { return id; }
    public String getUsername()       { return username; }
    public String getEmail()          { return email; }
    public String getProfilePicture() { return profilePicture; }
    public String getStatusMessage()  { return statusMessage; }
}
