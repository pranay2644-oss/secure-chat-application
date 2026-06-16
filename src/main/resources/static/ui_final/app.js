/* =========================================================
   
========================================================= */

/* ── Global State ── */
window.stompClient       = null;
window.currentUserEmail  = null;
window.currentUserId     = null;
window.selectedUser      = null;
window.myKeyPair         = null;
window.chatStore         = {};
window._presenceEmailMap = {};
window._blobUrls         = [];

/* =========================================================
   BASE64 HELPERS
========================================================= */
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}

/* =========================================================
   JWT PARSER
========================================================= */
function parseJwt(token) {
    try {
        const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        return JSON.parse(atob(b64));
    } catch (e) {
        console.error("JWT parse error:", e);
        return null;
    }
}

/* =========================================================
   RSA KEY MANAGEMENT  (private key in IndexedDB — never localStorage)
========================================================= */
const IDB_NAME    = "chatAppKeys";
const IDB_STORE   = "keys";
const IDB_VERSION = 1;

function openKeyDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
    });
}
async function savePrivateKey(key) {
    const db = await openKeyDB();
    return new Promise((res, rej) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(key, "privateKey");
        tx.oncomplete = () => res();
        tx.onerror    = e => rej(e.target.error);
    });
}
async function loadPrivateKey() {
    const db = await openKeyDB();
    return new Promise((res, rej) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get("privateKey");
        req.onsuccess = e => res(e.target.result || null);
        req.onerror   = e => rej(e.target.error);
    });
}
async function deletePrivateKey() {
    const db = await openKeyDB();
    return new Promise((res, rej) => {
        const req = db.transaction(IDB_STORE, "readwrite").objectStore(IDB_STORE).delete("privateKey");
        req.onsuccess = () => res();
        req.onerror   = e => rej(e.target.error);
    });
}

/* =========================================================
   RSA KEY GENERATION / LOADING
   BUG FIX: keys are non-extractable for the private key;
   public key is stored in localStorage as SPKI base64.
   Private key stored in IndexedDB (survives sessions).
========================================================= */
async function generateOrLoadRSAKeys() {
    const storedPublic = localStorage.getItem("publicKey");
    try {
        if (storedPublic) {
            const privateKey = await loadPrivateKey();
            if (privateKey) {
                const publicKey = await crypto.subtle.importKey(
                    "spki", base64ToArrayBuffer(storedPublic),
                    { name: "RSA-OAEP", hash: "SHA-256" }, true, ["encrypt"]
                );
                window.myKeyPair = { publicKey, privateKey };
                return { publicKey: storedPublic, isNew: false };
            }
        }
    } catch (e) {
        console.warn("Key load failed, regenerating:", e);
        localStorage.removeItem("publicKey");
        await deletePrivateKey().catch(() => {});
    }

    // Generate new pair — private key non-extractable (security requirement)
    const pair = await crypto.subtle.generateKey(
        { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
        false, ["encrypt", "decrypt"]
    );
    const exported  = await crypto.subtle.exportKey("spki", pair.publicKey);
    const pubBase64 = arrayBufferToBase64(exported);

    localStorage.setItem("publicKey", pubBase64);
    await savePrivateKey(pair.privateKey);
    window.myKeyPair = pair;
    return { publicKey: pubBase64, isNew: true };
}

/* =========================================================
   ENCRYPTION  — AES-GCM-256 + RSA-OAEP dual-key
   
========================================================= */
async function encryptForBoth(data, receiverPubB64, senderPubB64) {
    // Generate fresh AES-256-GCM key + random IV for every message
    const aesKey  = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt","decrypt"]);
    const iv      = crypto.getRandomValues(new Uint8Array(12));
    const payload = (typeof data === "string") ? new TextEncoder().encode(data) : data;

    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, payload);
    const rawAES     = await crypto.subtle.exportKey("raw", aesKey);

    const importPub = async (b64) => crypto.subtle.importKey(
        "spki", base64ToArrayBuffer(b64), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]
    );
    const wrapAES = async (pubKey) => crypto.subtle.encrypt({ name: "RSA-OAEP" }, pubKey, rawAES);

    const [ekReceiver, ekSender] = await Promise.all([
        wrapAES(await importPub(receiverPubB64)),
        wrapAES(await importPub(senderPubB64))
    ]);

    return {
        encryptedContent:      arrayBufferToBase64(ciphertext),
        encryptedKey:          arrayBufferToBase64(ekReceiver),
        encryptedKeyForSender: arrayBufferToBase64(ekSender),
        iv:                    arrayBufferToBase64(iv)
    };
}

