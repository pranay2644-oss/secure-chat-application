package com.secure_chat.dto;

/**
 * DTO for profile update requests.
 * Using a dedicated DTO instead of the User entity directly prevents:
 * - Password field being accidentally overwritten
 * - Spring Security conflicts with UserDetails deserialization
 * - Exposing internal entity structure to the API
 */
public class ProfileUpdateRequest {

    private String email;
    private String username;
    private String statusMessage;
    private String profilePicture;  // base64 image or null

    public ProfileUpdateRequest() {}

    public String getEmail()          { return email; }
    public void setEmail(String v)    { this.email = v; }

    public String getUsername()       { return username; }
    public void setUsername(String v) { this.username = v; }

    public String getStatusMessage()       { return statusMessage; }
    public void setStatusMessage(String v) { this.statusMessage = v; }

    public String getProfilePicture()       { return profilePicture; }
    public void setProfilePicture(String v) { this.profilePicture = v; }
}
