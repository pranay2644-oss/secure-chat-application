/* =========================================================
   GLOBAL VARIABLES
========================================================= */
window.stompClient = null;
window.currentUserEmail = null;
window.selectedUser = null;
window.myKeyPair = null;
window.chatStore = {};




/* =========================================================
   SAFE BASE64 HELPERS (FIX FOR FILE ENCRYPTION)
========================================================= */

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(
            null,
            bytes.subarray(i, i + chunkSize)
        );
    }

    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);

    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return bytes.buffer;
}

/* =========================================================
   LOGIN FUNCTION
========================================================= */
function login() {

    const email = document.getElementById("email")?.value;
    const password = document.getElementById("password")?.value;

    if (!email || !password) {
        alert("Please enter email and password");
        return;
    }

    fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
    })
    .then(res => {
        if (!res.ok) throw new Error("Invalid email or password");
        return res.json();
    })
    .then(data => {

        // STORE LOGIN DATA
        localStorage.setItem("token", data.token);
        localStorage.setItem("email", email);

        // redirect to dashboard
        window.location.href = "/ui/dashboard.html";

    })
    .catch(err => alert(err.message));
}



// rsa keys 
   
async function generateOrLoadRSAKeys() {

    const storedPublic = localStorage.getItem("publicKey");
    const storedPrivate = localStorage.getItem("privateKey");

    try {
        // 🔁 If keys already exist → import them safely
        if (storedPublic && storedPrivate) {

            const publicKey = await crypto.subtle.importKey(
                "spki",
                base64ToArrayBuffer(storedPublic),
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["encrypt"]
            );

            const privateKey = await crypto.subtle.importKey(
                "pkcs8",
                base64ToArrayBuffer(storedPrivate),
                { name: "RSA-OAEP", hash: "SHA-256" },
                true,
                ["decrypt"]
            );

            window.myKeyPair = { publicKey, privateKey };

            return {
                publicKey: storedPublic,
                isNew: false
            };
        }
    } catch (error) {
        console.warn("Stored RSA keys corrupted. Regenerating...");
        localStorage.removeItem("publicKey");
        localStorage.removeItem("privateKey");
    }

    // 🔐 Generate new keys if not found or corrupted
    const keyPair = await crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256"
        },
        true,
        ["encrypt", "decrypt"]
    );

    const exportedPublic = await crypto.subtle.exportKey("spki", keyPair.publicKey);
    const exportedPrivate = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    // ✅ SAFE Base64 conversion
    const publicBase64 = arrayBufferToBase64(exportedPublic);
    const privateBase64 = arrayBufferToBase64(exportedPrivate);

    localStorage.setItem("publicKey", publicBase64);
    localStorage.setItem("privateKey", privateBase64);

    window.myKeyPair = keyPair;

    return {
        publicKey: publicBase64,
        isNew: true
    };
}


/* =========================================================
   🔐 ENCRYPT TEXT MESSAGE (AES + RSA)
========================================================= */
async function encryptMessage(message, receiverPublicKeyBase64) {

    // FIX: validate the key BEFORE doing any crypto work, so a bad
    // key fails fast with a clear message instead of a cryptic
    // DataError deep inside crypto.subtle.importKey()
    if (!receiverPublicKeyBase64 || typeof receiverPublicKeyBase64 !== "string") {
        const e = new Error("Receiver has no public key on file.");
        e.name = "DataError";
        throw e;
    }
    const cleanKey = receiverPublicKeyBase64.trim();
    if (!cleanKey || cleanKey === "null" || cleanKey.length < 200) {
        const e = new Error("Receiver public key is missing or corrupted (length=" + cleanKey.length + ").");
        e.name = "DataError";
        throw e;
    }

    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(message);

    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        encoded
    );

    let receiverPublicKey;
    try {
        receiverPublicKey = await crypto.subtle.importKey(
            "spki",
            base64ToArrayBuffer(cleanKey),
            { name: "RSA-OAEP", hash: "SHA-256" },
            false,
            ["encrypt"]
        );
    } catch (e) {
        e.name = "DataError";
        e.message = "Failed to import receiver public key: " + e.message;
        throw e;
    }

    const rawAESKey = await crypto.subtle.exportKey("raw", aesKey);

    const encryptedKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        receiverPublicKey,
        rawAESKey
    );

    return {
        encryptedContent: arrayBufferToBase64(encryptedData),
        encryptedKey: arrayBufferToBase64(encryptedKey),
        iv: arrayBufferToBase64(iv)
    };
}


