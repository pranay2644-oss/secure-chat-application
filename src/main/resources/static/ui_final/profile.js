/* =========================================================
   PROFILE.JS — Secure Chat
   Handles: load profile, update profile, avatar preview,
            password change, display name sync
========================================================= */

const _email = localStorage.getItem("email");
const _token = localStorage.getItem("token");

if (!_email || !_token) {
    window.location.href = "login.html";
}

/* =========================================================
   LOAD PROFILE
========================================================= */
fetch(`/api/profile/${encodeURIComponent(_email)}`, {
    headers: { "Authorization": "Bearer " + _token }
})
.then(response => {
    if (!response.ok) throw new Error("Failed to load profile");
    return response.json();
})
.then(data => {

    /* Email field */
    const emailField = document.getElementById("email");
    if (emailField) {
        emailField.value = data.email || _email;
    }

    /* Email display below avatar */
    const emailDisplay = document.getElementById("emailDisplay");
    if (emailDisplay) {
        emailDisplay.textContent = data.email || _email;
    }

    /* Username */
    const usernameField = document.getElementById("username");
    if (usernameField) {
        usernameField.value = data.username || "";
        updateCharCount("username", "usernameCount", 32);
    }

    /* Display name in card header */
    const displayName = document.getElementById("displayName");
    if (displayName) {
        displayName.textContent = data.username || "My Profile";
    }

    /* Status */
    const statusField = document.getElementById("status");
    if (statusField) {
        statusField.value = data.statusMessage || "";
        updateCharCount("status", "statusCount", 80);
    }

    /* Sync to localStorage so dashboard picks it up */
    if (data.username) localStorage.setItem("username", data.username);
    if (data.profilePicture) localStorage.setItem("profilePicture", data.profilePicture);

    /* Avatar — set initial letter */
    const initial = (data.username || data.email || "?").charAt(0).toUpperCase();
    const initialEl = document.getElementById("avatarInitial");
    if (initialEl) initialEl.textContent = initial;

    /* Avatar — show real picture if exists */
    if (data.profilePicture) {
        const img = document.getElementById("profilePic");
        if (img) {
            img.src = data.profilePicture;
            img.onload = () => {
                img.classList.add("loaded");
                const initEl = document.getElementById("avatarInitial");
                if (initEl) initEl.style.display = "none";
            };
            img.onerror = () => {
                img.classList.remove("loaded");
            };
        }
    }
})
.catch(error => {
    console.error("Error loading profile:", error);
    if (window.showToast) showToast("Could not load profile", "error");

    /* Fallback: show email initial */
    const initial = (_email || "?").charAt(0).toUpperCase();
    const initialEl = document.getElementById("avatarInitial");
    if (initialEl) initialEl.textContent = initial;

    const emailDisplay = document.getElementById("emailDisplay");
    if (emailDisplay) emailDisplay.textContent = _email || "";
});


/* =========================================================
   PROFILE IMAGE PREVIEW
========================================================= */
const imageInput = document.getElementById("profileImageUpload");

if (imageInput) {
    imageInput.addEventListener("change", function () {
        const file = this.files[0];
        if (!file) return;

        /* Size guard — 2 MB max for base64 storage */
        if (file.size > 2 * 1024 * 1024) {
            if (window.showToast) showToast("Image too large — max 2 MB", "error");
            this.value = "";
            return;
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const img      = document.getElementById("profilePic");
            const initEl   = document.getElementById("avatarInitial");
            if (img) {
                img.src = e.target.result;
                img.onload = () => {
                    img.classList.add("loaded");
                    if (initEl) initEl.style.display = "none";
                };
            }
            if (window.showToast) showToast("Photo selected — click Save to apply", "info");
        };
        reader.readAsDataURL(file);
    });
}


/* =========================================================
   UPDATE PROFILE (called from doSave() in HTML)
   Returns a Promise so doSave() can chain .then/.catch
========================================================= */
function updateProfile() {
    const username = document.getElementById("username")?.value?.trim();
    const status   = document.getElementById("status")?.value?.trim();

    if (!username) {
        if (window.showToast) showToast("Display name cannot be empty", "error");
        return Promise.reject(new Error("Username empty"));
    }

    /* Collect profile picture (only if changed) */
    const img     = document.getElementById("profilePic");
    const picData = img?.classList.contains("loaded") ? img.src : null;

    const body = {
        email:         _email,
        username:      username,
        statusMessage: status || ""
    };

    /* Only include picture if a new base64 image was selected */
    if (picData && picData.startsWith("data:image")) {
        body.profilePicture = picData;
    }

    return fetch("/api/profile/update", {
        method: "PUT",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + _token
        },
        body: JSON.stringify(body)
    })
    .then(response => {
        if (!response.ok) {
            return response.text().then(t => {
                throw new Error(t || "Profile update failed: " + response.status);
            });
        }
        return response.json();
    })
    .then(data => {
        /* Sync localStorage — dashboard reads these on load */
        localStorage.setItem("username", data.username || username);
        if (data.profilePicture) {
            localStorage.setItem("profilePicture", data.profilePicture);
        }

        /* Update avatar initial */
        const newInitial = (data.username || username).charAt(0).toUpperCase();
        const initEl = document.getElementById("avatarInitial");
        const pic    = document.getElementById("profilePic");
        if (initEl && !(pic?.classList.contains("loaded"))) {
            initEl.textContent = newInitial;
        }

        /* Update card heading */
        const displayName = document.getElementById("displayName");
        if (displayName) displayName.textContent = data.username || username;

        return data;
    });
}


/* =========================================================
   CHANGE PASSWORD  (called from doSave when section is open)
   NOTE: Requires a /api/profile/change-password endpoint.
   If your backend does not have it yet, this is a no-op
   that logs a warning — wire it up when ready.
========================================================= */
function changePassword() {
    const current = document.getElementById("currentPassword")?.value;
    const newPw   = document.getElementById("newPassword")?.value;
    const confirm = document.getElementById("confirmPassword")?.value;

    if (!current || !newPw || !confirm) {
        if (window.showToast) showToast("Please fill all password fields", "error");
        return Promise.reject(new Error("Missing fields"));
    }

    if (newPw !== confirm) {
        if (window.showToast) showToast("Passwords do not match", "error");
        return Promise.reject(new Error("Mismatch"));
    }

    if (newPw.length < 6) {
        if (window.showToast) showToast("Password must be at least 6 characters", "error");
        return Promise.reject(new Error("Too short"));
    }

    return fetch("/api/profile/change-password", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + _token
        },
        body: JSON.stringify({
            email:           _email,
            currentPassword: current,
            newPassword:     newPw
        })
    })
    .then(res => {
        if (!res.ok) return res.text().then(t => { throw new Error(t || "Password change failed"); });
        return res.json();
    });
}
