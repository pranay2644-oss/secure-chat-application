/* =========================================================
   FEATURES.JS  —  Secure Chat v7
   1. Typing Indicator
   2. Read Receipts (sent / delivered / read ticks)
   3. Unread Message Badges
   4. Emoji Picker  (categorised + search)
   5. Message Reactions  (react with any emoji)
========================================================= */

/* =========================================================
   1. TYPING INDICATOR
   Sends WS frames to /app/typing when user is typing.
   Receives on /topic/typing/{myEmail} and shows the
   animated "..." bubble in the chat header.
========================================================= */

let _typingTimer   = null;
let _amTyping      = false;
const TYPING_THROTTLE = 2000;  // ms between sends
const TYPING_EXPIRE   = 3500;  // ms until "stopped" auto-fires

function handleTyping() {
    if (!window.selectedUser || !window.stompClient?.connected) return;

    if (!_amTyping) {
        _amTyping = true;
        window.stompClient.send("/app/typing", {}, JSON.stringify({
            sender:   window.currentUserEmail,
            receiver: window.selectedUser.email,
            typing:   true
        }));
    }

    clearTimeout(_typingTimer);
    _typingTimer = setTimeout(() => {
        _amTyping = false;
        if (window.stompClient?.connected && window.selectedUser) {
            window.stompClient.send("/app/typing", {}, JSON.stringify({
                sender:   window.currentUserEmail,
                receiver: window.selectedUser.email,
                typing:   false
            }));
        }
    }, TYPING_EXPIRE);
}

// Subscribe to typing events (called from onWsConnected in app.js via hook)
let _typingHideTimer = null;

function subscribeTyping() {
    if (!window.stompClient?.connected) return;
    _safeSubscribe("/topic/typing/" + window.currentUserEmail, (frame) => {
        try {
            const data = JSON.parse(frame.body);
            // Only show for current open chat
            if (window.selectedUser?.email !== data.sender) return;
            showTypingIndicator(data.typing, data.sender);
        } catch (e) { console.error("Typing frame error:", e); }
    });
}

function showTypingIndicator(isTyping, senderEmail) {
    const indicator = document.getElementById("typingIndicator");
    const presence  = document.getElementById("chatPresence");
    if (!indicator) return;

    clearTimeout(_typingHideTimer);

    if (isTyping) {
        indicator.style.display = "flex";
        if (presence) presence.style.display = "none";
        // Auto-hide after 5s in case stop event is missed
        _typingHideTimer = setTimeout(() => {
            indicator.style.display = "none";
            if (presence) presence.style.display = "";
        }, 5000);
    } else {
        indicator.style.display = "none";
        if (presence) presence.style.display = "";
    }
}

// Hide typing when chat changes — single unified openChat hook (BUG 6 FIX)
// Merged with unread badge clear to avoid double-wrap chain issues
const _origOpenChat = window.openChat;
window.openChat = async function(user) {
    showTypingIndicator(false, null);  // typing indicator
    clearUnread(user.email);           // unread badge (merged from second patch)
    if (_origOpenChat) return _origOpenChat(user);
};

// Hook into onWsConnected
const _origOnWsConnected = window.onWsConnected;
window.onWsConnected = function() {
    if (_origOnWsConnected) _origOnWsConnected();
    subscribeTyping();
    subscribeReadReceipts();
    subscribeReactions();
};

/* =========================================================
   2. READ RECEIPTS
   - Single grey tick  ✓  = sent (server received)
   - Double grey tick  ✓✓ = delivered (receiver online)
   - Double blue tick  ✓✓ = read (receiver opened chat)

   Implementation:
   - Messages track a `status` field: sent|delivered|read
   - When a message is rendered it shows the correct tick
   - When receiver opens a chat, send a readReceipt WS frame
   - Sender receives the frame and upgrades ticks to blue
========================================================= */

// Map: messageId -> status
window.messageStatus = window.messageStatus || {};

function subscribeReadReceipts() {
    if (!window.stompClient?.connected) return;
    _safeSubscribe("/user/queue/read-receipt", (frame) => {
        try {
            const data = JSON.parse(frame.body); // { messageId, status, reader }
            window.messageStatus[data.messageId] = data.status;
            // Update tick in DOM
            const tickEl = document.getElementById("tick-" + data.messageId);
            if (tickEl) tickEl.innerHTML = tickHTML(data.status);
        } catch (e) { console.error("Read receipt error:", e); }
    });
}

