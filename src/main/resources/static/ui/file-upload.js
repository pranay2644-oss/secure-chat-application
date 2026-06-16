// ======================================================
// SECURE FILE UPLOAD
// Delegates encryption + WebSocket send to sendFile() in app.js
// ======================================================

document.addEventListener("DOMContentLoaded", () => {

    const fileInput = document.getElementById("fileInput");
    if (!fileInput) return;

    fileInput.addEventListener("change", async function () {

        const file = this.files[0];
        if (!file) return;

        if (!window.selectedUser) {
            if (window.showToast) showToast("Please select a contact first", "error");
            this.value = "";
            return;
        }

        if (!window.stompClient?.connected) {
            if (window.showToast) showToast("WebSocket not connected — please wait.", "error");
            this.value = "";
            return;
        }

        // Delegate entirely to sendFile() in app.js
        // The WS echo-back to sender handles pushing to chatStore
        await sendFile(file);

        this.value = "";
    });
});