/* =========================================================
   🔐 ENCRYPT FILE (Binary) (AES + RSA)
========================================================= */
async function encryptBinary(buffer, receiverPublicKeyBase64) {

    const aesKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedData = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        buffer
    );

    const receiverPublicKey = await crypto.subtle.importKey(
        "spki",
        base64ToArrayBuffer(receiverPublicKeyBase64),
        { name: "RSA-OAEP", hash: "SHA-256" },
        false,
        ["encrypt"]
    );

    const rawAESKey = await crypto.subtle.exportKey("raw", aesKey);

    const encryptedKey = await crypto.subtle.encrypt(
        { name: "RSA-OAEP" },
        receiverPublicKey,
        rawAESKey
    );

    return {
        encryptedContent: arrayBufferToBase64(encryptedData),
        encryptedKey: arrayBufferToBase64(encryptedKey),
        iv: arrayBufferToBase64(iv)
    };
}


/* =========================================================
   🔓 CORE DECRYPT ENGINE (AES + RSA)
========================================================= */
async function decryptBinary(encryptedContent, encryptedKey, iv) {

    if (!window.myKeyPair || !window.myKeyPair.privateKey) {
        throw new Error("Private key not loaded");
    }

    const encryptedBytes = base64ToArrayBuffer(encryptedContent);
    const encryptedKeyBytes = base64ToArrayBuffer(encryptedKey);
    const ivBytes = new Uint8Array(base64ToArrayBuffer(iv));

    const rawAESKey = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        window.myKeyPair.privateKey,
        encryptedKeyBytes
    );

    const aesKey = await crypto.subtle.importKey(
        "raw",
        rawAESKey,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );

    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        aesKey,
        encryptedBytes
    );

    return decrypted;
}


/* =========================================================
   🔓 DECRYPT TEXT MESSAGE
========================================================= */
async function decryptMessage(encryptedContent, encryptedKey, iv) {

    const decryptedBuffer = await decryptBinary(
        encryptedContent,
        encryptedKey,
        iv
    );

    return new TextDecoder().decode(decryptedBuffer);
}