// Send read receipts when we open a chat and render messages
function sendReadReceipts(messages) {
    if (!window.stompClient?.connected || !window.selectedUser) return;
    messages.forEach(msg => {
        // Only receipt messages sent TO us (not our own sent messages)
        if (msg.sender !== window.currentUserEmail && msg.id) {
            window.stompClient.send("/app/read-receipt", {}, JSON.stringify({
                messageId: msg.id,
                reader:    window.currentUserEmail,
                sender:    msg.sender,
                status:    "read"
            }));
            window.messageStatus[msg.id] = "read";
        }
    });
}

function tickHTML(status) {
    if (!status || status === "sent") {
        return '<span class="tick tick-sent" title="Sent">✓</span>';
    }
    if (status === "delivered") {
        return '<span class="tick tick-delivered" title="Delivered">✓✓</span>';
    }
    if (status === "read") {
        return '<span class="tick tick-read" title="Read">✓✓</span>';
    }
    return "";
}

// Patch addMessage to include ticks on sent messages
const _origAddMessage = window.addMessage;
window.addMessage = function(msg, type, grouped) {
    // Call original first
    _origAddMessage(msg, type, grouped);

    // Then inject tick for sent messages
    if (type === "sent" && msg.id) {
        const status = window.messageStatus[msg.id] || "sent";
        const allMsgs = document.getElementById("messages");
        if (!allMsgs) return;
        // Find the last added sent bubble and append tick
        const bubbles = allMsgs.querySelectorAll(".message.sent");
        const last    = bubbles[bubbles.length - 1];
        if (last) {
            const tickWrap = document.createElement("div");
            tickWrap.id    = "tick-" + msg.id;
            tickWrap.className = "msg-tick";
            tickWrap.innerHTML = tickHTML(status);
            last.appendChild(tickWrap);
        }
    }

    // Add react button on every message
    injectReactButton(msg);
};

// Patch renderChat to send read receipts after render
const _origRenderChat = window.renderChat;
window.renderChat = function(email) {
    _origRenderChat(email);
    const msgs = window.chatStore[email] || [];
    sendReadReceipts(msgs);
};

/* =========================================================
   3. UNREAD MESSAGE BADGES
   Tracks unread count per user when a message arrives for
   a conversation that is NOT currently open.
   Badge disappears when that chat is opened.
========================================================= */

window.unreadCounts = window.unreadCounts || {};

function incrementUnread(email) {
    if (window.selectedUser?.email === email) return; // already open
    window.unreadCounts[email] = (window.unreadCounts[email] || 0) + 1;
    renderUnreadBadge(email);
    // Shake the sidebar item
    const li = document.querySelector(`.user-item[data-email="${CSS.escape(email)}"]`);
    if (li) { li.classList.add("shake"); setTimeout(() => li.classList.remove("shake"), 600); }
}

function clearUnread(email) {
    window.unreadCounts[email] = 0;
    renderUnreadBadge(email);
}

function renderUnreadBadge(email) {
    const safe  = emailToSafeId(email);
    const li    = document.querySelector(`.user-item[data-email="${CSS.escape(email)}"]`);
    if (!li) return;
    let badge = li.querySelector(".unread-badge");
    const count = window.unreadCounts[email] || 0;
    if (count > 0) {
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "unread-badge";
            li.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : count;
    } else {
        if (badge) badge.remove();
    }
}

// Patch handleIncomingMessage to track unread
const _origHandleIncoming = window.handleIncomingMessage;
window.handleIncomingMessage = async function(message) {
    await _origHandleIncoming(message);
    // If message is from someone else and chat is NOT open — count it
    if (message.sender !== window.currentUserEmail) {
        incrementUnread(message.sender);
    }
};

// openChat unread clear is now merged into the single hook above (BUG 6 FIX)

/* =========================================================
   4. EMOJI PICKER
   Categories: Smileys, People, Nature, Food, Travel,
               Objects, Symbols, Flags
   Features: category tabs, search filter, recent emojis,
             click inserts into message input
========================================================= */

