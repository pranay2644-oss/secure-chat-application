// ======================================================
// 📎 SECURE FILE UPLOAD (WebSocket + Hybrid Encryption)
// ======================================================

document.addEventListener("DOMContentLoaded", () => {

    const fileInput = document.getElementById("fileInput");
    if (!fileInput) return;

    fileInput.addEventListener("change", async function () {

        const file = this.files[0];
        if (!file) return;

        if (!window.selectedUser) {
            alert("Please select a user first");
            this.value = "";
            return;
        }

        if (!window.stompClient) {
            alert("WebSocket not connected");
            this.value = "";
            return;
        }

        // ✅ File size protection (5MB max)
        const MAX_SIZE = 5 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            alert("File too large. Max 5MB allowed.");
            this.value = "";
            return;
        }

        try {

            const token = localStorage.getItem("token");

            // 🔑 1️⃣ Get receiver public key
            const receiverPublicKey = await fetch(
                `/api/users/public-key/${window.selectedUser.email}`,
                { headers: { "Authorization": "Bearer " + token } }
            ).then(res => res.text());

            // ✅ Validate public key
            if (!receiverPublicKey) {
                alert("Receiver public key not available");
                this.value = "";
                return;
            }

            console.log("Encrypting file... 🔐");

            // 📦 2️⃣ Convert file to ArrayBuffer
            const buffer = await file.arrayBuffer();

            // 🔐 3️⃣ Encrypt file
            const encryptedData = await encryptBinary(buffer, receiverPublicKey);

            console.log("Encryption complete ✅");

            // 📨 4️⃣ Send encrypted payload via WebSocket
            window.stompClient.send("/app/chat", {}, JSON.stringify({
                sender: window.currentUserEmail,
                receiver: window.selectedUser.email,
                encryptedContent: encryptedData.encryptedContent,
                encryptedKey: encryptedData.encryptedKey,
                iv: encryptedData.iv,
                isFile: true,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size
            }));

            // 🔥 5️⃣ Immediately render in sender UI
            if (!window.chatStore[window.selectedUser.email]) {
                window.chatStore[window.selectedUser.email] = [];
            }

            window.chatStore[window.selectedUser.email].push({
                sender: window.currentUserEmail,
                isFile: true,
                encryptedContent: encryptedData.encryptedContent,
                encryptedKey: encryptedData.encryptedKey,
                iv: encryptedData.iv,
                fileName: file.name,
                fileType: file.type,
                fileSize: file.size
            });

            renderChat(window.selectedUser.email);

            console.log("File sent securely 🚀");

        } catch (error) {

            console.error("Secure file send failed:", error);
            alert("File send failed. Please try again.");

        }

        // 🔄 Reset input
        this.value = "";
    });

});