/* =========================================================
   🔓 DECRYPT FILE (Download)
========================================================= */
async function decryptAndDownloadFile(msg) {

    try {

        if (!window.myKeyPair || !window.myKeyPair.privateKey) {
            alert("Encryption keys not ready. Please refresh and try again.");
            return;
        }

        if (!msg.encryptedContent || !msg.encryptedKey || !msg.iv) {
            alert("Invalid file data.");
            return;
        }

        const decrypted = await decryptBinary(
            msg.encryptedContent,
            msg.encryptedKey,
            msg.iv
        );

        const blob = new Blob([decrypted], {
            type: msg.fileType || "application/octet-stream"
        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");
        link.href = url;
        link.download = msg.fileName || "downloaded_file";

        document.body.appendChild(link);
        link.click();

        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        console.log("File decrypted successfully ✅");

    } catch (error) {
        console.error("File decryption failed:", error);
        alert("Failed to decrypt file. The encryption keys may not match.");
    }
}
/* =========================================================
   DASHBOARD INITIALIZATION
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {

    if (!document.getElementById("users")) return;

    const token = localStorage.getItem("token");
    if (!token) {
        window.location.href = "/ui/login.html";
        return;
    }

    const payload = parseJwt(token);

    // ✅ SET GLOBAL USER INFO
    window.currentUserEmail = payload.sub;

    // 🔥 IMPORTANT FIX (REQUIRED FOR CHAT TO WORK)
    window.currentUserId = payload.userId || payload.id;

    document.getElementById("loggedUser").innerText = window.currentUserEmail;

    try {
        // Load or Generate RSA Keys
        const keyData = await generateOrLoadRSAKeys();

        // FIX: always verify the key is actually on the server, not just
        // when freshly generated. Covers the case where a previous upload
        // silently failed (network blip / server restart) and the user
        // got stuck with no usable public key in the database forever.
        let keyConfirmed = false;
        try {
            const checkRes = await fetch(
                `/api/users/public-key/${encodeURIComponent(window.currentUserEmail)}`,
                { headers: { "Authorization": "Bearer " + token } }
            );
            if (checkRes.ok) {
                const serverKey = (await checkRes.text()).trim();
                // A valid base64 RSA-2048 SPKI key is ~390+ chars.
                // Anything shorter means it's missing/corrupted server-side.
                keyConfirmed = serverKey && serverKey !== "null" && serverKey.length > 200;
            }
        } catch (e) {
            console.warn("Could not verify stored public key, will re-upload:", e);
        }

        if (keyData.isNew || !keyConfirmed) {
            const uploadRes = await fetch("/api/users/public-key", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "text/plain"
                },
                body: keyData.publicKey
            });

            if (!uploadRes.ok) {
                console.error("Public key upload failed:", uploadRes.status);
                if (window.showToast) {
                    showToast("Warning: encryption key upload failed. Others may not be able to message you.", "error");
                }
            } else {
                console.log("Public key uploaded/refreshed successfully");
            }
        }

        // CONNECT EVERYTHING
        connectWebSocket();
        loadUsers(token);

    } catch (err) {
        console.error("Initialization error:", err);
    }
});


/* =========================================================
   LOAD USERS
========================================================= */
function loadUsers(token) {

    fetch("/api/users", {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(users => {

        const usersList = document.getElementById("users");
        usersList.innerHTML = "";

        users.forEach(user => {

            if (user.email === window.currentUserEmail) return;

            const li = document.createElement("li");
            li.className = "user-item";

            // FIX BUG 6: store safeId -> email mapping so refreshPresence()
            // can look it up directly instead of unreliably reversing it
            const safeEmail = user.email.replace(/[@.]/g, "_");
            window._presenceEmailMap = window._presenceEmailMap || {};
            window._presenceEmailMap[safeEmail] = user.email;

            li.innerHTML = `
                <div class="user-name">${user.username}</div>
                <div id="presence-${safeEmail}" 
                     class="presence-indicator">
                </div>
            `;

            li.onclick = () => openChat(user);

            usersList.appendChild(li);

            // 🔥 Update presence after adding element
            updateUserPresence(user.email);
        });
    })
    .catch(err => {
        console.error("Error loading users:", err);
    });
}
/* =========================================================
   WEBSOCKET CONNECT
========================================================= */
function connectWebSocket() {

    const token = localStorage.getItem("token");

    const socket = new SockJS("/chat?email=" + encodeURIComponent(window.currentUserEmail));

    window.stompClient = Stomp.over(socket);
    window.stompClient.debug = null;

    window.stompClient.connect(
        { Authorization: "Bearer " + token },
        () => {

            console.log("WebSocket Connected ✅");

            // ==============================
            // 📩 RECEIVE MESSAGES (FIXED)
            // ==============================
            window.stompClient.subscribe("/user/queue/messages", async (msg) => {

                const message = JSON.parse(msg.body);

                console.log("WS MESSAGE:", message);

                // ✅ FIX: determine correct user
                const otherUser =
                    (message.sender === window.currentUserEmail)
                        ? message.receiver
                        : message.sender;

                // ensure chat store exists
                if (!window.chatStore[otherUser]) {
                    window.chatStore[otherUser] = [];
                }

                // prevent duplicates
                if (window.chatStore[otherUser].some(m => m.id === message.id)) {
                    return;
                }

                const isFileMessage = message.isFile === true || message.file === true;

                if (isFileMessage) {

                    window.chatStore[otherUser].push({
                        id: message.id,
                        senderId: message.senderId,
                        isFile: true,
                        encryptedContent: message.encryptedContent,
                        encryptedKey: message.encryptedKey,
                        iv: message.iv,
                        fileName: message.fileName,
                        fileType: message.fileType,
                        fileSize: message.fileSize,
                        timestamp: message.timestamp
                    });

                } else {

                    try {
                        const decrypted = await decryptMessage(
                            message.encryptedContent,
                            message.encryptedKey,
                            message.iv
                        );

                        window.chatStore[otherUser].push({
                            id: message.id,
                            senderId: message.senderId,
                            isFile: false,
                            content: decrypted,
                            timestamp: message.timestamp
                        });

                    } catch (e) {
                        console.warn("Message decryption failed:", e);
                        return;
                    }
                }

                // ✅ FIX: only render if chat open
                if (window.selectedUser && window.selectedUser.email === otherUser) {
                    renderChat(otherUser);
                }
            });


            // ==============================
            // 🗑️ REAL-TIME DELETE MESSAGE
            // ==============================
            window.stompClient.subscribe("/user/queue/delete", (msg) => {

                const messageId = JSON.parse(msg.body);

                const user = window.selectedUser?.email;
                if (!user) return;

                if (!window.chatStore[user]) return;

                window.chatStore[user] =
                    window.chatStore[user].filter(m => m.id !== messageId);

                renderChat(user);
            });


            // ==============================
            // 🧹 REAL-TIME CLEAR CHAT
            // ==============================
            window.stompClient.subscribe("/user/queue/clear", () => {

                const user = window.selectedUser?.email;
                if (!user) return;

                window.chatStore[user] = [];
                renderChat(user);
            });


            // ==============================
            // 🟢 PRESENCE UPDATES
            // ==============================
            window.stompClient.subscribe("/topic/presence", (msg) => {

                const email = msg.body;

                updateUserPresence(email);

                if (window.selectedUser && window.selectedUser.email === email) {
                    updateChatHeaderPresence(email);
                }
            });

        },
        error => {
            console.error("WebSocket error:", error);
        }
    );
}
/* =========================================================
   OPEN CHAT
========================================================= */
function openChat(user) {

    window.selectedUser = user;

    document.getElementById("chatUsername").innerText = user.username;
    updateChatHeaderPresence(user.email);

    const token = localStorage.getItem("token");

    fetch(`/api/chat/history?user1=${window.currentUserEmail}&user2=${user.email}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(async messages => {

        // ✅ Reset chat store
        window.chatStore[user.email] = [];

        for (let msg of messages) {

            const isFileMessage = msg.isFile === true || msg.file === true;

            /* ================= FILE MESSAGE ================= */
            if (isFileMessage) {

                window.chatStore[user.email].push({
                    id: msg.id,
                    senderId: msg.senderId,
                    isFile: true,
                    encryptedContent: msg.encryptedContent,
                    encryptedKey: msg.encryptedKey,
                    iv: msg.iv,
                    fileName: msg.fileName,
                    fileType: msg.fileType,
                    fileSize: msg.fileSize,
                    timestamp: msg.timestamp
                });

            }

            /* ================= TEXT MESSAGE ================= */
            else {

                try {

                    const decrypted = await decryptMessage(
                        msg.encryptedContent,
                        msg.encryptedKey,
                        msg.iv
                    );

                    window.chatStore[user.email].push({
                        id: msg.id,
                        senderId: msg.senderId,
                        isFile: false,
                        content: decrypted,
                        timestamp: msg.timestamp
                    });

                } catch (e) {
                    console.warn("Message decryption failed, skipping:", e);
                    continue;
                }
            }
        }

        // ✅ Render after loading all messages
        renderChat(user.email);

    })
    .catch(err => {
        console.error("Error loading chat history:", err);
    });
}
/* =========================================================
   SEND MESSAGE
========================================================= */
async function sendMessage() {

    const input = document.getElementById("messageInput");
    const text = input.value.trim();

    // ❗ IMPORTANT: no stompClient check anymore
    if (!text || !window.selectedUser) return;

    const token = localStorage.getItem("token");

    try {

        // 🔐 Fetch receiver public key
        const res = await fetch(
            `/api/users/public-key/${window.selectedUser.email}`,
            {
                headers: {
                    "Authorization": "Bearer " + token
                }
            }
        );

        if (!res.ok) {
            throw new Error("Failed to fetch public key");
        }

        const receiverPublicKey = await res.text();

        // 🔐 Encrypt message (AES + RSA)
        const encryptedData = await encryptMessage(text, receiverPublicKey);

        // ✅ SEND MESSAGE VIA REST (CORE FIX)
        const response = await fetch("/api/chat/send", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                receiver: window.selectedUser.email,
                encryptedContent: encryptedData.encryptedContent,
                encryptedKey: encryptedData.encryptedKey,
                iv: encryptedData.iv,
                isFile: false
            })
        });

        if (!response.ok) {
            throw new Error("Message send failed");
        }

        // ✅ Clear input only (NO local render)
        input.value = "";

    } catch (error) {
        console.error("Send message error:", error);

        // FIX: DataError from crypto.subtle.importKey means the
        // RECEIVER's stored public key is invalid/missing in the DB.
        // This is exactly why one user can send but the other can't.
        const isKeyProblem =
            error.name === "DataError" ||
            error.name === "OperationError" ||
            (error.message || "").includes("public key");

        if (isKeyProblem) {
            const who = window.selectedUser ? window.selectedUser.username : "this contact";
            const text = `Cannot send: ${who}'s encryption key is missing or invalid. Ask them to log out and log back in.`;
            if (window.showToast) showToast(text, "error");
            else alert(text);
        } else {
            if (window.showToast) showToast("Failed to send message", "error");
            else alert("Failed to send message. Please try again.");
        }
    }
}
/* =========================================================
   PRESENCE
========================================================= */
function updateUserPresence(username) {

    const token = localStorage.getItem("token");

    fetch(`/api/presence/${username}`, {
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
    })
    .then(data => {

        const safeId =
            "presence-" + username.replace(/[@.]/g, "_");

        const el = document.getElementById(safeId);
        if (!el) return;

        if (data.online) {
            el.innerHTML = "🟢 Online";
        } else if (data.lastSeen) {
            el.innerHTML =
                "Last seen " +
                new Date(data.lastSeen).toLocaleTimeString();
        } else {
            el.innerHTML = "Offline";
        }
    })
    .catch(err => {
        console.error("Presence error:", err);
    });
}

function updateChatHeaderPresence(username) {

    const token = localStorage.getItem("token");

    fetch(`/api/presence/${username}`, {
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(res => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
    })
    .then(data => {

        const el = document.getElementById("chatPresence");
        if (!el) return;

        if (data.online) {
            el.innerHTML = "🟢 Online";
        } else if (data.lastSeen) {
            el.innerHTML =
                "Last seen " +
                new Date(data.lastSeen).toLocaleTimeString();
        } else {
            el.innerHTML = "Offline";
        }
    })
    .catch(err => {
        console.error("Chat header presence error:", err);
    });
}

/* =========================================================
   RENDER CHAT
========================================================= */

// ==========================
// RENDER CHAT (FIXED)
// ==========================
// ==========================
// RENDER CHAT (UPDATED)
// ==========================
function renderChat(email) {

    const messagesDiv = document.getElementById("messages");
    messagesDiv.innerHTML = "";

    const messages = window.chatStore[email] || [];

    messages.forEach(msg => {

        const type =
            (msg.sender && msg.sender === window.currentUserEmail) ||
            (msg.senderId != null && msg.senderId === window.currentUserId)
                ? "sent" : "received";

        if (msg.isFile === true) {
            renderFileMessage(msg, type, msg.timestamp);
        } else {
            addMessage(msg, type);
        }
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}


// ==========================
// ADD TEXT MESSAGE (UPDATED)
// ==========================
function addMessage(msg, type) {

    const container = document.getElementById("messages");

    const msgDiv = document.createElement("div");
    msgDiv.className = "message " + type;

    // TEXT
    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerText = msg.content;

    // TIME
    const timeDiv = document.createElement("div");
    timeDiv.className = "msg-time";
    timeDiv.innerText = formatTime(msg.timestamp);

    msgDiv.appendChild(textDiv);
    msgDiv.appendChild(timeDiv);

    // 🗑️ DELETE BUTTON (only for your messages)
    if ((msg.sender && msg.sender === window.currentUserEmail) ||
        (msg.senderId != null && msg.senderId === window.currentUserId)) {

        const deleteBtn = document.createElement("button");
        deleteBtn.innerText = "🗑️";
        deleteBtn.className = "delete-btn";

        deleteBtn.onclick = () => deleteMessage(msg.id);

        msgDiv.appendChild(deleteBtn);
    }

    container.appendChild(msgDiv);
}


// ==========================
// DELETE MESSAGE FUNCTION
// ==========================
function deleteMessage(messageId) {

    const token = localStorage.getItem("token");

    fetch(`/api/chat/message/${messageId}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + token
        }
    })
    .then(() => {
        const user = window.selectedUser.email;

        // Remove from local store
        window.chatStore[user] =
            window.chatStore[user].filter(m => m.id !== messageId);

        renderChat(user);
    })
    .catch(err => {
        console.error("Delete error:", err);
    });
}
/* =========================================================
   FILE RENDERING (Improved UI)
========================================================= */

function renderFileMessage(msg, type, time = null) {

    const messagesDiv = document.getElementById("messages");

    const container = document.createElement("div");
    container.className = "message " + type;

    /* ================= FILE TITLE ================= */

    const fileHeader = document.createElement("div");
    fileHeader.className = "file-header";
    fileHeader.innerText = "📎 " + msg.fileName;

    container.appendChild(fileHeader);

    /* ================= FILE SIZE ================= */

    if (msg.fileSize) {

        const fileSize = document.createElement("div");
        fileSize.className = "file-size";

        const sizeKB = (msg.fileSize / 1024).toFixed(1);
        fileSize.innerText = sizeKB + " KB";

        container.appendChild(fileSize);
    }

    /* ================= IMAGE PREVIEW ================= */

    if (
        msg.fileType &&
        msg.fileType.startsWith("image/")
        // FIX: removed senderId check — preview now shows for BOTH sender and receiver
    ) {

        const img = document.createElement("img");
        img.className = "image-preview";

        container.appendChild(img);

        decryptBinary(
            msg.encryptedContent,
            msg.encryptedKey,
            msg.iv
        )
        .then(decrypted => {

            const blob = new Blob([decrypted], {
                type: msg.fileType
            });

            const url = URL.createObjectURL(blob);

            img.src = url;

        })
        .catch(err => {
            console.error("Image preview failed:", err);
        });
    }

    
    /* ================= DOWNLOAD BUTTON ================= */

    const downloadBtn = document.createElement("button");

    downloadBtn.className = "download-btn";
    downloadBtn.innerText = "⬇ Download";

    downloadBtn.onclick = async () => {
        await decryptAndDownloadFile(msg);
    };

    container.appendChild(downloadBtn);

    /* ================= MESSAGE TIME ================= */

    const timeDiv = document.createElement("div");
    timeDiv.className = "msg-time";
    timeDiv.innerText = formatTime(time);

    container.appendChild(timeDiv);

    messagesDiv.appendChild(container);

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

  
/* =========================================================
   HELPERS
========================================================= */

/* =========================================================
   TIME FORMAT
========================================================= */

function formatTime(date) {

    const d = date ? new Date(date) : new Date();

    let hours = d.getHours();
    let minutes = d.getMinutes();

    if (minutes < 10) minutes = "0" + minutes;

    return hours + ":" + minutes;
}



function logout() {

    if (window.stompClient) {
        window.stompClient.disconnect(() => {
            console.log("WebSocket disconnected");
        });
    }

    localStorage.clear();
    window.location.href = "/ui/login.html";
}

function parseJwt(token) {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
}

function handleEnter(event) {
    if (event.key === "Enter") sendMessage();
}

/* =========================================================
   FORCE DISCONNECT ON TAB CLOSE
========================================================= */
window.addEventListener("beforeunload", function () {
    if (window.stompClient) {
        window.stompClient.disconnect();
    }
});


function refreshPresence(){

    // FIX BUG 6: use the stored safeId -> email map instead of trying
    // to reverse-engineer the email from underscores (was corrupting
    // emails that legitimately contain underscores, e.g. john_doe@x.com)
    document.querySelectorAll("[id^='presence-']").forEach(el => {

        const safeId = el.id.replace("presence-", "");
        const email = (window._presenceEmailMap && window._presenceEmailMap[safeId])
            || safeId.replace(/_/g, ".");  // fallback for safety

        updateUserPresence(email);

    });

}