const EMOJI_DATA = {
    "😊 Smileys": ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫢","🫣","🤭","🤫","🤥","😶","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤑","🤠"],
    "👋 People":  ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","🦻","👃","🫀","🫁","🧠","🦷","🦴","👀","👁","👅","👄","🫦","💋","👶","🧒","👦","👧","🧑","👱","👨","🧔","👩","🧓","👴","👵","🙍","🙎","🙅","🙆","💁","🙋","🧏","🙇","🤦","🤷"],
    "🌿 Nature":  ["🌸","🌺","🌻","🌹","🌷","🌼","💐","🍀","🌿","☘️","🌱","🌲","🌳","🌴","🌵","🌾","🍁","🍂","🍃","🍄","🌾","🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪲","🦟","🦗","🕷","🦂","🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆","🦓","🦍","🦧","🦣","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🦬","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌","🐕","🐩","🦮","🐈","🪶","🐓","🦃","🦤","🦚","🦜","🦢","🦩","🕊","🐇","🦝","🦨","🦡","🦫","🦦","🦥","🐁","🐀","🐿","🦔"],
    "🍕 Food":    ["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶","🫑","🧄","🧅","🥔","🍠","🫘","🌽","🍞","🥐","🥖","🫓","🥨","🥯","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫔","🌮","🌯","🥙","🧆","🥚","🍝","🍜","🍲","🍛","🍣","🍱","🥟","🦪","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🧁","🍰","🎂","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜","🫚","🍯","🧃","🥤","🧋","☕","🍵","🫖","🍺","🍻","🥂","🍷","🥃","🍸","🍹","🧉","🍾"],
    "✈️ Travel":  ["🚀","✈️","🛸","🚁","🛶","⛵","🚢","🚂","🚆","🚇","🚈","🚊","🚝","🚞","🚋","🚌","🚍","🚎","🚐","🚑","🚒","🚓","🚔","🚕","🚖","🚗","🚘","🚙","🛻","🚚","🚛","🚜","🏎","🏍","🛵","🦽","🦼","🛺","🚲","🛴","🛹","🛼","🚏","🛣","🛤","⛽","🚧","⚓","🪝","⛵","🛥","🚢","✈️","🛩","🛫","🛬","🪂","💺","🚁","🚟","🚠","🚡","🛰","🚀","🛸","🌍","🌎","🌏","🗺","🧭","🏔","⛰","🌋","🗻","🏕","🏖","🏜","🏝","🏞","🏟","🏛","🏗","🏘","🏚","🏠","🏡","🏢","🏣","🏤","🏥","🏦","🏧","🏨","🏩","🏪","🏫","🏬","🏭","🏯","🏰","💒","🗼","🗽"],
    "💡 Objects": ["⌚","📱","💻","⌨️","🖥","🖨","🖱","🕹","💾","💿","📀","📷","📸","📹","🎥","📽","🎞","📞","☎️","📟","📠","📺","📻","🧭","⏱","⏲","⏰","🕰","⌛","⏳","📡","🔋","🪫","🔌","💡","🔦","🕯","🪔","🧯","🛢","💰","💴","💵","💶","💷","💸","💳","🧾","💹","✉️","📧","📨","📩","📪","📫","📬","📭","📮","🗳","✏️","✒️","🖊","🖋","📝","📁","📂","🗂","📅","📆","🗒","🗓","📇","📈","📉","📊","📋","📌","📍","🗺","📎","🖇","📏","📐","✂️","🗃","🗄","🗑","🔒","🔓","🔏","🔐","🔑","🗝","🔨","🪓","⛏","⚒","🛠","🗡","⚔️","🔫","🪃","🏹","🛡","🪚","🔧","🪛","🔩","⚙️","🗜","⚖️","🦯","🔗","⛓","🪝","🧲","🪜","🧪","🧫","🧬","🔬","🔭","📡"],
    "❤️ Symbols": ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️","☪️","🕉","☸️","✡️","🔯","🕎","☯️","☦️","🛐","⛎","♈","♉","♊","♋","♌","♍","♎","♏","♐","♑","♒","♓","🆔","⚛️","🉑","☢️","☣️","📴","📳","🈶","🈚","🈸","🈺","🈷️","✴️","🆚","💮","🉐","㊙️","㊗️","🈴","🈵","🈹","🈲","🅰️","🅱️","🆎","🆑","🅾️","🆘","❌","⭕","🛑","⛔","📛","🚫","💯","❗","❕","❓","❔","‼️","⁉️","🔅","🔆","〽️","⚠️","🚸","🔱","⚜️","🔰","♻️","✅","🈯","💹","❎","🌐","💠","Ⓜ️","🌀","💤","🏧","🚾","♿","🅿️","🛗","🈳","🈂️","🛂","🛃","🛄","🛅","🚹","🚺","🚼","⚧","🚻","🚮","🎦","📶","🈁","🔣","ℹ️","🔤","🔡","🔠","🆖","🆗","🆙","🆒","🆕","🆓","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟","🔢","#️⃣","*️⃣","⏏️","▶️","⏸","⏹","⏺","⏭","⏮","⏩","⏪","⏫","⏬","◀️","🔼","🔽","➡️","⬅️","⬆️","⬇️","↗️","↘️","↙️","↖️","↕️","↔️","↪️","↩️","⤴️","⤵️","🔀","🔁","🔂","🔄","🔃","🎵","🎶","➕","➖","➗","✖️","♾","💲","❗","❓","‼️","⁉️","🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤"],
};