/* =========================================================
   DECRYPTION HELPERS
   
========================================================= */
async function decryptBinary(encryptedContent, encryptedKey, iv) {
    if (!window.myKeyPair?.privateKey) throw new Error("Private key not loaded");

    const rawAES = await crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        window.myKeyPair.privateKey,
        base64ToArrayBuffer(encryptedKey)
    );
    const aesKey = await crypto.subtle.importKey("raw", rawAES, { name: "AES-GCM" }, false, ["decrypt"]);
    return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) },
        aesKey,
        base64ToArrayBuffer(encryptedContent)
    );
}

// Pick the correct wrapped-AES key for the current viewer
function resolveKey(msg) {
    if (msg.sender === window.currentUserEmail && msg.encryptedKeyForSender) {
        return msg.encryptedKeyForSender;
    }
    return msg.encryptedKey;
}

async function decryptMessage(msg) {
    const buf = await decryptBinary(msg.encryptedContent, resolveKey(msg), msg.iv);
    return new TextDecoder().decode(buf);
}

async function decryptAndDownloadFile(msg) {
    try {
        if (!window.myKeyPair?.privateKey) {
            if (window.showToast) showToast("Keys not ready — refresh.", "error");
            return;
        }
        const buf  = await decryptBinary(msg.encryptedContent, resolveKey(msg), msg.iv);
        const blob = new Blob([buf], { type: msg.fileType || "application/octet-stream" });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href = url; a.download = msg.fileName || "file";
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch (e) {
        console.error("Download decrypt failed:", e);
        if (window.showToast) showToast("Failed to decrypt file — keys may not match.", "error");
    }
}

/* =========================================================
   DASHBOARD INIT
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
    if (!document.getElementById("users")) return;

    const token = localStorage.getItem("token");
    if (!token) { window.location.href = "login.html"; return; }

    const payload = parseJwt(token);
    if (!payload) {
        if (window.showToast) showToast("Session expired. Please log in again.", "error");
        else alert("Session expired. Please log in again.");
        localStorage.clear();
        window.location.href = "login.html";
        return;
    }

    window.currentUserEmail = payload.sub;
    window.currentUserId    = payload.userId || payload.id;

    const loggedEl = document.getElementById("loggedUser");
    // Show saved username if available, fallback to email
    const savedUsername = localStorage.getItem("username");
    if (loggedEl) loggedEl.innerText = savedUsername || window.currentUserEmail;

    if (window._updateMyAvatar) window._updateMyAvatar(savedUsername || window.currentUserEmail);

    // Load profile picture into sidebar avatar if saved
    _loadSidebarProfilePic();

    try {
        const keyData = await generateOrLoadRSAKeys();
        if (keyData.isNew) {
            const r = await fetch("/api/users/public-key", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "text/plain" },
                body: keyData.publicKey
            });
            if (!r.ok) console.error("Failed to upload public key:", r.status);
        }
        connectWebSocket();
        loadUsers(token);
    } catch (err) {
        console.error("Init error:", err);
        if (window.showToast) showToast("Failed to initialize. Please refresh.", "error");
        else alert("Failed to initialize. Please refresh.");
    }
});

/* =========================================================
   LOAD USERS
   
========================================================= */
const AVATAR_GRADIENTS = ["av-g1","av-g2","av-g3","av-g4","av-g5","av-g6"];

function avatarClass(email) {
    let hash = 0;
    for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
    return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function loadUsers(token) {
    fetch("/api/users", { headers: { "Authorization": "Bearer " + token } })
    .then(res => { if (!res.ok) throw new Error("Failed to load users"); return res.json(); })
    .then(users => {
        const list = document.getElementById("users");
        list.innerHTML = "";
        window._presenceEmailMap = {};

        users.forEach(user => {
            if (user.email === window.currentUserEmail) return;

            const li   = document.createElement("li");
            li.className = "user-item";
            li.dataset.email = user.email;

            const safe = emailToSafeId(user.email);
            window._presenceEmailMap[safe] = user.email;

            const initial  = (user.username || user.email || "?").charAt(0).toUpperCase();
            const avClass  = avatarClass(user.email);

            // Build avatar — photo if available, else initial letter circle
            const avatarHTML = user.profilePicture
                ? `<div class="user-avatar ${avClass}" style="background-image:url('${user.profilePicture}');background-size:cover;background-position:center;color:transparent;">${escapeHtml(initial)}</div>`
                : `<div class="user-avatar ${avClass}">${escapeHtml(initial)}</div>`;

            // Status message shown as subtitle if present, else presence
            li.innerHTML = `
                ${avatarHTML}
                <div class="user-meta">
                    <div class="user-name">${escapeHtml(user.username)}</div>
                    ${user.statusMessage ? `<div class="user-status-msg">${escapeHtml(user.statusMessage)}</div>` : ''}
                    <div id="presence-${safe}" class="presence-indicator"></div>
                </div>`;

            li.onclick = () => openChat(user);
            list.appendChild(li);
            updateUserPresence(user.email);
        });
    })
    .catch(err => console.error("loadUsers error:", err));
}

/* =========================================================
   WEBSOCKET
   
========================================================= */
let _wsReconnectTimer = null;
let _subscriptions    = {};

function connectWebSocket() {
    // Clean disconnect before reconnecting
    if (window.stompClient && window.stompClient.connected) {
        window.stompClient.disconnect();
    }

    const token  = localStorage.getItem("token");
    const socket = new SockJS("/chat?email=" + encodeURIComponent(window.currentUserEmail));
    window.stompClient       = Stomp.over(socket);
    window.stompClient.debug = null;
    window.stompClient.connect(
        { Authorization: "Bearer " + token },
        onWsConnected,
        onWsError
    );
}

function _safeSubscribe(destination, callback) {
    if (_subscriptions[destination]) {
        try { _subscriptions[destination].unsubscribe(); } catch (e) {}
        delete _subscriptions[destination];
    }
    _subscriptions[destination] = window.stompClient.subscribe(destination, callback);
}

function onWsConnected() {
    console.log("WebSocket Connected");
    if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }

    _safeSubscribe(
        "/topic/messages/" + window.currentUserEmail,
        async (frame) => {
            try { await handleIncomingMessage(JSON.parse(frame.body)); }
            catch (e) { console.error("WS message error:", e); }
        }
    );

    _safeSubscribe("/user/queue/delete", (frame) => {
        const id   = JSON.parse(frame.body);
        const user = window.selectedUser?.email;
        if (!user || !window.chatStore[user]) return;
        window.chatStore[user] = window.chatStore[user].filter(m => m.id !== id);
        renderChat(user);
    });

    _safeSubscribe("/user/queue/clear", () => {
        const user = window.selectedUser?.email;
        if (!user) return;
        window.chatStore[user] = [];
        renderChat(user);
    });

    _safeSubscribe("/topic/presence", (frame) => {
        const email = frame.body;
        updateUserPresence(email);
        if (window.selectedUser?.email === email) updateChatHeaderPresence(email);
    });
}

/* =========================================================
   INCOMING MESSAGE HANDLER
   
========================================================= */
async function handleIncomingMessage(message) {
    const otherUser = message.sender === window.currentUserEmail
        ? message.receiver : message.sender;

    if (!otherUser) { console.warn("Cannot identify otherUser:", message); return; }
    if (!window.chatStore[otherUser]) window.chatStore[otherUser] = [];
    if (window.chatStore[otherUser].some(m => m.id === message.id)) return; // dedup

    if (message.isFile || message.file) {
        window.chatStore[otherUser].push({
            id: message.id, sender: message.sender, receiver: message.receiver,
            isFile: true,
            encryptedContent: message.encryptedContent,
            encryptedKey: message.encryptedKey,
            encryptedKeyForSender: message.encryptedKeyForSender,
            iv: message.iv, fileName: message.fileName,
            fileType: message.fileType, fileSize: message.fileSize,
            timestamp: message.timestamp
        });
    } else {
        try {
            const text = await decryptMessage(message);
            window.chatStore[otherUser].push({
                id: message.id, sender: message.sender, receiver: message.receiver,
                isFile: false, content: text, timestamp: message.timestamp
            });
        } catch (e) { console.warn("Decrypt failed:", e); return; }
    }

    if (window.selectedUser?.email === otherUser) renderChat(otherUser);
}

function onWsError(err) {
    console.error("WS error:", err);
    if (!_wsReconnectTimer) {
        _wsReconnectTimer = setTimeout(() => { _wsReconnectTimer = null; connectWebSocket(); }, 5000);
    }
}

/* =========================================================
   OPEN CHAT
========================================================= */
async function openChat(user) {
    window.selectedUser = user;

    if (window.showChatPanel) window.showChatPanel();

    // Update header
    const el = document.getElementById("chatUsername");
    if (el) el.innerText = user.username;
    if (window._updateChatHeader) window._updateChatHeader(user.username);
    updateChatHeaderPresence(user.email);

    // Set header avatar — photo if available, else initial letter
    const hdrAv = document.getElementById("chatHeaderAvatar");
    if (hdrAv) {
        hdrAv.className = "chat-header-avatar " + avatarClass(user.email);
        const hdrInitial = (user.username || user.email || "?").charAt(0).toUpperCase();
        if (user.profilePicture) {
            hdrAv.style.backgroundImage    = "url(" + user.profilePicture + ")";
            hdrAv.style.backgroundSize     = "cover";
            hdrAv.style.backgroundPosition = "center";
            hdrAv.style.color              = "transparent";
            hdrAv.textContent              = hdrInitial;
        } else {
            hdrAv.style.backgroundImage = "";
            hdrAv.style.color           = "";
            hdrAv.textContent           = hdrInitial;
        }
    }

    // Highlight active user
    document.querySelectorAll(".user-item").forEach(li => {
        li.classList.toggle("active", li.dataset.email === user.email);
    });

    const token = localStorage.getItem("token");
    try {
        const res = await fetch(
            `/api/chat/history?user1=${encodeURIComponent(window.currentUserEmail)}&user2=${encodeURIComponent(user.email)}`,
            { headers: { "Authorization": "Bearer " + token } }
        );
        if (!res.ok) throw new Error("History fetch failed: " + res.status);

        const messages = await res.json();
        window.chatStore[user.email] = [];

        for (const msg of messages) {
            if (msg.isFile || msg.file) {
                window.chatStore[user.email].push({
                    id: msg.id, sender: msg.sender, receiver: msg.receiver,
                    isFile: true,
                    encryptedContent: msg.encryptedContent,
                    encryptedKey: msg.encryptedKey,
                    encryptedKeyForSender: msg.encryptedKeyForSender,
                    iv: msg.iv, fileName: msg.fileName,
                    fileType: msg.fileType, fileSize: msg.fileSize,
                    timestamp: msg.timestamp
                });
            } else {
                try {
                    const text = await decryptMessage(msg);
                    window.chatStore[user.email].push({
                        id: msg.id, sender: msg.sender, receiver: msg.receiver,
                        isFile: false, content: text, timestamp: msg.timestamp
                    });
                } catch (e) { console.warn("Skipping undecryptable message:", e); }
            }
        }
        renderChat(user.email);
    } catch (e) { console.error("openChat error:", e); }
}

/* =========================================================
   SEND MESSAGE
   .
========================================================= */
async function sendMessage() {
    const input = document.getElementById("messageInput");
    const text  = input?.value?.trim();
    if (!text || !window.selectedUser) return;
    if (!window.stompClient?.connected) {
        if (window.showToast) showToast("Not connected — please wait.", "error");
        return;
    }

    try {
        const token = localStorage.getItem("token");
        const pkRes = await fetch(
            `/api/users/public-key/${encodeURIComponent(window.selectedUser.email)}`,
            { headers: { "Authorization": "Bearer " + token } }
        );
        if (!pkRes.ok) throw new Error("Failed to fetch receiver public key");
        const receiverPub = await pkRes.text();
        const senderPub   = localStorage.getItem("publicKey");
        if (!senderPub) throw new Error("Sender public key missing — refresh page");

        const enc = await encryptForBoth(text, receiverPub, senderPub);

        window.stompClient.send("/app/chat", {}, JSON.stringify({
            sender:                window.currentUserEmail,
            receiver:              window.selectedUser.email,
            encryptedContent:      enc.encryptedContent,
            encryptedKey:          enc.encryptedKey,
            encryptedKeyForSender: enc.encryptedKeyForSender,
            iv:                    enc.iv,
            isFile:                false
        }));

        input.value = "";
        input.focus();
    } catch (e) {
        console.error("sendMessage error:", e);
        if (window.showToast) showToast("Failed to send message", "error");
    }
}

/* =========================================================
   SEND FILE
========================================================= */
async function sendFile(file) {
    if (!file || !window.selectedUser) return;
    if (!window.stompClient?.connected) {
        if (window.showToast) showToast("Not connected", "error"); return;
    }

    const MAX = 5 * 1024 * 1024;
    if (file.size > MAX) {
        if (window.showToast) showToast("File too large — max 5 MB", "error"); return;
    }

    try {
        const token   = localStorage.getItem("token");
        const pkRes   = await fetch(
            `/api/users/public-key/${encodeURIComponent(window.selectedUser.email)}`,
            { headers: { "Authorization": "Bearer " + token } }
        );
        if (!pkRes.ok) throw new Error("Failed to fetch receiver public key");
        const receiverPub = await pkRes.text();
        const senderPub   = localStorage.getItem("publicKey");
        if (!senderPub) throw new Error("Sender public key missing");

        const buffer = await file.arrayBuffer();
        const enc    = await encryptForBoth(buffer, receiverPub, senderPub);

        window.stompClient.send("/app/chat", {}, JSON.stringify({
            sender:                window.currentUserEmail,
            receiver:              window.selectedUser.email,
            encryptedContent:      enc.encryptedContent,
            encryptedKey:          enc.encryptedKey,
            encryptedKeyForSender: enc.encryptedKeyForSender,
            iv:                    enc.iv,
            isFile:                true,
            fileName:              file.name,
            fileType:              file.type,
            fileSize:              file.size
        }));
    } catch (e) {
        console.error("sendFile error:", e);
        if (window.showToast) showToast("Failed to send file", "error");
    }
}

/* =========================================================
   DELETE MESSAGE
========================================================= */
function deleteMessage(messageId) {
    const token = localStorage.getItem("token");
    fetch(`/api/chat/message/${messageId}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => {
        if (res.status === 403) {
            if (window.showToast) showToast("You can only delete your own messages", "error");
            return;
        }
        if (!res.ok) throw new Error("Delete failed: " + res.status);
        const user = window.selectedUser?.email;
        if (!user) return;
        window.chatStore[user] = window.chatStore[user].filter(m => m.id !== messageId);
        renderChat(user);
    })
    .catch(e => {
        console.error("deleteMessage error:", e);
        if (window.showToast) showToast("Could not delete message", "error");
    });
}

/* =========================================================
   DELETE CONVERSATION
========================================================= */
function deleteConversation() {
    if (!window.selectedUser) return;
    if (!confirm("Clear entire conversation?")) return;
    const token = localStorage.getItem("token");
    fetch(`/api/chat/conversation?user1=${encodeURIComponent(window.currentUserEmail)}&user2=${encodeURIComponent(window.selectedUser.email)}`, {
        method: "DELETE",
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => { if (!res.ok) throw new Error("Clear failed: " + res.status); })
    .catch(e => {
        console.error("deleteConversation error:", e);
        if (window.showToast) showToast("Failed to clear chat", "error");
    });
}

/* =========================================================
   RENDER CHAT
   
========================================================= */
function renderChat(email) {
    const div = document.getElementById("messages");
    if (!div) return;

    // Revoke old blob URLs
    window._blobUrls.forEach(u => URL.revokeObjectURL(u));
    window._blobUrls = [];
    div.innerHTML = "";

    const msgs = window.chatStore[email] || [];
    let lastDateStr = null;

    msgs.forEach((msg, i) => {
        // FIX 9: show correct date chip per day, not always "Today"
        const msgDate   = msg.timestamp ? new Date(msg.timestamp) : new Date();
        const today     = new Date();
        const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
        const dateStr   = msgDate.toDateString();

        if (dateStr !== lastDateStr) {
            lastDateStr = dateStr;
            const chip = document.createElement("div");
            chip.className = "date-chip";
            let label;
            if (dateStr === today.toDateString())     label = "Today";
            else if (dateStr === yesterday.toDateString()) label = "Yesterday";
            else label = msgDate.toLocaleDateString([], {day:"numeric", month:"short", year:"numeric"});
            chip.innerHTML = "<span>" + label + "</span>";
            div.appendChild(chip);
        }

        const type    = msg.sender === window.currentUserEmail ? "sent" : "received";
        const prevMsg = i > 0 ? msgs[i-1] : null;
        const grouped = prevMsg && prevMsg.sender === msg.sender &&
                        new Date(prevMsg.timestamp).toDateString() === dateStr;
        if (msg.isFile) {
            renderFileMessage(msg, type, grouped);
        } else {
            addMessage(msg, type, grouped);
        }
    });

    div.scrollTop = div.scrollHeight;
}

/* =========================================================
   TEXT MESSAGE BUBBLE
========================================================= */
function addMessage(msg, type, grouped) {
    const container = document.getElementById("messages");
    if (!container) return;

    const wrap = document.createElement("div");
    wrap.className = "message " + type + (grouped ? " grouped" : "");

    const text = document.createElement("div");
    text.className = "msg-text";
    text.innerText = msg.content;
    wrap.appendChild(text);

    const time = document.createElement("div");
    time.className = "msg-time";
    time.innerText = formatTime(msg.timestamp);
    wrap.appendChild(time);

    // Delete button only for sender's own messages
    if (type === "sent") {
        const btn = document.createElement("button");
        btn.className = "delete-btn";
        btn.textContent = "🗑";
        btn.title = "Delete message";
        btn.onclick = () => deleteMessage(msg.id);
        wrap.appendChild(btn);
    }

    container.appendChild(wrap);
}

/* =========================================================
   FILE MESSAGE CARD
   
   encryptedKeyForSender for the sender).
========================================================= */
function renderFileMessage(msg, type, grouped) {
    const container = document.getElementById("messages");
    if (!container) return;

    const wrap = document.createElement("div");
    wrap.className = "message " + type + (grouped ? " grouped" : "");
    wrap.style.position = "relative";

    const card = document.createElement("div");
    card.className = "file-card";

    // Card header: icon + filename + size
    const hdr = document.createElement("div");
    hdr.className = "file-card-header";

    const icon = document.createElement("div");
    icon.className = "file-icon";
    icon.textContent = fileEmoji(msg.fileType);
    hdr.appendChild(icon);

    const fi = document.createElement("div");
    fi.className = "file-info";

    const fname = document.createElement("div");
    fname.className = "file-name";
    fname.textContent = msg.fileName || "File";
    fi.appendChild(fname);

    if (msg.fileSize) {
        const fsize = document.createElement("div");
        fsize.className = "file-size";
        fsize.textContent = formatFileSize(msg.fileSize);
        fi.appendChild(fsize);
    }
    hdr.appendChild(fi);
    card.appendChild(hdr);

    // Image preview — hidden initially, never broken img tags
    if (msg.fileType?.startsWith("image/")) {
        decryptBinary(msg.encryptedContent, resolveKey(msg), msg.iv)
            .then(buf => {
                const url = URL.createObjectURL(new Blob([buf], { type: msg.fileType }));
                window._blobUrls.push(url);
                const img = document.createElement("img");
                img.className = "image-preview";
                img.style.display = "block";
                img.src = url;
                card.insertBefore(img, card.querySelector(".download-btn") || null);
            })
            .catch(e => {
                console.error("Preview failed:", e);
                const note = document.createElement("div");
                note.className = "img-unavailable";
                note.textContent = "Preview unavailable";
                card.appendChild(note);
            });
    }

    // Download button
    const dlBtn = document.createElement("button");
    dlBtn.className = "download-btn";
    dlBtn.textContent = "⬇ Download";
    dlBtn.onclick = () => decryptAndDownloadFile(msg);
    card.appendChild(dlBtn);

    wrap.appendChild(card);

    // Timestamp
    const time = document.createElement("div");
    time.className = "msg-time";
    time.innerText = formatTime(msg.timestamp);
    wrap.appendChild(time);

    // Delete button for sender
    if (type === "sent") {
        const delBtn = document.createElement("button");
        delBtn.className = "delete-btn";
        delBtn.textContent = "🗑";
        delBtn.title = "Delete message";
        delBtn.onclick = () => deleteMessage(msg.id);
        wrap.appendChild(delBtn);
    }

    container.appendChild(wrap);
}

/* =========================================================
   PRESENCE
========================================================= */
function updateUserPresence(email) {
    const token = localStorage.getItem("token");
    fetch(`/api/presence/${encodeURIComponent(email)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => { if (!res.ok) throw new Error("Presence " + res.status); return res.json(); })
    .then(data => {
        const el = document.getElementById("presence-" + emailToSafeId(email));
        if (el) {
            el.innerHTML = presenceHTML(data);
            el.className = "presence-indicator" + (data.online ? " online-status" : "");
        }
    })
    .catch(e => console.error("Presence error:", e));
}

function updateChatHeaderPresence(email) {
    const token = localStorage.getItem("token");
    fetch(`/api/presence/${encodeURIComponent(email)}`, {
        headers: { "Authorization": "Bearer " + token }
    })
    .then(res => { if (!res.ok) throw new Error("Presence " + res.status); return res.json(); })
    .then(data => {
        const el = document.getElementById("chatPresence");
        if (el) el.innerHTML = presenceHTML(data);
    })
    .catch(e => console.error("Header presence error:", e));
}

function presenceHTML(data) {
    if (data.online)   return "● Online";
    if (data.lastSeen) return "Last seen " + new Date(data.lastSeen).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
    return "Offline";
}

function refreshPresence() {
    Object.values(window._presenceEmailMap).forEach(email => updateUserPresence(email));
}

/* =========================================================
   SEARCH / FILTER
========================================================= */
function filterUsers(query) {
    const q = query.toLowerCase();
    document.querySelectorAll(".user-item").forEach(li => {
        const name = li.querySelector(".user-name")?.innerText?.toLowerCase() || "";
        li.style.display = name.includes(q) ? "" : "none";
    });
}

/* =========================================================
   HELPERS
========================================================= */
// Reversible safe ID — avoids collision with underscores in emails
function emailToSafeId(email) {
    return email.replace(/@/g, "__AT__").replace(/\./g, "__DOT__");
}
function safeIdToEmail(id) {
    return id.replace(/__AT__/g, "@").replace(/__DOT__/g, ".");
}

function formatTime(date) {
    const d = date ? new Date(date) : new Date();
    if (isNaN(d)) return "";
    return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

function formatFileSize(bytes) {
    if (bytes < 1024)       return bytes + " B";
    if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(1) + " MB";
}

function fileEmoji(mimeType) {
    if (!mimeType)                    return "📄";
    if (mimeType.startsWith("image")) return "🖼️";
    if (mimeType.startsWith("video")) return "🎬";
    if (mimeType.startsWith("audio")) return "🎵";
    if (mimeType.includes("pdf"))     return "📑";
    if (mimeType.includes("zip") || mimeType.includes("tar") || mimeType.includes("gz")) return "📦";
    return "📄";
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,"&amp;").replace(/</g,"&lt;")
        .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function handleEnter(event) {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

function logout() {
    if (window.stompClient) window.stompClient.disconnect(() => {});
    window._blobUrls.forEach(u => URL.revokeObjectURL(u));
    localStorage.clear();
    window.location.href = "login.html";
}

/* =========================================================
   SIDEBAR PROFILE PICTURE
   Loads saved profile picture into the sidebar avatar circle.
   Falls back to initial letter if no picture saved.
========================================================= */
function _loadSidebarProfilePic() {
    const pic      = localStorage.getItem("profilePicture");
    const ring     = document.getElementById("myAvatarCircle");
    if (!ring) return;

    if (pic && pic.startsWith("data:image")) {
        // Replace the initial letter circle with a photo
        ring.style.backgroundImage  = "url(" + pic + ")";
        ring.style.backgroundSize   = "cover";
        ring.style.backgroundPosition = "center";
        ring.style.color            = "transparent"; // hide the letter
    }
}

window.addEventListener("beforeunload", () => {
    if (window.stompClient) window.stompClient.disconnect();
});
