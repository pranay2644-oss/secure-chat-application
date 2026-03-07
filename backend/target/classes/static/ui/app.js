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
        localStorage.setItem("token", data.token);
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
    currentUserEmail = payload.sub;

    document.getElementById("loggedUser").innerText = currentUserEmail;

    // 🔐 Load or Generate RSA Keys
    const keyData = await generateOrLoadRSAKeys();

    // ✅ Upload public key ONLY if newly generated
    if (keyData.isNew) {
        await fetch("/api/users/public-key", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "text/plain"
            },
            body: keyData.publicKey
        });
    }

    connectWebSocket();
    loadUsers(token);
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

            if (user.email === currentUserEmail) return;

            const li = document.createElement("li");
            li.className = "user-item";

            // 🔥 FIX: Make email safe for HTML ID
            const safeEmail = user.email.replace(/[@.]/g, "_");

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
            // 📩 RECEIVE MESSAGES
            // ==============================
            window.stompClient.subscribe("/user/queue/messages", async (msg) => {

                const message = JSON.parse(msg.body);

                console.log("WS MESSAGE:", message);

                const otherUser =
                    message.sender === window.currentUserEmail
                        ? message.receiver
                        : message.sender;

                if (!window.chatStore[otherUser]) {
                    window.chatStore[otherUser] = [];
                }

                // 🔥 FIXED FILE DETECTION
                const isFileMessage = message.isFile === true;
                if (isFileMessage) {

                    window.chatStore[otherUser].push({
                        sender: message.sender,
                        isFile: true,
                        encryptedContent: message.encryptedContent,
                        encryptedKey: message.encryptedKey,
                        iv: message.iv,
                        fileName: message.fileName,
                        fileType: message.fileType,
                        fileSize: message.fileSize
                    });

                } else {

                    // 🔐 TEXT MESSAGE
                    try {

                        const decrypted = await decryptMessage(
                            message.encryptedContent,
                            message.encryptedKey,
                            message.iv
                        );

                        window.chatStore[otherUser].push({
                            sender: message.sender,
                            isFile: false,
                            content: decrypted
                        });

                    } catch (e) {
                        console.error("Text decryption failed:", e);
                    }
                }

                // ✅ Render only if chat is currently open
                if (window.selectedUser && window.selectedUser.email === otherUser) {
                    renderChat(otherUser);
                }
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

    fetch(`/api/chat/history?user1=${currentUserEmail}&user2=${user.email}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => res.json())
    .then(async messages => {

       window.chatStore[user.email] = [];

        for (let msg of messages) {

            const isSentByCurrentUser = msg.senderId !== user.id;

            const senderEmail = isSentByCurrentUser
                ? currentUserEmail
                : user.email;

            // 🔥 FILE MESSAGE HISTORY
            if (msg.isFile) {

                chatStore[user.email].push({
                    sender: senderEmail,
                    isFile: true,
                    encryptedContent: msg.encryptedContent,
                    encryptedKey: msg.encryptedKey,
                    iv: msg.iv,
                    fileName: msg.fileName,
                    fileType: msg.fileType,
                    fileSize: msg.fileSize
                });

            } else {

                // 🔐 TEXT MESSAGE HISTORY
                const decrypted = await decryptMessage(
                    msg.encryptedContent,
                    msg.encryptedKey,
                    msg.iv
                );

                chatStore[user.email].push({
                    sender: senderEmail,
                    isFile: false,
                    content: decrypted
                });
            }
        }

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

    if (!text || !window.selectedUser || !window.stompClient) return;

    const token = localStorage.getItem("token");

    const receiverPublicKey = await fetch(
        `/api/users/public-key/${selectedUser.email}`,
        { headers: { "Authorization": "Bearer " + token } }
    ).then(res => res.text());

    const encryptedData = await encryptMessage(text, receiverPublicKey);

    if (!window.chatStore[window.selectedUser.email])
    window.chatStore[window.selectedUser.email] = [];

window.chatStore[window.selectedUser.email].push({
    sender: window.currentUserEmail,
    content: text
});

    renderChat(selectedUser.email);

window.stompClient.send("/app/chat", {}, JSON.stringify({
        sender: currentUserEmail,
        receiver: selectedUser.email,
        encryptedContent: encryptedData.encryptedContent,
        encryptedKey: encryptedData.encryptedKey,
        iv: encryptedData.iv
    }));

    input.value = "";
}

/* =========================================================
   PRESENCE
========================================================= */
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

function renderChat(email) {

    const messagesDiv = document.getElementById("messages");
    messagesDiv.innerHTML = "";

    const messages = window.chatStore[email] || [];

    messages.forEach(msg => {

        const type =
            msg.sender === currentUserEmail ? "sent" : "received";

        if (msg.isFile) {
            renderFileMessage(msg, type);
        } else {
            addMessage(msg.content, type);
        }
    });

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addMessage(text, type, time = null) {

    const container = document.getElementById("messages");

    const msgDiv = document.createElement("div");
    msgDiv.className = "message " + type;

    const textDiv = document.createElement("div");
    textDiv.className = "msg-text";
    textDiv.innerText = text;

    const timeDiv = document.createElement("div");
    timeDiv.className = "msg-time";
    timeDiv.innerText = formatTime(time);

    msgDiv.appendChild(textDiv);
    msgDiv.appendChild(timeDiv);

    container.appendChild(msgDiv);

    container.scrollTop = container.scrollHeight;
}

/* =========================================================
   FILE RENDERING (Improved UI)
========================================================= */

function renderFileMessage(msg, type, time = null) {

    const messagesDiv = document.getElementById("messages");

    const container = document.createElement("div");
    container.className = "message " + type;

    // File title
    const fileHeader = document.createElement("div");
    fileHeader.className = "file-header";
    fileHeader.innerText = "📎 " + msg.fileName;

    container.appendChild(fileHeader);

    // File size (if available)
    if (msg.fileSize) {

        const fileSize = document.createElement("div");
        fileSize.className = "file-size";

        const sizeKB = (msg.fileSize / 1024).toFixed(1);
        fileSize.innerText = sizeKB + " KB";

        container.appendChild(fileSize);
    }

    /* ================= IMAGE PREVIEW ================= */

    if (msg.fileType && msg.fileType.startsWith("image/")) {

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