const RECENT_KEY = "sc_recent_emojis";
let _emojiOpen   = false;

function getRecentEmojis() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; }
    catch { return []; }
}
function addRecentEmoji(emoji) {
    let recents = getRecentEmojis().filter(e => e !== emoji);
    recents.unshift(emoji);
    recents = recents.slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(recents));
}

function buildEmojiPicker() {
    const catsEl  = document.getElementById("emojiCats");
    const gridEl  = document.getElementById("emojiGrid");
    if (!catsEl || !gridEl) return;

    catsEl.innerHTML = "";
    gridEl.innerHTML = "";

    // Recents tab
    const recentBtn = document.createElement("button");
    recentBtn.className = "emoji-cat-btn active";
    recentBtn.textContent = "🕐";
    recentBtn.title = "Recently used";
    recentBtn.onclick = () => showEmojiCategory("__recent__", recentBtn);
    catsEl.appendChild(recentBtn);

    // Category tabs
    Object.keys(EMOJI_DATA).forEach((cat, i) => {
        const btn = document.createElement("button");
        btn.className = "emoji-cat-btn";
        btn.textContent = cat.split(" ")[0]; // just the emoji
        btn.title = cat.split(" ").slice(1).join(" ");
        btn.onclick = () => showEmojiCategory(cat, btn);
        catsEl.appendChild(btn);
    });

    showEmojiCategory("__recent__", recentBtn);
}

function showEmojiCategory(cat, activeBtn) {
    document.querySelectorAll(".emoji-cat-btn").forEach(b => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");

    const gridEl = document.getElementById("emojiGrid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const emojis = cat === "__recent__"
        ? (getRecentEmojis().length ? getRecentEmojis() : ["😊","👍","❤️","😂","🙏","🔥","✅","🎉"])
        : EMOJI_DATA[cat] || [];

    emojis.forEach(emoji => {
        const btn = document.createElement("button");
        btn.className = "emoji-item";
        btn.textContent = emoji;
        btn.onclick = (e) => { e.stopPropagation(); insertEmoji(emoji); };
        gridEl.appendChild(btn);
    });
}

function filterEmojis(query) {
    const gridEl = document.getElementById("emojiGrid");
    if (!gridEl) return;

    if (!query.trim()) {
        // Restore current tab
        const active = document.querySelector(".emoji-cat-btn.active");
        if (active) active.click();
        return;
    }

    gridEl.innerHTML = "";
    const q = query.toLowerCase();
    Object.values(EMOJI_DATA).flat().forEach(emoji => {
        if (!gridEl.innerHTML.includes(emoji)) {
            const btn = document.createElement("button");
            btn.className = "emoji-item";
            btn.textContent = emoji;
            btn.onclick = (e) => { e.stopPropagation(); insertEmoji(emoji); };
            gridEl.appendChild(btn);
        }
    });
}

function insertEmoji(emoji) {
    const input = document.getElementById("messageInput");
    if (!input) return;
    const start = input.selectionStart;
    const end   = input.selectionEnd;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    input.focus();
    input.setSelectionRange(start + emoji.length, start + emoji.length);
    addRecentEmoji(emoji);
    handleTyping();
}

function toggleEmojiPicker() {
    const picker = document.getElementById("emojiPicker");
    if (!picker) return;
    _emojiOpen = !picker.classList.contains("open");
    picker.classList.toggle("open");
    if (_emojiOpen) {
        buildEmojiPicker();
        document.getElementById("emojiSearch")?.focus();
    }
}

/* =========================================================
   5. MESSAGE REACTIONS
   - Hover over any message → small "+" react button appears
   - Click → floating reaction picker (8 quick emojis)
   - Reactions stored in window.reactions[msgId]
   - Rendered as pill chips below the bubble
   - Click a reaction chip to toggle your own reaction
   - Broadcast via WS /app/reaction → /topic/reaction/{email}
========================================================= */

const QUICK_REACTIONS = ["👍","❤️","😂","😮","😢","😡","🔥","🎉"];
window.reactions = window.reactions || {}; // { msgId: { emoji: [email,...] } }

function subscribeReactions() {
    if (!window.stompClient?.connected) return;
    _safeSubscribe("/topic/reaction/" + window.currentUserEmail, (frame) => {
        try {
            const data = JSON.parse(frame.body);
            applyReaction(data.messageId, data.emoji, data.sender, data.remove);
        } catch (e) { console.error("Reaction error:", e); }
    });
}

function applyReaction(msgId, emoji, sender, remove) {
    if (!window.reactions[msgId]) window.reactions[msgId] = {};
    if (!window.reactions[msgId][emoji]) window.reactions[msgId][emoji] = [];

    const arr = window.reactions[msgId][emoji];
    if (remove) {
        const idx = arr.indexOf(sender);
        if (idx > -1) arr.splice(idx, 1);
        if (arr.length === 0) delete window.reactions[msgId][emoji];
    } else {
        if (!arr.includes(sender)) arr.push(sender);
    }
    renderReactionsForMsg(msgId);
}

function renderReactionsForMsg(msgId) {
    const wrap = document.getElementById("reactions-" + msgId);
    if (!wrap) return;

    const reactionMap = window.reactions[msgId] || {};
    wrap.innerHTML = "";

    Object.entries(reactionMap).forEach(([emoji, users]) => {
        if (users.length === 0) return;
        const pill = document.createElement("button");
        pill.className = "reaction-pill";
        const iMine = users.includes(window.currentUserEmail);
        if (iMine) pill.classList.add("mine");
        pill.title = users.join(", ");
        pill.innerHTML = `${emoji}<span class="reaction-count">${users.length}</span>`;
        pill.onclick = (e) => {
            e.stopPropagation();
            toggleReaction(msgId, emoji, iMine);
        };
        wrap.appendChild(pill);
    });
}

function toggleReaction(msgId, emoji, currentlyMine) {
    if (!window.stompClient?.connected) return;

    // Optimistic update
    applyReaction(msgId, emoji, window.currentUserEmail, currentlyMine);

    // Find message to get receiver
    let receiver = window.selectedUser?.email;
    if (!receiver) return;

    window.stompClient.send("/app/reaction", {}, JSON.stringify({
        messageId: msgId,
        emoji,
        sender:   window.currentUserEmail,
        receiver: receiver,
        remove:   currentlyMine
    }));
}

function showReactionMenu(msgId, anchorEl) {
    const menu      = document.getElementById("reactionMenu");
    const menuInner = document.getElementById("reactionMenuInner");
    if (!menu || !menuInner) return;

    menuInner.innerHTML = "";
    QUICK_REACTIONS.forEach(emoji => {
        const btn = document.createElement("button");
        btn.className = "reaction-quick-btn";
        btn.textContent = emoji;
        btn.onclick = (e) => {
            e.stopPropagation();
            const iMine = (window.reactions[msgId]?.[emoji] || [])
                .includes(window.currentUserEmail);
            toggleReaction(msgId, emoji, iMine);
            menu.classList.remove("open");
        };
        menuInner.appendChild(btn);
    });

    // Position near anchor
    const rect = anchorEl.getBoundingClientRect();
    menu.style.left = Math.min(rect.left, window.innerWidth - 280) + "px";
    menu.style.top  = (rect.top - 54) + "px";
    menu.classList.add("open");
}

// Inject react button + reactions wrap on every message
function injectReactButton(msg) {
    if (!msg.id) return;
    const allMsgs = document.getElementById("messages");
    if (!allMsgs) return;

    // Find matching message div — last one added
    const bubbles = allMsgs.querySelectorAll(".message");
    const last    = bubbles[bubbles.length - 1];
    if (!last) return;

    // React button
    const reactBtn = document.createElement("button");
    reactBtn.className = "msg-react-btn";
    reactBtn.textContent = "＋";
    reactBtn.title = "React";
    reactBtn.onclick = (e) => {
        e.stopPropagation();
        showReactionMenu(msg.id, reactBtn);
    };
    last.appendChild(reactBtn);

    // Reactions wrap
    const reactWrap = document.createElement("div");
    reactWrap.id        = "reactions-" + msg.id;
    reactWrap.className = "reactions-wrap";
    last.appendChild(reactWrap);

    // Render any existing reactions (e.g. on history load)
    renderReactionsForMsg(msg.id);
}

/* =========================================================
   PATCH renderFileMessage too — add tick + react button
========================================================= */
const _origRenderFile = window.renderFileMessage;
window.renderFileMessage = function(msg, type, grouped) {
    _origRenderFile(msg, type, grouped);

    if (type === "sent" && msg.id) {
        const allMsgs = document.getElementById("messages");
        if (!allMsgs) return;
        const bubbles = allMsgs.querySelectorAll(".message.sent");
        const last    = bubbles[bubbles.length - 1];
        if (last) {
            const tickWrap = document.createElement("div");
            tickWrap.id    = "tick-" + msg.id;
            tickWrap.className = "msg-tick";
            tickWrap.innerHTML = tickHTML(window.messageStatus[msg.id] || "sent");
            last.appendChild(tickWrap);
        }
    }

    injectReactButton(msg);
};

/* =========================================================
   NOTIFICATION SOUND
   Plays a subtle ping on incoming message when tab is in
   background — uses the Web Audio API, no external file.
========================================================= */
function playPing() {
    if (document.visibilityState === "visible") return; // only when hidden
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
    } catch (e) {}
}

// Hook into incoming message to play sound + show browser notification
const _origHandleIncoming2 = window.handleIncomingMessage;
window.handleIncomingMessage = async function(message) {
    await _origHandleIncoming2(message);
    if (message.sender !== window.currentUserEmail) {
        playPing();
        showBrowserNotification(message);
    }
};

/* =========================================================
   BROWSER PUSH NOTIFICATIONS
   Requests permission once, then shows OS notifications
   when tab is not active — click brings you back to chat.
========================================================= */
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
}
requestNotificationPermission();

function showBrowserNotification(message) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return;

    const title = message.sender?.split("@")[0] || "New message";
    const body  = message.isFile ? "📎 Sent a file" : "New encrypted message";
    const notif = new Notification(title, {
        body,
        icon:  "/favicon.ico",
        badge: "/favicon.ico",
        tag:   "sc-msg-" + message.sender
    });
    notif.onclick = () => { window.focus(); notif.close(); };
    setTimeout(() => notif.close(), 4000);
}

/* =========================================================
   KEYBOARD SHORTCUTS
   Ctrl+K  — focus search
   Escape  — close emoji picker / reaction menu
   Ctrl+/  — show shortcut help toast
========================================================= */
document.addEventListener("keydown", (e) => {
    // Ctrl+K → focus search
    if (e.ctrlKey && e.key === "k") {
        e.preventDefault();
        document.getElementById("searchInput")?.focus();
    }
    // Escape → close picker/menu
    if (e.key === "Escape") {
        document.getElementById("emojiPicker")?.classList.remove("open");
        document.getElementById("reactionMenu")?.classList.remove("open");
    }
    // Ctrl+/ → shortcut help
    if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        if (window.showToast) showToast("Ctrl+K search  •  Esc close  •  Enter send", "info");
    }
});

/* =========================================================
   DRAG & DROP FILES onto chat area
========================================================= */
const chatArea = document.getElementById("messages");
if (chatArea) {
    chatArea.addEventListener("dragover", (e) => {
        e.preventDefault();
        chatArea.classList.add("drag-over");
    });
    chatArea.addEventListener("dragleave", () => chatArea.classList.remove("drag-over"));
    chatArea.addEventListener("drop", (e) => {
        e.preventDefault();
        chatArea.classList.remove("drag-over");
        const file = e.dataTransfer.files[0];
        if (file && window.sendFile) sendFile(file);
    });
}

console.log("✅ Features loaded: Typing • Read Receipts • Unread Badges • Emoji Picker • Reactions • Notifications • Drag & Drop");
