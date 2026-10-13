const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const io = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('🚀 Starting Skype Classic Server...');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const ioserver = io(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(express.json({ limit: '10mb' }));

app.use((req, res, next) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    next();
});

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Created data directory');
}

let users = new Map();
let chatMessages = new Map();
let groups = new Map();
let activeCalls = new Map();
let userCallStatus = new Map();

// ==================== STATUS HELPERS ====================
const VALID_STATUSES = ['online', 'busy', 'away', 'invisible', 'offline'];

function isValidStatus(s) {
    return typeof s === 'string' && VALID_STATUSES.includes(s);
}

function visibleStatus(status) {
    if (status === 'invisible') return 'offline';
    return status || 'offline';
}

// ==================== ACCOUNT STORAGE ====================
const usersFile = path.join(dataDir, 'users.json');
let accounts = {};

function loadAccounts() {
    try {
        if (fs.existsSync(usersFile)) {
            accounts = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
            console.log('👤 Loaded', Object.keys(accounts).length, 'accounts from disk');
        }
    } catch (e) {
        console.error('Error loading accounts:', e);
        accounts = {};
    }
}

function saveAccounts() {
    try {
        fs.writeFileSync(usersFile, JSON.stringify(accounts, null, 2));
    } catch (e) {
        console.error('Error saving accounts:', e);
    }
}

function ensureTestAccount() {
    if (!accounts['test']) {
        accounts['test'] = {
            password: 'test',
            displayName: 'Test User',
            created: new Date().toISOString()
        };
        saveAccounts();
        console.log('👤 Created default test account');
    }
}

loadAccounts();
ensureTestAccount();

// ==================== MESSAGE PERSISTENCE ====================
const messagesFile = path.join(dataDir, 'messages.json');
let saveMessagesTimeout = null;

function loadMessages() {
    try {
        if (fs.existsSync(messagesFile)) {
            const data = JSON.parse(fs.readFileSync(messagesFile, 'utf8'));
            chatMessages = new Map(Object.entries(data));
            let total = 0;
            chatMessages.forEach(arr => total += arr.length);
            console.log('📦 Loaded', chatMessages.size, 'chat histories (' + total + ' messages) from disk');
        }
    } catch (e) {
        console.error('Error loading messages:', e);
        chatMessages = new Map();
    }
}

function saveMessagesNow() {
    try {
        const obj = Object.fromEntries(chatMessages);
        fs.writeFileSync(messagesFile, JSON.stringify(obj));
    } catch (e) {
        console.error('Error saving messages:', e);
    }
}

function scheduleSaveMessages() {
    clearTimeout(saveMessagesTimeout);
    saveMessagesTimeout = setTimeout(saveMessagesNow, 1500);
}

loadMessages();

// ==================== AUTH ENDPOINTS ====================
app.post('/api/register', (req, res) => {
    const { username, password, displayName, email } = req.body || {};
    
    if (!username || !password) {
        return res.json({ success: false, error: 'Username and password required' });
    }
    
    if (!/^[a-zA-Z0-9_]{2,20}$/.test(username)) {
        return res.json({ success: false, error: 'Username must be 2-20 letters/numbers/underscores' });
    }
    
    if (accounts[username]) {
        return res.json({ success: false, error: 'Username already exists' });
    }
    
    accounts[username] = {
        password: password,
        displayName: displayName || username,
        email: email || '',
        created: new Date().toISOString()
    };
    saveAccounts();
    
    console.log('👤 Registered new account:', username);
    res.json({ 
        success: true, 
        displayName: accounts[username].displayName 
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
        return res.json({ success: false, error: 'Username and password required' });
    }
    
    if (!accounts[username] || accounts[username].password !== password) {
        return res.json({ success: false, error: 'Invalid username or password' });
    }
    
    res.json({ 
        success: true, 
        displayName: accounts[username].displayName || username 
    });
});

app.use("/sounds", express.static(path.join(__dirname, "sounds")));
app.use("/images", express.static(path.join(__dirname, "public/images")));

// ==================== DESKTOP MAIN PAGE ====================
app.get("/", (req, res) => {
    console.log("📨 Serving main page to client");
    
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /iPhone|iPad|iPod|Android|BlackBerry|Windows Phone|webOS|IEMobile|Opera Mini/i.test(userAgent);
    
    if (isMobile && req.query.desktop !== 'true') {
        console.log('📱 Mobile device detected, redirecting to /mobile');
        res.redirect('/mobile');
        return;
    }
    
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Skype Classic</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Tahoma', 'Arial', sans-serif;
            font-size: 11px;
        }
        
        :root {
            --bg-primary: #6C00A0;
            --window-bg: #ECE9D8;
            --titlebar-start: #0A246A;
            --titlebar-end: #6B8DC3;
            --border-light: #FFFFFF;
            --border-dark: #808080;
            --text-primary: #000000;
            --text-light: #FFFFFF;
            --button-bg: #ECE9D8;
            --contact-hover: #6C00A0;
            --banner-bg: linear-gradient(90deg, #FFD700, #FFA500);
            --banner-text: #0A246A;
            --bg-image: url('/images/bbg.jpg');
            --text-secondary: #666666;
            --status-online: #4CAF50;
            --status-busy: #E53935;
            --status-away: #FFB300;
            --status-offline: #999999;
        }
        
        .dark-theme {
            --bg-primary: #1a1a1a;
            --window-bg: #2d2d2d;
            --titlebar-start: #2b2b2b;
            --titlebar-end: #4a4a4a;
            --border-light: #4a4a4a;
            --border-dark: #1a1a1a;
            --text-primary: #e0e0e0;
            --text-light: #ffffff;
            --button-bg: #3d3d3d;
            --contact-hover: #4a4a4a;
            --banner-bg: linear-gradient(90deg, #b8860b, #8b4513);
            --banner-text: #ffd700;
            --bg-image: url('/images/dbg.jpg');
            --text-secondary: #b0b0b0;
        }
        
        body {
            background: var(--bg-primary) var(--bg-image);
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            background-attachment: fixed;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            margin: 0;
            padding-top: 45px;
            color: var(--text-primary);
            transition: background-color 0.5s ease, color 0.3s ease;
        }
        
        .xp-window, .xp-titlebar, .xp-content, .xp-fieldset, .xp-legend, .xp-input, .xp-button-large, .xp-button, .xp-tab, .xp-status-bar,
        .contact-list, .contact-item, .messages, .message, .message-input, .sound-control, .permission-prompt, .theme-switcher, .theme-btn, #groupMemberList {
            transition: background-color 0.4s ease, color 0.3s ease, border-color 0.3s ease;
        }
        
        .xp-titlebar, .global-banner {
            transition: background 0.5s ease;
        }
        
        .xp-window {
            width: 750px;
            background: var(--window-bg);
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            margin-top: 10px;
        }
        
        .chat-window {
            width: 750px;
            height: 550px;
        }
        
        .xp-titlebar {
            background: linear-gradient(90deg, var(--titlebar-start), var(--titlebar-end));
            color: var(--text-light);
            padding: 4px 8px;
            font-size: 11px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 20px;
        }
        
        .xp-titlebar-controls {
            display: flex;
            gap: 1px;
        }
        
        .xp-button {
            width: 16px;
            height: 14px;
            border: 1px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            background: var(--button-bg);
            font-size: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            line-height: 1;
            color: var(--text-primary);
        }
        
        .xp-content {
            padding: 15px;
            background: var(--window-bg);
        }
        
        .xp-fieldset {
            border: 1px solid var(--border-dark);
            padding: 15px;
            margin-bottom: 15px;
            background: var(--window-bg);
            position: relative;
        }
        
        .xp-legend {
            background: var(--window-bg);
            padding: 2px 8px;
            font-size: 11px;
            font-weight: bold;
            position: absolute;
            top: -8px;
            left: 8px;
            color: var(--text-primary);
        }
        
        .xp-input {
            width: 100%;
            padding: 4px;
            border: 1px solid var(--border-dark);
            background: var(--window-bg);
            font-size: 11px;
            margin-bottom: 10px;
            height: 22px;
            color: var(--text-primary);
        }
        
        .xp-button-large {
            background: var(--button-bg);
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            padding: 5px 20px;
            font-size: 11px;
            font-weight: bold;
            cursor: pointer;
            margin-right: 10px;
            color: var(--text-primary);
        }
        
        .xp-button-large:hover {
            background: var(--contact-hover);
            color: var(--text-light);
        }
        
        .xp-tabs {
            display: flex;
            margin-bottom: 15px;
        }
        
        .xp-tab {
            padding: 4px 12px;
            background: var(--button-bg);
            border: 1px solid var(--border-dark);
            border-bottom: none;
            font-size: 11px;
            cursor: pointer;
            margin-right: 2px;
            color: var(--text-primary);
        }
        
        .xp-tab.active {
            background: var(--window-bg);
            font-weight: bold;
        }
        
        .xp-status-bar {
            background: var(--window-bg);
            border-top: 1px solid var(--border-dark);
            padding: 4px 8px;
            font-size: 10px;
            color: var(--text-primary);
            height: 20px;
        }
        
        .chat-layout {
            display: flex;
            gap: 15px;
            height: 450px;
        }
        
        .contacts-panel {
            width: 200px;
            border-right: 1px solid var(--border-dark);
            overflow-y: auto;
            padding-right: 5px;
        }
        
        .chat-panel {
            flex: 1;
            display: flex;
            flex-direction: column;
            min-width: 0;
        }
        
        .contact-tab {
            padding: 8px 10px;
            cursor: pointer;
            border-bottom: 1px solid var(--border-dark);
            display: flex;
            align-items: center;
            gap: 10px;
            transition: all 0.2s;
        }
        
        .contact-tab:hover {
            background: var(--contact-hover);
            color: var(--text-light);
        }
        
        .contact-tab.active {
            background: var(--titlebar-start);
            color: var(--text-light);
        }
        
        .contact-avatar-small {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, var(--titlebar-start), var(--titlebar-end));
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
        }
        
        .contact-info-small {
            flex: 1;
            min-width: 0;
        }
        
        .contact-name-small {
            font-weight: 600;
            font-size: 12px;
            margin-bottom: 2px;
        }
        
        .contact-status-small {
            font-size: 10px;
            display: flex;
            align-items: center;
            gap: 3px;
        }
        
        .status-online-small { color: var(--status-online); }
        .status-offline-small { color: var(--status-offline); }
        .status-busy-small { color: var(--status-busy); }
        .status-away-small { color: var(--status-away); }
        
        .chat-container {
            display: none;
            flex-direction: column;
            height: 100%;
        }
        
        .chat-container.active {
            display: flex;
        }
        
        .chat-header {
            padding: 8px 12px;
            background: var(--titlebar-start);
            color: var(--text-light);
            border-radius: 4px;
            margin-bottom: 10px;
            font-weight: bold;
        }
        
        .chat-messages-area {
            flex: 1;
            overflow-y: auto;
            padding: 10px;
            background: var(--window-bg);
            border: 1px solid var(--border-dark);
            margin-bottom: 10px;
            min-height: 300px;
        }
        
        .message {
            margin-bottom: 12px;
            clear: both;
        }
        
        .message-self {
            text-align: right;
        }
        
        .message-other {
            text-align: left;
        }
        
        .message-bubble {
            display: inline-block;
            padding: 8px 12px;
            border-radius: 8px;
            max-width: 70%;
            word-wrap: break-word;
        }
        
        .message-self .message-bubble {
            background: var(--titlebar-start);
            color: var(--text-light);
        }
        
        .message-other .message-bubble {
            background: var(--button-bg);
            color: var(--text-primary);
            border: 1px solid var(--border-dark);
        }
        
        .message-image {
            max-width: 200px;
            max-height: 200px;
            border-radius: 8px;
            cursor: pointer;
            border: 2px solid var(--titlebar-start);
        }
        
        .message-time {
            font-size: 9px;
            color: var(--text-secondary);
            margin-top: 4px;
        }
        
        .message-input-area {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }
        
        .message-input {
            flex: 1;
            padding: 8px;
            border: 1px solid var(--border-dark);
            background: var(--window-bg);
            color: var(--text-primary);
            border-radius: 4px;
        }
        
        .send-button, .call-button, .image-button, .file-button {
            padding: 8px 15px;
            background: var(--titlebar-start);
            color: var(--text-light);
            border: none;
            cursor: pointer;
            border-radius: 4px;
        }
        
        .send-button:hover, .call-button:hover, .image-button:hover, .file-button:hover {
            background: var(--titlebar-end);
        }
        
        .call-button {
            background: #00A300;
        }
        
        .image-button {
            background: #6C00A0;
        }
        
        .file-button {
            background: #C07000;
        }
        
        .hidden {
            display: none;
        }
        
        .sound-control {
            position: fixed;
            top: 55px;
            right: 10px;
            background: var(--window-bg);
            padding: 5px;
            border-radius: 3px;
            font-size: 10px;
            z-index: 9998;
            border: 1px solid var(--border-dark);
            color: var(--text-primary);
        }
        
        .empty-contacts {
            text-align: center;
            padding: 40px 20px;
            color: var(--text-secondary);
            font-style: italic;
        }
        
        .video-container {
            margin: 10px 0;
            text-align: center;
        }
        
        .video-preview {
            width: 200px;
            height: 150px;
            background: #000;
            border: 2px solid var(--border-dark);
            margin: 0 auto;
        }
        
        .audio-controls {
            margin: 10px 0;
            display: flex;
            gap: 10px;
            justify-content: center;
        }
        
        .mute-button {
            padding: 3px 8px;
            background: var(--button-bg);
            border: 1px solid var(--border-dark);
            cursor: pointer;
            font-size: 10px;
            color: var(--text-primary);
        }
        
        .call-error {
            color: #FF0000;
            font-size: 10px;
            margin: 10px 0;
            text-align: center;
        }
        
        .permission-prompt {
            background: var(--window-bg);
            border: 2px solid var(--border-dark);
            padding: 15px;
            margin: 10px 0;
            text-align: center;
            color: var(--text-primary);
        }
        
        .permission-button {
            background: #00A300;
            color: white;
            border: none;
            padding: 8px 15px;
            cursor: pointer;
            margin: 5px;
        }
        
        .global-banner {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            background: var(--banner-bg);
            border-bottom: 3px solid var(--titlebar-start);
            overflow: hidden;
            padding: 8px 0;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }
        
        .global-banner marquee {
            background: none;
            color: var(--banner-text);
            text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
            font-family: 'Tahoma', 'Arial', sans-serif;
            font-size: 12px;
        }
        
        .theme-switcher {
            position: fixed;
            top: 55px;
            left: 10px;
            z-index: 9999;
            background: var(--window-bg);
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            padding: 3px;
            border-radius: 3px;
        }
        
        .theme-btn {
            background: var(--button-bg);
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            padding: 3px 8px;
            font-size: 10px;
            font-weight: bold;
            cursor: pointer;
            color: var(--text-primary);
            margin: 0;
        }
        
        .theme-btn:hover {
            background: var(--contact-hover);
            color: var(--text-light);
        }
        
        #groupMemberList {
            background: var(--window-bg);
            color: var(--text-primary);
        }
        
        #imageModal {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.9);
            z-index: 10000;
            justify-content: center;
            align-items: center;
        }
        
        #imageModal.active {
            display: flex;
        }
        
        #modalImage {
            max-width: 90%;
            max-height: 90%;
        }
        
        .modal-close {
            position: absolute;
            top: 20px;
            right: 30px;
            color: white;
            font-size: 40px;
            cursor: pointer;
        }

        .self-status {
            display: flex;
            align-items: center;
            gap: 5px;
            cursor: pointer;
            padding: 1px 4px;
            border-radius: 2px;
            position: relative;
        }
        .self-status:hover {
            background: rgba(255,255,255,0.15);
        }
        .self-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            flex-shrink: 0;
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
        }
        .self-status-dot.online { background: #4CAF50; }
        .self-status-dot.busy { background: #E53935; }
        .self-status-dot.away { background: #FFB300; }
        .self-status-dot.invisible { background: #999999; }
        .self-status-dot.offline { background: #999999; }

        .status-dropdown {
            position: absolute;
            top: 18px;
            left: 0;
            min-width: 140px;
            background: var(--window-bg);
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            box-shadow: 2px 2px 6px rgba(0,0,0,0.4);
            z-index: 99999;
            padding: 2px;
            display: none;
        }
        .status-dropdown.open {
            display: block;
        }
        .status-option {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 10px;
            cursor: pointer;
            color: var(--text-primary);
            font-size: 11px;
            user-select: none;
        }
        .status-option:hover {
            background: var(--titlebar-start);
            color: var(--text-light);
        }
        .status-option .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
            box-shadow: 0 0 4px rgba(0,0,0,0.3);
        }
        .status-option .dot.online { background: #4CAF50; }
        .status-option .dot.busy { background: #E53935; }
        .status-option .dot.away { background: #FFB300; }
        .status-option .dot.invisible { background: #999999; }
        .status-option .dot.offline { background: #999999; }

        /* ==================== FILE TRANSFER UI ==================== */
        .ft-progress-bar {
            width: 100%;
            height: 18px;
            background: var(--window-bg);
            border: 2px solid;
            border-top-color: var(--border-dark);
            border-left-color: var(--border-dark);
            border-right-color: var(--border-light);
            border-bottom-color: var(--border-light);
            position: relative;
            overflow: hidden;
            margin: 8px 0;
        }
        .ft-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #0A246A, #6B8DC3);
            width: 0%;
            transition: width 0.15s linear;
        }
        .ft-progress-segments {
            position: absolute;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            pointer-events: none;
        }
        .ft-progress-segments > div {
            flex: 1;
            border-right: 1px solid rgba(0,0,0,0.15);
        }
        .ft-progress-segments > div:last-child {
            border-right: none;
        }
        .ft-info-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        .ft-filename {
            font-weight: bold;
            color: var(--text-primary);
            font-size: 12px;
            word-break: break-all;
            margin-bottom: 4px;
        }
        .ft-filesize {
            color: var(--text-secondary);
            font-size: 10px;
            margin-bottom: 10px;
        }
        .ft-popup-icon {
            font-size: 40px;
            text-align: center;
            margin: 10px 0;
        }
        .ft-buttons {
            display: flex;
            gap: 8px;
            justify-content: center;
            margin-top: 12px;
        }
        .ft-btn-accept {
            background: #00A300 !important;
            color: #fff !important;
        }
        .ft-btn-decline {
            background: #C00000 !important;
            color: #fff !important;
        }
        .ft-status-text {
            text-align: center;
            font-size: 11px;
            margin: 6px 0;
            color: var(--text-primary);
        }
        .ft-stats {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: var(--text-secondary);
            margin-top: 6px;
        }
        .ft-cancel-btn {
            background: #C00000;
            color: white;
            border: 2px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: #800000;
            border-bottom-color: #800000;
            padding: 5px 15px;
            font-weight: bold;
            cursor: pointer;
            font-size: 11px;
        }
            ws.send(JSON.stringify({
                type: 'ft_offer',
                transferId: transferId,
                from: currentUser.username,
                fromDisplay: currentUser.displayName,
                to: recipient,
                filename: file.name,
                filesize: file.size,
                mime: transfer.mime
            }));
            console.log('📤 FT: sent ft_offer', {
                transferId: transferId,
                to: recipient,
                filename: file.name,
                size: file.size
            });
        }
        .ft-window .xp-content {
            padding: 12px;
        }
        .ft-transfers-stack {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 1001;
            display: flex;
            flex-direction: column;
            gap: 8px;
            max-height: 80vh;
            overflow-y: auto;
            pointer-events: none;
        }
        .ft-transfers-stack > .ft-window {
            pointer-events: auto;
        }

        /* ==================== INLINE FILE TRANSFER CHAT BARS ==================== */
        .ft-chat-bar {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 8px 12px;
            margin: 8px 0;
            background: var(--button-bg);
            border: 1px solid var(--border-dark);
            border-left: 4px solid var(--titlebar-start);
            font-size: 11px;
            color: var(--text-primary);
            clear: both;
            width: 100%;
            box-sizing: border-box;
            text-align: left;
        }
        .ft-chat-bar .ft-bar-icon {
            font-size: 18px;
            flex-shrink: 0;
            line-height: 1;
        }
        .ft-chat-bar .ft-bar-text {
            flex: 1;
            min-width: 0;
            word-break: break-word;
        }
        .ft-chat-bar .ft-bar-text strong {
            display: block;
            font-weight: bold;
            margin-bottom: 2px;
            font-size: 11px;
        }
        .ft-chat-bar .ft-bar-text small {
            color: var(--text-secondary);
            font-size: 10px;
        }
        .ft-chat-bar .ft-bar-progress {
            width: 100%;
            height: 6px;
            background: rgba(0,0,0,0.1);
            border: 1px solid var(--border-dark);
            margin-top: 4px;
            overflow: hidden;
        }
        .ft-chat-bar .ft-bar-progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #0A246A, #6B8DC3);
            width: 0%;
            transition: width 0.2s linear;
        }
        .ft-chat-bar.success { border-left-color: #4CAF50; }
        .ft-chat-bar.success .ft-bar-progress-fill { background: #4CAF50; }
        .ft-chat-bar.error { border-left-color: #E53935; }
        .ft-chat-bar.error .ft-bar-progress-fill { background: #E53935; }
        .ft-chat-bar.cancelled { border-left-color: #999999; }
        .ft-chat-bar .ft-bar-close {
            flex-shrink: 0;
            cursor: pointer;
            color: var(--text-secondary);
            font-weight: bold;
            padding: 2px 6px;
            user-select: none;
            font-size: 14px;
        }
        .ft-chat-bar .ft-bar-close:hover {
            color: var(--text-primary);
        }
    </style>
</head>
<body style="background: var(--bg-primary) var(--bg-image); background-size: cover; background-position: center; background-repeat: no-repeat; background-attachment: fixed;">
    <div class="theme-switcher">
        <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
    </div>
    
    <div class="global-banner">
        <marquee behavior="scroll" direction="left" scrollamount="6">
            🎉 UPDATE 1.4: THE "DIAL-UP MODEM" UPDATE HAS COME OUT! 🎉 CHECK OUT /ANALYTICS FOR MORE INFO! 📊 NOW FEATURING: WORKING VOICE CALLS • PLUG-AND-PLAY MICROPHONES • SERVER-SIDE ACCOUNTS • PERSISTENT MESSAGES • STATUS SELECTOR • MOBILE SYNC • P2P FILE SHARING • AND MORE! 🚀
        </marquee>
    </div>
    
    <div class="sound-control">
        <label>
            <input type="checkbox" id="soundToggle" checked> Sounds
        </label>
    </div>

    <audio id="logoutSound" preload="auto"><source src="/sounds/logoff.mp3" type="audio/mpeg"></audio>
    <audio id="messageSound" preload="auto"><source src="/sounds/messagereceived.mp3" type="audio/mpeg"></audio>
    <audio id="loginSound" preload="auto"><source src="/sounds/logon.mp3" type="audio/mpeg"></audio>
    <audio id="sendSound" preload="auto"><source src="/sounds/messagesent.mp3" type="audio/mpeg"></audio>
    <audio id="callSound" preload="auto" loop><source src="/sounds/call_incoming.mp3" type="audio/mpeg"></audio>
    <audio id="dialingSound" preload="auto" loop><source src="/sounds/dialing.mp3" type="audio/mpeg"></audio>
    <audio id="callEndSound" preload="auto"><source src="/sounds/call_end.mp3" type="audio/mpeg"></audio>
    <audio id="callAcceptSound" preload="auto"><source src="/sounds/call_accept.mp3" type="audio/mpeg"></audio>
    <audio id="callErrorSound" preload="auto"><source src="/sounds/call_error.mp3" type="audio/mpeg"></audio>
    <audio id="ftStartSound" preload="auto"><source src="/sounds/ft-start.mp3" type="audio/mpeg"></audio>
    <audio id="ftSuccessSound" preload="auto"><source src="/sounds/ft-success.mp3" type="audio/mpeg"></audio>
    <audio id="ftFailSound" preload="auto"><source src="/sounds/ft-fail.mp3" type="audio/mpeg"></audio>

    <div id="loginWindow" class="xp-window">
        <div class="xp-titlebar">
            <span>📞 Skype Classic</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button">_</div>
                <div class="xp-button">□</div>
                <div class="xp-button">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div class="xp-tabs">
                <div class="xp-tab active" onclick="showTab('login')">Login</div>
                <div class="xp-tab" onclick="showTab('register')">Create Account</div>
            </div>
            <div id="loginTab">
                <div class="xp-fieldset">
                    <legend class="xp-legend">Account Information</legend>
                    <input type="text" class="xp-input" id="loginUsername" placeholder="Username" value="test">
                    <input type="password" class="xp-input" id="loginPassword" placeholder="Password" value="test">
                </div>
                <div style="text-align: center;">
                    <button class="xp-button-large" onclick="login()">Sign In</button>
                    <button class="xp-button-large" onclick="showTab('register')">Create Account</button>
                </div>
            </div>
            <div id="registerTab" class="hidden">
                <div class="xp-fieldset">
                    <legend class="xp-legend">New Account</legend>
                    <input type="text" class="xp-input" id="regUsername" placeholder="Username">
                    <input type="password" class="xp-input" id="regPassword" placeholder="Password">
                    <input type="email" class="xp-input" id="regEmail" placeholder="Email">
                    <input type="text" class="xp-input" id="regDisplayName" placeholder="Display Name">
                </div>
                <div style="text-align: center;">
                    <button class="xp-button-large" onclick="register()">Create Account</button>
                    <button class="xp-button-large" onclick="showTab('login')">Back to Login</button>
                </div>
            </div>
        </div>
        <div class="xp-status-bar">
            <span id="statusMessage">Ready to connect to Skype Classic...</span>
        </div>
    </div>

    <div id="chatWindow" class="xp-window chat-window hidden">
        <div class="xp-titlebar">
            <span style="display: flex; align-items: center; gap: 8px;">
                📞 Skype Classic -
                <span class="self-status" id="selfStatus" onclick="toggleStatusDropdown(event)">
                    <span class="self-status-dot online" id="selfStatusDot"></span>
                    <span id="selfStatusText">Online</span>
                    <span id="currentUser">User</span>
                    <span style="font-size: 8px; opacity: 0.8;">▼</span>
                </span>
                <div class="status-dropdown" id="statusDropdown" onclick="event.stopPropagation()">
                    <div class="status-option" onclick="setStatus('online')">
                        <span class="dot online"></span><span>Online</span>
                    </div>
                    <div class="status-option" onclick="setStatus('busy')">
                        <span class="dot busy"></span><span>Busy</span>
                    </div>
                    <div class="status-option" onclick="setStatus('away')">
                        <span class="dot away"></span><span>Away</span>
                    </div>
                    <div class="status-option" onclick="setStatus('invisible')">
                        <span class="dot invisible"></span><span>Invisible</span>
                    </div>
                    <div class="status-option" onclick="setStatus('offline')">
                        <span class="dot offline"></span><span>Appear Offline</span>
                    </div>
                </div>
            </span>
            <div class="xp-titlebar-controls">
                <div class="xp-button">_</div>
                <div class="xp-button">□</div>
                <div class="xp-button" onclick="logout()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div class="chat-layout">
                <div class="contacts-panel">
                    <div class="xp-fieldset" style="margin-bottom: 10px;">
                        <legend class="xp-legend">Contacts</legend>
                        <div id="contactsPanel" class="contact-list" style="height: 300px;">
                            <div class="empty-contacts">No contacts yet<br><small>Add friends to start chatting!</small></div>
                        </div>
                    </div>
                    <div style="text-align: center;">
                        <button class="xp-button-large" onclick="showAddContact()" style="width: 100%; margin-bottom: 5px;">Add Contact</button>
                        <button class="xp-button-large" onclick="showCreateGroup()" style="width: 100%;">Create Group Chat</button>
                    </div>
                </div>
                
                <div class="chat-panel">
                    <div class="xp-fieldset" style="height: 100%; display: flex; flex-direction: column;">
                        <legend class="xp-legend">Chat <span id="currentChatWith"></span></legend>
                        <div id="chatArea" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                        </div>
                    </div>
                </div>
            </div>
            <div class="xp-status-bar">
                <span id="chatStatus">Ready to chat...</span>
            </div>
        </div>
    </div>

    <div id="incomingCallWindow" class="xp-window hidden" style="width: 300px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;">
        <div class="xp-titlebar">
            <span>📞 Incoming Call...</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button" onclick="declineIncomingCall()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div style="text-align: center; padding: 20px;">
                <div id="incomingCallFrom">Call from <span id="callerName">User</span></div>
                <div style="margin: 20px 0; font-size: 24px;">📞</div>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button class="xp-button-large" style="background: #00A300;" onclick="acceptIncomingCall()">Answer</button>
                    <button class="xp-button-large" style="background: #FF0000;" onclick="declineIncomingCall()">Decline</button>
                </div>
            </div>
        </div>
    </div>

    <div id="callWindow" class="xp-window hidden" style="width: 350px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;">
        <div class="xp-titlebar">
            <span>📞 Active Call</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button" onclick="endCall()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div style="text-align: center; padding: 15px;">
                <div id="callStatus">In call with <span id="callTarget">User</span></div>
                <div class="video-container">
                    <video id="localVideo" autoplay muted class="video-preview"></video>
                    <audio id="remoteAudio" autoplay></audio>
                </div>
                <div id="permissionPrompt" class="permission-prompt hidden">
                    <p><strong>Microphone Access Required</strong></p>
                    <p>Click "Allow Microphone" to enable voice calls</p>
                    <button class="permission-button" onclick="requestMicrophonePermission()">Allow Microphone</button>
                </div>
                <div id="callError" class="call-error hidden"></div>
                <div id="audioControls" class="audio-controls hidden">
                    <button class="mute-button" onclick="toggleMute()" id="muteButton">Mute</button>
                    <button class="mute-button" onclick="toggleDeafen()" id="deafenButton">Deafen</button>
                </div>
                <div style="margin: 15px 0;">
                    <button class="xp-button-large" style="background: #FF0000;" onclick="endCall()">End Call</button>
                </div>
                <div id="callTimer" style="font-size: 10px; color: #666;">00:00</div>
            </div>
        </div>
    </div>

    <div id="createGroupWindow" class="xp-window hidden" style="width: 350px; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1000;">
        <div class="xp-titlebar">
            <span>👥 Create Group Chat</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button" onclick="closeCreateGroup()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div style="padding: 15px;">
                <div style="margin-bottom: 10px;">
                    <label style="display: block; margin-bottom: 5px;">Group Name:</label>
                    <input type="text" id="groupNameInput" class="xp-input" style="width: 100%;" placeholder="e.g., Math Study Group">
                </div>
                <div style="margin: 15px 0; border-top: 1px solid var(--border-dark); padding-top: 10px;">
                    <label style="display: block; margin-bottom: 10px; font-weight: bold;">Select Members:</label>
                    <div id="groupMemberList" style="max-height: 200px; overflow-y: auto; border: 1px solid var(--border-dark); padding: 10px; background: var(--window-bg);">
                        <div style="color: var(--text-primary); font-style: italic;">Loading contacts...</div>
                    </div>
                </div>
                <div style="text-align: right; margin-top: 15px;">
                    <button class="xp-button-large" onclick="createGroup()" style="margin-right: 10px;">Create Group</button>
                    <button class="xp-button-large" onclick="closeCreateGroup()">Cancel</button>
                </div>
            </div>
        </div>
    </div>

    <div id="analyticsPopup" class="xp-window hidden" style="width: 300px; position: fixed; bottom: 20px; right: 20px; z-index: 1001;">
        <div class="xp-titlebar">
            <span>📊 Analytics</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button" onclick="closeAnalyticsPopup()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div style="padding: 15px; text-align: center;">
                <div style="font-size: 48px; margin: 10px 0;">ℹ️</div>
                <p style="margin: 10px 0;">Go to the analytics page?</p>
                <div style="display: flex; justify-content: center; gap: 10px; margin-top: 15px;">
                    <button class="xp-button" onclick="openAnalytics()">Yes</button>
                    <button class="xp-button" onclick="closeAnalyticsPopup()">No</button>
                </div>
            </div>
        </div>
    </div>

    <!-- FILE TRANSFER STACK (progress windows, centered) -->
    <div id="ftTransfersStack" class="ft-transfers-stack"></div>

    <!-- FILE TRANSFER OFFER POPUP -->
    <div id="ftOfferWindow" class="xp-window ft-window hidden" style="top: 50%; left: 50%; transform: translate(-50%, -50%);">
        <div class="xp-titlebar">
            <span>📁 Incoming File Transfer</span>
            <div class="xp-titlebar-controls">
                <div class="xp-button" onclick="declineIncomingTransfer()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div style="text-align: center;">
                <div class="ft-popup-icon">📄</div>
                <div class="ft-status-text" id="ftOfferFrom">Someone wants to send you a file!</div>
                <div class="ft-filename" id="ftOfferFilename">file.bin</div>
                <div class="ft-filesize" id="ftOfferFilesize">0 B</div>
                <div class="ft-buttons">
                    <button class="xp-button-large ft-btn-accept" onclick="acceptIncomingTransfer()">Accept</button>
                    <button class="xp-button-large ft-btn-decline" onclick="declineIncomingTransfer()">Decline</button>
                </div>
            </div>
        </div>
    </div>

    <div id="imageModal" onclick="closeImageModal()">
        <span class="modal-close">&times;</span>
        <img id="modalImage">
    </div>

    <script>
        let currentUser = null;
        let ws = null;
        let currentChat = null;
        let messageCounter = 0;
        let isInCall = false;
        let callStartTime = null;
        let callTimerInterval = null;
        let currentCallWith = null;
        let incomingCallFrom = null;
        let userContacts = [];
        let userGroups = [];
        let chatMessages = {};
        let myStatus = 'online';
        
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let isMuted = false;
        let isDeafened = false;
        let microphonePermissionGranted = false;
        let connectionInProgress = false;
        let pendingIceCandidates = [];

        // ==================== FILE TRANSFER STATE ====================
        const FT_CHUNK_SIZE = 16 * 1024; // 16KB chunks
        const FT_BUFFER_THRESHOLD = 1024 * 1024; // wait if buffered > 1MB
        const ftTransfers = new Map(); // transferId -> transfer object
        let ftIncomingOffer = null; // { transferId, from, fromDisplay, filename, filesize, mime }

        const rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        function toggleTheme() {
            const body = document.body;
            const button = document.getElementById('themeToggle');
            
            body.style.transition = 'background 0.5s ease, color 0.3s ease';
            
            if (body.classList.contains('dark-theme')) {
                body.classList.remove('dark-theme');
                button.innerHTML = '🌙 Dark';
                localStorage.setItem('skypeTheme', 'light');
            } else {
                body.classList.add('dark-theme');
                button.innerHTML = '☀️ Light';
                localStorage.setItem('skypeTheme', 'dark');
            }
        }
        
        function loadTheme() {
            const savedTheme = localStorage.getItem('skypeTheme');
            const body = document.body;
            const button = document.getElementById('themeToggle');
            
            body.style.transition = 'none';
            
            if (savedTheme === 'dark') {
                body.classList.add('dark-theme');
                if (button) button.innerHTML = '☀️ Light';
            } else {
                body.classList.remove('dark-theme');
                if (button) button.innerHTML = '🌙 Dark';
            }
            
            setTimeout(() => {
                body.style.transition = '';
            }, 50);
        }

        const STATUS_LABELS = {
            online: 'Online',
            busy: 'Busy',
            away: 'Away',
            invisible: 'Invisible',
            offline: 'Appear Offline'
        };

        function updateSelfStatusUI() {
            const dot = document.getElementById('selfStatusDot');
            const txt = document.getElementById('selfStatusText');
            if (!dot || !txt) return;
            dot.className = 'self-status-dot ' + myStatus;
            txt.textContent = STATUS_LABELS[myStatus] || 'Online';
        }

        function toggleStatusDropdown(e) {
            if (e) e.stopPropagation();
            const dd = document.getElementById('statusDropdown');
            if (!dd) return;
            dd.classList.toggle('open');
        }

        function closeStatusDropdown() {
            const dd = document.getElementById('statusDropdown');
            if (dd) dd.classList.remove('open');
        }

        function setStatus(status) {
            if (!STATUS_LABELS[status]) return;
            myStatus = status;
            updateSelfStatusUI();
            closeStatusDropdown();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'status_change',
                    status: status
                }));
            }
            const cs = document.getElementById('chatStatus');
            if (cs) cs.textContent = 'Status: ' + STATUS_LABELS[status];
        }

        document.addEventListener('click', function(e) {
            const dd = document.getElementById('statusDropdown');
            const picker = document.getElementById('selfStatus');
            if (!dd || !picker) return;
            if (!picker.contains(e.target)) {
                dd.classList.remove('open');
            }
        });

        function syncMessagesToServer() {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (!currentUser) return;
            
            Object.keys(chatMessages).forEach(chatId => {
                const messages = chatMessages[chatId];
                if (messages && messages.length > 0) {
                    ws.send(JSON.stringify({
                        type: 'sync_messages',
                        chatId: chatId,
                        messages: messages.slice(-100)
                    }));
                }
            });
        }

        function saveMessagesToLocalStorage() {
            localStorage.setItem('chatMessages_' + currentUser.username, JSON.stringify(chatMessages));
        }
        
        function loadMessagesFromLocalStorage() {
            const saved = localStorage.getItem('chatMessages_' + currentUser.username);
            if (saved) {
                chatMessages = JSON.parse(saved);
                console.log('📦 Loaded messages from localStorage:', Object.keys(chatMessages).length, 'chats');
            } else {
                chatMessages = {};
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                userContacts.forEach(contact => {
                    ws.send(JSON.stringify({
                        type: 'get_message_history',
                        chatId: contact.username
                    }));
                });
            }
        }
        
        function addMessageToChat(contact, messageData) {
            if (!chatMessages[contact]) {
                chatMessages[contact] = [];
            }
            
            const exists = chatMessages[contact].some(m => m.id === messageData.id);
            if (!exists) {
                chatMessages[contact].push(messageData);
                saveMessagesToLocalStorage();
                return true;
            }
            return false;
        }
        
        function renderMessagesForChat(contact) {
            const messagesDiv = document.getElementById('messages_' + contact);
            if (!messagesDiv) return;
            
            messagesDiv.innerHTML = '';
            
            const contactMessages = chatMessages[contact] || [];
            
            contactMessages.forEach(msg => {
                const isSelf = msg.from === currentUser.username;
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isSelf ? 'message-self' : 'message-other');
                
                const time = new Date(msg.timestamp).toLocaleTimeString();
                const displayName = msg.fromDisplay || msg.from;
                
                if (msg.imageData) {
                    messageDiv.innerHTML = \`
                        <div class="message-bubble" style="background: none; padding: 5px;">
                            <img src="\${msg.imageData}" class="message-image" onclick="openImageModal('\${msg.imageData}')">
                            <div class="message-time">\${time}</div>
                        </div>
                    \`;
                } else {
                    messageDiv.innerHTML = \`
                        <div class="message-bubble">
                            <strong>\${displayName}:</strong> \${msg.message}
                            <div class="message-time">\${time}</div>
                        </div>
                    \`;
                }
                
                messagesDiv.appendChild(messageDiv);
            });
            
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function openImageModal(imageSrc) {
            const modal = document.getElementById('imageModal');
            const modalImg = document.getElementById('modalImage');
            modalImg.src = imageSrc;
            modal.classList.add('active');
        }
        
        function closeImageModal() {
            const modal = document.getElementById('imageModal');
            modal.classList.remove('active');
        }

        function loadContacts() {
            const savedContacts = localStorage.getItem('userContacts_' + currentUser.username);
            if (savedContacts) {
                userContacts = JSON.parse(savedContacts);
                updateContactList();
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'get_contacts',
                    username: currentUser.username
                }));
            }
        }        
        function updateContactList() {
            const contactsPanel = document.getElementById('contactsPanel');
            const chatArea = document.getElementById('chatArea');
            
            if (!contactsPanel) return;
            
            contactsPanel.innerHTML = '';
            
            if (userContacts.length === 0 && userGroups.length === 0) {
                contactsPanel.innerHTML = '<div class="empty-contacts">No contacts yet<br><small>Add friends to start chatting!</small></div>';
                return;
            }
            
            userContacts.forEach(contact => {
                const contactTab = document.createElement('div');
                contactTab.className = 'contact-tab' + (currentChat === contact.username ? ' active' : '');
                contactTab.setAttribute('data-contact', contact.username);
                
                const st = contact.status || 'offline';
                const stClass = 'status-' + st + '-small';
                const stLabel = st.charAt(0).toUpperCase() + st.slice(1);
                
                contactTab.innerHTML = \`
                    <div class="contact-avatar-small">\${contact.displayName.charAt(0).toUpperCase()}</div>
                    <div class="contact-info-small">
                        <div class="contact-name-small">\${contact.displayName}</div>
                        <div class="contact-status-small \${stClass}">
                            <span>●</span> \${stLabel}
                        </div>
                    </div>
                \`;
                contactTab.onclick = () => switchChat(contact.username, contact.displayName);
                contactsPanel.appendChild(contactTab);
                
                if (!document.getElementById('chatContainer_' + contact.username)) {
                    const chatContainer = document.createElement('div');
                    chatContainer.id = 'chatContainer_' + contact.username;
                    chatContainer.className = 'chat-container';
                    chatContainer.innerHTML = \`
                        <div class="chat-header">
                            Chat with \${contact.displayName}
                        </div>
                        <div id="messages_\${contact.username}" class="chat-messages-area"></div>
                        <div class="message-input-area">
                            <input type="text" id="messageInput_\${contact.username}" class="message-input" placeholder="Type a message..." onkeypress="handleMessageKeypress(event, '\${contact.username}')">
                            <button class="send-button" onclick="sendMessageTo('\${contact.username}')">Send</button>
                            <button class="call-button" onclick="startCallTo('\${contact.username}')">📞</button>
                            <input type="file" id="imageInput_\${contact.username}" accept="image/*" style="display: none">
                            <button class="image-button" onclick="document.getElementById('imageInput_\${contact.username}').click()" title="Send Image">🖼️</button>
                            <input type="file" id="fileInput_\${contact.username}" style="display: none">
                            <button class="file-button" onclick="document.getElementById('fileInput_\${contact.username}').click()" title="Send File (P2P)">📎</button>
                        </div>
                    \`;
                    chatArea.appendChild(chatContainer);
                    
                    document.getElementById('imageInput_' + contact.username).addEventListener('change', (e) => {
                        handleImageUpload(e, contact.username);
                    });
                    document.getElementById('fileInput_' + contact.username).addEventListener('change', (e) => {
                        handleFilePick(e, contact.username);
                    });
                }
                
                if (chatMessages[contact.username]) {
                    renderMessagesForChat(contact.username);
                }
            });
        }
        
        function switchChat(username, displayName) {
            currentChat = username;
            document.getElementById('currentChatWith').textContent = 'with ' + displayName;

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'get_message_history',
                    chatId: username
                }));
            }
            
            document.querySelectorAll('.chat-container').forEach(container => {
                container.classList.remove('active');
            });
            const activeContainer = document.getElementById('chatContainer_' + username);
            if (activeContainer) {
                activeContainer.classList.add('active');
            }
            
            document.querySelectorAll('.contact-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.getAttribute('data-contact') === username) {
                    tab.classList.add('active');
                }
            });
            
            renderMessagesForChat(username);
            
            // Re-attach any existing FT bars for this chat (they may have been
            // wiped by renderMessagesForChat). We re-create them from ftTransfers.
            ftTransfers.forEach(t => {
                if (t.peer === username) {
                    const done = t.direction === 'send' ? t.bytesSent : t.receivedBytes;
                    const total = t.filesize || 1;
                    const pctVal = Math.min(100, (done / total) * 100);
                    let barIcon, barTitle, barSub, barStatus;
                    if (t.direction === 'send') { barIcon = '📤'; barTitle = 'Sending "' + t.filename + '"'; }
                    else { barIcon = '📥'; barTitle = 'Receiving "' + t.filename + '"'; }
                    switch (t.status) {
                        case 'offered':     barSub = formatBytes(total) + ' • waiting for accept…'; break;
                        case 'connecting':  barSub = formatBytes(total) + ' • connecting…'; break;
                        case 'transferring': barSub = formatBytes(done) + ' / ' + formatBytes(total) + (t.speed > 0 ? ' • ' + formatSpeed(t.speed) : ''); break;
                        case 'done':        barSub = formatBytes(total) + ' • complete'; barStatus = 'success'; break;
                        case 'declined':    barSub = 'Declined'; barStatus = 'error'; break;
                        case 'cancelled':   barSub = 'Cancelled'; barStatus = 'cancelled'; break;
                        case 'failed':      barSub = 'Failed: ' + (t.error || 'error'); barStatus = 'error'; break;
                    }
                    showFtChatBar(username, t.id, { icon: barIcon, title: barTitle, sub: barSub, progress: pctVal, status: barStatus });
                }
            });
            
            setTimeout(() => {
                const input = document.getElementById('messageInput_' + username);
                if (input) input.focus();
            }, 100);
        }
        
        function sendMessageTo(recipient) {
            const input = document.getElementById('messageInput_' + recipient);
            const message = input.value.trim();
            
            if (message && recipient) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    const messageId = Date.now();
                    const messageData = {
                        id: messageId,
                        from: currentUser.username,
                        fromDisplay: currentUser.displayName,
                        to: recipient,
                        message: message,
                        timestamp: new Date().toISOString()
                    };
                    
                    ws.send(JSON.stringify({
                        type: 'message',
                        data: messageData
                    }));
                    
                    addMessageToChat(recipient, messageData);
                    
                    if (currentChat === recipient) {
                        renderMessagesForChat(recipient);
                        // Re-attach FT bars after render
                        reattachFtBars(recipient);
                    }
                    
                    playSendSound();
                    input.value = '';
                }
            }
        }
        
        function handleMessageKeypress(event, recipient) {
            if (event.key === 'Enter') {
                sendMessageTo(recipient);
            }
        }
        
        function handleImageUpload(e, recipient) {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                alert('Please select an image file');
                return;
            }
            
            if (file.size > 5 * 1024 * 1024) {
                alert('Image too large! Max 5MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = function(event) {
                if (ws && ws.readyState === WebSocket.OPEN && recipient) {
                    const messageData = {
                        id: Date.now(),
                        from: currentUser.username,
                        fromDisplay: currentUser.displayName,
                        to: recipient,
                        imageData: event.target.result,
                        fileName: file.name,
                        isImage: true,
                        timestamp: new Date().toISOString()
                    };
                    
                    ws.send(JSON.stringify({
                        type: 'image_share',
                        ...messageData
                    }));
                    
                    addMessageToChat(recipient, messageData);
                    
                    if (currentChat === recipient) {
                        renderMessagesForChat(recipient);
                        reattachFtBars(recipient);
                    }
                }
            };
            reader.readAsDataURL(file);
            
            e.target.value = '';
        }
        
        function startCallTo(recipient) {
            currentCallWith = recipient;
            startCall();
        }
        
        function updateContactListWithOnlineUsers(onlineUsers) {
            userContacts.forEach(contact => {
                const onlineUser = onlineUsers.find(u => u.username === contact.username);
                if (onlineUser) {
                    contact.status = onlineUser.status || 'online';
                } else {
                    contact.status = 'offline';
                }
            });
            updateContactList();
        }
        
        function showAddContact() {
            const username = prompt('Enter username to add:');
            if (username && username.trim()) {
                const displayName = prompt('Enter display name (optional):') || username;
                addContactAutoSync(username, displayName);
            }
        }
        
        function addContactAutoSync(username, displayName) {
            if (!userContacts.find(c => c.username === username)) {
                userContacts.push({
                    username: username,
                    displayName: displayName,
                    status: 'offline'
                });
                
                localStorage.setItem('userContacts_' + currentUser.username, JSON.stringify(userContacts));
                updateContactList();
                addSystemMessage('Added ' + displayName + ' to contacts');
                
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'sync_contacts',
                        username: currentUser.username,
                        contacts: userContacts
                    }));
                }
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'contact_add',
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    targetUsername: username,
                    targetDisplayName: displayName
                }));
            }
        }
        
        function showCreateGroup() {
            const memberList = document.getElementById('groupMemberList');
            memberList.innerHTML = '';
            
            if (userContacts.length === 0) {
                memberList.innerHTML = '<div style="color: var(--text-primary); font-style: italic;">No contacts yet. Add contacts first!</div>';
            } else {
                userContacts.forEach(contact => {
                    const memberItem = document.createElement('div');
                    memberItem.style.marginBottom = '5px';
                    memberItem.innerHTML = 
                        '<input type="checkbox" id="member_' + contact.username + '" checked>' +
                        '<label for="member_' + contact.username + '" style="margin-left: 5px; color: var(--text-primary);">' +
                            contact.displayName + ' (' + contact.username + ')' +
                        '</label>';
                    memberList.appendChild(memberItem);
                });
            }
            
            document.getElementById('groupNameInput').value = '';
            document.getElementById('createGroupWindow').classList.remove('hidden');
        }
        
        function closeCreateGroup() {
            document.getElementById('createGroupWindow').classList.add('hidden');
        }
        
        function createGroup() {
            const groupName = document.getElementById('groupNameInput').value.trim();
            if (!groupName) {
                alert('Please enter a group name');
                return;
            }
            
            const selectedMembers = [currentUser.username];
            const checkboxes = document.querySelectorAll('#groupMemberList input[type="checkbox"]');
            
            checkboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    const username = checkbox.id.replace('member_', '');
                    selectedMembers.push(username);
                }
            });
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'create_group',
                    groupName: groupName,
                    creator: currentUser.username,
                    members: selectedMembers
                }));
                
                closeCreateGroup();
            }
        }
        
        function addSystemMessage(message) {
            console.log('System:', message);
        }
        
        function showTab(tabName) {
            document.getElementById('loginTab').classList.add('hidden');
            document.getElementById('registerTab').classList.add('hidden');
            document.getElementById(tabName + 'Tab').classList.remove('hidden');
            
            document.querySelectorAll('.xp-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.textContent.toLowerCase().includes(tabName)) {
                    tab.classList.add('active');
                }
            });
        }

        async function login() {
            const username = document.getElementById('loginUsername').value.trim();
            const password = document.getElementById('loginPassword').value;
            const status = document.getElementById('statusMessage');
            
            if (!username || !password) {
                status.textContent = 'Please enter username and password';
                return;
            }
            
            status.textContent = 'Logging in...';
            
            try {
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const result = await res.json();
                
                if (result.success) {
                    currentUser = {
                        username: username,
                        id: Date.now(),
                        displayName: result.displayName || username
                    };
                    myStatus = 'online';
                    status.textContent = 'Login successful!';
                    playLoginSound();
                    showChatWindow();
                    connectWebSocket();
                } else {
                    status.textContent = result.error || 'Invalid username or password';
                }
            } catch (e) {
                console.error('Login error:', e);
                status.textContent = 'Login failed. Check server connection.';
            }
        }
        
        async function register() {
            const username = document.getElementById('regUsername').value.trim();
            const password = document.getElementById('regPassword').value;
            const email = document.getElementById('regEmail').value;
            const displayName = document.getElementById('regDisplayName').value || username;
            const status = document.getElementById('statusMessage');
            
            if (!username || !password) {
                status.textContent = 'Please fill in username and password';
                return;
            }
            
            status.textContent = 'Creating account...';
            
            try {
                const res = await fetch('/api/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password, displayName, email })
                });
                const result = await res.json();
                
                if (result.success) {
                    status.textContent = 'Account created! Please login.';
                    showTab('login');
                    
                    document.getElementById('regUsername').value = '';
                    document.getElementById('regPassword').value = '';
                    document.getElementById('regEmail').value = '';
                    document.getElementById('regDisplayName').value = '';
                } else {
                    status.textContent = result.error || 'Registration failed';
                }
            } catch (e) {
                console.error('Register error:', e);
                status.textContent = 'Registration failed. Check server connection.';
            }
        }
        
        function showChatWindow() {
            document.getElementById('loginWindow').classList.add('hidden');
            document.getElementById('chatWindow').classList.remove('hidden');
            document.getElementById('currentUser').textContent = currentUser.displayName;
            updateSelfStatusUI();
            
            loadMessagesFromLocalStorage();
            loadContacts();
        }
        
        function connectWebSocket() {
            if (connectionInProgress) return;
            connectionInProgress = true;
            
            const host = window.location.hostname;
            const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
            const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
            
            ws = new WebSocket(protocol + host + ':' + port);
            
            ws.onopen = () => {
                connectionInProgress = false;
                document.getElementById('chatStatus').textContent = 'Connected to Skype Classic';
                
                const savedContacts = JSON.parse(localStorage.getItem('userContacts_' + currentUser.username) || '[]');
                
                ws.send(JSON.stringify({
                    type: 'join',
                    username: currentUser.username,
                    userId: currentUser.id,
                    displayName: currentUser.displayName,
                    contacts: savedContacts,
                    status: myStatus
                }));
            };
            
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            };
            
            ws.onclose = () => {
                connectionInProgress = false;
                document.getElementById('chatStatus').textContent = 'Disconnected from server';
            };
        }
        
        function handleWebSocketMessage(data) {
            try {
            switch(data.type) {
                case 'user_join':
                    updateContactListWithOnlineUsers(data.users);
                    break;
                    
                case 'user_leave':
                    updateContactListWithOnlineUsers(data.users);
                    break;

                case 'message_history':
                    if (data.messages) {
                        const chatId = data.chatId;
                        if (!chatMessages[chatId]) {
                            chatMessages[chatId] = [];
                        }
                        data.messages.forEach(msg => {
                            if (!chatMessages[chatId].find(m => m.id === msg.id)) {
                                chatMessages[chatId].push(msg);
                            }
                        });
                        saveMessagesToLocalStorage();
                        if (currentChat === chatId) {
                            renderMessagesForChat(chatId);
                            reattachFtBars(chatId);
                        }
                    }
                    break;
                    
                case 'messages_synced':
                    console.log('Messages synced to server:', data.chatId);
                    break;
                    
                case 'new_message':
                    if (data.data.id > messageCounter) {
                        const chatPartner = data.data.from === currentUser.username ? data.data.to : data.data.from;
                        addMessageToChat(chatPartner, data.data);
                        messageCounter = data.data.id;
                        
                        if (currentChat === chatPartner) {
                            renderMessagesForChat(chatPartner);
                            reattachFtBars(chatPartner);
                        }
                        
                        if (data.data.from !== currentUser.username) {
                            playMessageSound();
                        }
                    }
                    break;
                    
                case 'image_receive':
                    const sender = data.from;
                    const messageData = {
                        id: Date.now(),
                        from: sender,
                        fromDisplay: data.fromDisplay,
                        to: currentUser.username,
                        imageData: data.imageData,
                        fileName: data.fileName,
                        isImage: true,
                        timestamp: data.timestamp
                    };
                    addMessageToChat(sender, messageData);
                    
                    if (currentChat === sender) {
                        renderMessagesForChat(sender);
                        reattachFtBars(sender);
                    }
                    playMessageSound();
                    break;
                    
                case 'call_request':
                    if (isInCall) {
                        ws.send(JSON.stringify({
                            type: 'call_declined',
                            from: currentUser.username,
                            to: data.from
                        }));
                        return;
                    }
                    incomingCallFrom = data.from;
                    document.getElementById('callerName').textContent = data.fromDisplay || data.from;
                    document.getElementById('incomingCallWindow').classList.remove('hidden');
                    playCallSound();
                    window.currentCallId = data.callId || 'call_' + Date.now();
                    break;
                    
                case 'call_accepted':
                    stopCallSounds();
                    playCallAcceptSound();
                    if (data.callId) window.currentCallId = data.callId;
                    document.getElementById('callWindow').classList.remove('hidden');
                    const ctEl = document.getElementById('callTarget');
                    if (ctEl) ctEl.textContent = data.fromDisplay || data.from;
                    document.getElementById('callStatus').textContent = 'In call with ' + (data.fromDisplay || data.from);
                    startCallTimer();
                    isInCall = true;
                    currentCallWith = data.from;
                    setupWebRTC(true);
                    break;
                    
                case 'call_declined':
                    stopCallSounds();
                    playCallEndSound();
                    document.getElementById('callWindow').classList.add('hidden');
                    document.getElementById('incomingCallWindow').classList.add('hidden');
                    isInCall = false;
                    currentCallWith = null;
                    cleanupWebRTC();
                    break;
                    
                case 'group_created':
                    userGroups.push(data.group);
                    updateContactList();
                    break;
                    
                case 'chat_history':
                    if (data.messages) {
                        const chatId = data.chatId;
                        data.messages.forEach(msg => {
                            addMessageToChat(chatId, msg);
                        });
                        if (currentChat === chatId) {
                            renderMessagesForChat(chatId);
                            reattachFtBars(chatId);
                        }
                        if (data.messages.length > 0) {
                            const sortedMessages = [...data.messages].sort((a, b) => a.id - b.id);
                            messageCounter = Math.max(messageCounter, sortedMessages[sortedMessages.length - 1].id);
                        }
                    }
                    break;
                    
                case 'call_end':
                    if (isInCall) {
                        stopCallSounds();
                        playCallEndSound();
                        document.getElementById('callWindow').classList.add('hidden');
                        document.getElementById('incomingCallWindow').classList.add('hidden');
                        
                        if (callTimerInterval) {
                            clearInterval(callTimerInterval);
                            callTimerInterval = null;
                        }
                        
                        isInCall = false;
                        currentCallWith = null;
                        callStartTime = null;
                        cleanupWebRTC();
                    }
                    break;
                    
                case 'contact_list':
                    if (data.contacts) {
                        userContacts = data.contacts;
                        localStorage.setItem('userContacts_' + currentUser.username, JSON.stringify(userContacts));
                        updateContactList();
                    }
                    break;
                    
                case 'contact_add_result':
                case 'contact_added':
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({
                            type: 'get_contacts',
                            username: currentUser.username
                        }));
                    }
                    break;
                    
                case 'webrtc_offer':
                    handleWebRTCOffer(data.offer, data.from);
                    break;
                    
                case 'webrtc_answer':
                    handleWebRTCAnswer(data.answer);
                    break;
                    
                case 'ice_candidate':
                    handleICECandidate(data.candidate);
                    break;

                // ==================== FILE TRANSFER SIGNALING ====================
                case 'ft_offer':
                    handleFtOffer(data);
                    break;
                case 'ft_accept':
                    handleFtAccept(data);
                    break;
                case 'ft_decline':
                    handleFtDecline(data);
                    break;
                case 'ft_cancel':
                    handleFtCancel(data);
                    break;
                case 'ft_signal':
                    handleFtSignal(data);
                    break;
            }
            } catch (err) {
                console.error('❌ ERROR in handleWebSocketMessage for type ' + data.type + ':', err);
                console.error('Raw data was:', JSON.stringify(data).substring(0, 500));
            }
        }
        
        function logout() {
            playLogoutSound();
            if (ws) ws.close();
            document.getElementById('chatWindow').classList.add('hidden');
            document.getElementById('loginWindow').classList.remove('hidden');
            currentUser = null;
            currentChat = null;
            messageCounter = 0;
            chatMessages = {};
            myStatus = 'online';
            document.getElementById('statusMessage').textContent = 'Logged out successfully';
            cleanupWebRTC();
            
            // Clean up any in-progress transfers
            ftTransfers.forEach(t => {
                if (t.pc) { try { t.pc.close(); } catch(e){} }
                if (t.cleanup) { try { t.cleanup(); } catch(e){} }
            });
            ftTransfers.clear();
            document.getElementById('ftTransfersStack').innerHTML = '';
            document.getElementById('ftOfferWindow').classList.add('hidden');
            ftIncomingOffer = null;
        }
        
        function showAnalyticsPopup() {
            document.getElementById('analyticsPopup').classList.remove('hidden');
        }
        
        function closeAnalyticsPopup() {
            document.getElementById('analyticsPopup').classList.add('hidden');
            setTimeout(showAnalyticsPopup, 30 * 60 * 1000);
        }
        
        function openAnalytics() {
            window.open('/analytics', '_blank');
            closeAnalyticsPopup();
        }
        
        setTimeout(showAnalyticsPopup, 30 * 60 * 1000);
        
        function playMessageSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('messageSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function playLoginSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('loginSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }

        function playLogoutSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('logoutSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }

        
        function playSendSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('sendSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function playCallSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('callSound');
                sound.loop = true;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function playDialingSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('dialingSound');
                sound.loop = true;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function playCallEndSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('callEndSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
                stopCallSounds();
            }
        }
        
        function playCallAcceptSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('callAcceptSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function playCallErrorSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('callErrorSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }

        // ==================== FILE TRANSFER SOUNDS ====================
        function playFtStartSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('ftStartSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        function playFtSuccessSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('ftSuccessSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        function playFtFailSound() {
            if (document.getElementById('soundToggle').checked) {
                const sound = document.getElementById('ftFailSound');
                sound.loop = false;
                sound.currentTime = 0;
                sound.play().catch(e => console.log('Audio play failed:', e));
            }
        }
        
        function stopCallSounds() {
            const callSound = document.getElementById('callSound');
            const dialingSound = document.getElementById('dialingSound');
            
            callSound.pause();
            callSound.currentTime = 0;
            callSound.loop = false;
            
            dialingSound.pause();
            dialingSound.currentTime = 0;
            dialingSound.loop = false;
        }

        function startCall() {
            if (!currentChat) {
                alert('Please select a contact to call first!');
                return;
            }
            
            if (isInCall) {
                alert('You are already in a call!');
                return;
            }
            
            if (!microphonePermissionGranted) {
                requestMicrophonePermission().then(() => {
                    if (microphonePermissionGranted) {
                        startCall();
                    }
                });
                return;
            }
            
            if (ws && ws.readyState === WebSocket.OPEN) {
                playDialingSound();
                currentCallWith = currentChat;
                
                const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                window.currentCallId = callId;
                
                const ctEl = document.getElementById('callTarget');
                if (ctEl) ctEl.textContent = currentChat;
                document.getElementById('callWindow').classList.remove('hidden');
                document.getElementById('callStatus').textContent = 'Calling ' + currentChat + '...';
                document.getElementById('callTimer').textContent = 'Calling...';
                
                ws.send(JSON.stringify({
                    type: 'call_request',
                    callId: callId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentChat
                }));
                
                setTimeout(() => {
                    if (document.getElementById('callWindow') && 
                        document.getElementById('callWindow').classList.contains('hidden') === false && 
                        document.getElementById('callStatus').textContent.includes('Calling')) {
                        endCall();
                    }
                }, 30000);
            }
        }
        
        function acceptIncomingCall() {
            stopCallSounds();
            playCallAcceptSound();
            
            const callPartner = incomingCallFrom;
            if (callPartner) {
                ws.send(JSON.stringify({
                    type: 'call_accepted',
                    callId: window.currentCallId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: callPartner
                }));
            }
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            document.getElementById('callWindow').classList.remove('hidden');
            const ctEl2 = document.getElementById('callTarget');
            if (ctEl2) ctEl2.textContent = callPartner;
            document.getElementById('callStatus').textContent = 'In call with ' + callPartner;
            
            startCallTimer();
            isInCall = true;
            currentCallWith = callPartner;
            incomingCallFrom = null;
            
            if (!microphonePermissionGranted) {
                requestMicrophonePermission().then(() => {
                    setupWebRTC(false);
                });
            } else {
                setupWebRTC(false);
            }
        }
        
        function declineIncomingCall() {
            stopCallSounds();
            playCallEndSound();
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            
            if (incomingCallFrom) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'call_declined',
                        callId: window.currentCallId,
                        from: currentUser.username,
                        to: incomingCallFrom
                    }));
                }
                incomingCallFrom = null;
            }
            
            cleanupWebRTC();
        }
        
        function endCall() {
            stopCallSounds();
            playCallEndSound();
            
            const callWindow = document.getElementById('callWindow');
            const incomingCallWindow = document.getElementById('incomingCallWindow');
            if (callWindow) callWindow.classList.add('hidden');
            if (incomingCallWindow) incomingCallWindow.classList.add('hidden');
            
            if (callTimerInterval) {
                clearInterval(callTimerInterval);
                callTimerInterval = null;
            }
            
            if (currentCallWith && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'call_end',
                    callId: window.currentCallId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentCallWith
                }));
            }
            
            cleanupWebRTC();
            
            isInCall = false;
            currentCallWith = null;
            callStartTime = null;
            incomingCallFrom = null;
        }
        
        function startCallTimer() {
            callStartTime = new Date();
            callTimerInterval = setInterval(() => {
                const now = new Date();
                const diff = Math.floor((now - callStartTime) / 1000);
                const minutes = Math.floor(diff / 60);
                const seconds = diff % 60;
                document.getElementById('callTimer').textContent =
                    minutes.toString().padStart(2, '0') + ':' + seconds.toString().padStart(2, '0');
            }, 1000);
        }
        
        async function requestMicrophonePermission() {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true,
                    video: true
                });
                
                microphonePermissionGranted = true;
                stream.getTracks().forEach(track => track.stop());
                hidePermissionPrompt();
                return true;
                
            } catch (error) {
                showCallError('Microphone access denied.');
                playCallErrorSound();
                microphonePermissionGranted = false;
                return false;
            }
        }
        
        function showPermissionPrompt() {
            const prompt = document.getElementById('permissionPrompt');
            if (prompt) prompt.classList.remove('hidden');
            const controls = document.getElementById('audioControls');
            if (controls) controls.classList.add('hidden');
        }
        
        function hidePermissionPrompt() {
            const prompt = document.getElementById('permissionPrompt');
            if (prompt) prompt.classList.add('hidden');
            const controls = document.getElementById('audioControls');
            if (controls) controls.classList.remove('hidden');
        }
        
        async function setupWebRTC(isCaller) {
            try {
                if (!microphonePermissionGranted) {
                    showPermissionPrompt();
                    await requestMicrophonePermission();
                }
                
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000,
                        channelCount: 1
                    },
                    video: false
                });
                
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(e => {});
                }
                
                const config = {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' }
                    ],
                    iceCandidatePoolSize: 10
                };
                
                peerConnection = new RTCPeerConnection(config);
                
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                });
                
                peerConnection.ontrack = (event) => {
                    const remoteAudio = document.getElementById('remoteAudio');
                    if (remoteAudio && event.streams[0]) {
                        remoteAudio.srcObject = event.streams[0];
                        remoteAudio.play().catch(e => {});
                    }
                };
                
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        ws.send(JSON.stringify({
                            type: 'ice_candidate',
                            to: currentCallWith,
                            candidate: event.candidate
                        }));
                    }
                };
                
                peerConnection.oniceconnectionstatechange = () => {
                    switch (peerConnection.iceConnectionState) {
                        case 'connected':
                        case 'completed':
                            hideCallError();
                            break;
                        case 'failed':
                            showCallError('Connection failed.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 3000);
                            break;
                    }
                };
                
                const controls = document.getElementById('audioControls');
                if (controls) controls.classList.remove('hidden');
                
                if (isCaller) {
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: false
                    });
                    await peerConnection.setLocalDescription(offer);
                    
                    ws.send(JSON.stringify({
                        type: 'webrtc_offer',
                        to: currentCallWith,
                        offer: offer
                    }));
                }
                
            } catch (error) {
                showCallError('Call setup failed: ' + error.message);
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCOffer(offer, from) {
            try {
                if (!peerConnection) {
                    await setupWebRTC(false);
                } else {
                    console.log('Reusing existing peer connection');
                }
                
                await peerConnection.setRemoteDescription(offer);
                
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                
                ws.send(JSON.stringify({
                    type: 'webrtc_answer',
                    to: from,
                    answer: answer
                }));
                
                await flushPendingIceCandidates();
                
            } catch (error) {
                showCallError('Failed to accept call.');
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCAnswer(answer) {
            try {
                if (!peerConnection) {
                    console.log('No peer connection — cannot set answer');
                    return;
                }
                await peerConnection.setRemoteDescription(answer);
                await flushPendingIceCandidates();
            } catch (error) {
                showCallError('Call connection failed: ' + error.message);
                playCallErrorSound();
            }
        }
        
        async function handleICECandidate(candidate) {
            try {
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(candidate);
                } else {
                    pendingIceCandidates.push(candidate);
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }

        async function flushPendingIceCandidates() {
            if (!peerConnection || !peerConnection.remoteDescription) return;
            const candidates = pendingIceCandidates;
            pendingIceCandidates = [];
            for (const candidate of candidates) {
                try {
                    await peerConnection.addIceCandidate(candidate);
                } catch (e) {
                    console.log('Failed to add queued candidate:', e);
                }
            }
        }
        
        function toggleMute() {
            if (localStream) {
                const audioTracks = localStream.getAudioTracks();
                audioTracks.forEach(track => {
                    track.enabled = !track.enabled;
                });
                isMuted = !isMuted;
                const muteBtn = document.getElementById('muteButton');
                if (muteBtn) muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
            }
        }
        
        function toggleDeafen() {
            const remoteAudio = document.getElementById('remoteAudio');
            if (remoteAudio) {
                remoteAudio.muted = !remoteAudio.muted;
                isDeafened = !isDeafened;
                const deafenBtn = document.getElementById('deafenButton');
                if (deafenBtn) deafenBtn.textContent = isDeafened ? 'Undeafen' : 'Deafen';
            }
        }
        
        function cleanupWebRTC() {
            pendingIceCandidates = [];
            
            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }
            
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = null;
                localVideo.pause();
            }
            
            const remoteAudio = document.getElementById('remoteAudio');
            if (remoteAudio) {
                remoteAudio.srcObject = null;
                remoteAudio.pause();
            }
            
            isMuted = false;
            isDeafened = false;
            
            const muteBtn = document.getElementById('muteButton');
            if (muteBtn) muteBtn.textContent = 'Mute';
            
            const deafenBtn = document.getElementById('deafenButton');
            if (deafenBtn) deafenBtn.textContent = 'Deafen';
            
            hideCallError();
            hidePermissionPrompt();
        }
        
        function showCallError(message) {
            const err = document.getElementById('callError');
            if (err) {
                err.textContent = message;
                err.classList.remove('hidden');
            }
        }
        
        function hideCallError() {
            const err = document.getElementById('callError');
            if (err) err.classList.add('hidden');
        }

        // ==================== FILE TRANSFER: HELPERS ====================
        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
        }

        function formatSpeed(bytesPerSec) {
            if (!bytesPerSec || bytesPerSec <= 0) return '0 B/s';
            return formatBytes(bytesPerSec) + '/s';
        }

        function formatEta(seconds) {
            if (!isFinite(seconds) || seconds <= 0) return '--:--';
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
        }

        function makeTransferId() {
            return 'ft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
        }

        // ==================== FILE TRANSFER CHAT BARS ====================
        // Renders/updates a full-width bar inside the chat with the given peer.
        // If transferId is provided, the bar updates in-place (progress, status).
        // If not, it's a one-shot notification (declines, cancels without transfer id).
        function showFtChatBar(peer, transferId, opts) {
            if (!peer || !currentUser) return;
            opts = opts || {};

            const container = document.getElementById('messages_' + peer);
            if (!container) return; // chat with this peer isn't open

            const barId = 'ftbar_' + (transferId || (Date.now() + '_' + Math.random().toString(36).substr(2, 5)));
            let bar = document.getElementById(barId);

            if (!bar) {
                bar = document.createElement('div');
                bar.id = barId;
                bar.className = 'ft-chat-bar';
                bar.innerHTML = \`
                    <div class="ft-bar-icon">📎</div>
                    <div class="ft-bar-text">
                        <strong class="ft-bar-title"></strong>
                        <small class="ft-bar-sub"></small>
                        <div class="ft-bar-progress"><div class="ft-bar-progress-fill"></div></div>
                    </div>
                    <div class="ft-bar-close" title="Dismiss">×</div>
                \`;
                bar.querySelector('.ft-bar-close').onclick = () => bar.remove();
                container.appendChild(bar);
            }

            const titleEl = bar.querySelector('.ft-bar-title');
            const subEl = bar.querySelector('.ft-bar-sub');
            const fillEl = bar.querySelector('.ft-bar-progress-fill');
            const progressWrap = bar.querySelector('.ft-bar-progress');

            if (opts.title) titleEl.textContent = opts.title;
            if (opts.sub) subEl.textContent = opts.sub;

            if (typeof opts.progress === 'number') {
                progressWrap.style.display = '';
                fillEl.style.width = Math.max(0, Math.min(100, opts.progress)).toFixed(1) + '%';
            } else if (opts.hideProgress) {
                progressWrap.style.display = 'none';
            }

            bar.classList.remove('success', 'error', 'cancelled');
            if (opts.status === 'success') bar.classList.add('success');
            else if (opts.status === 'error') bar.classList.add('error');
            else if (opts.status === 'cancelled') bar.classList.add('cancelled');

            if (opts.icon) bar.querySelector('.ft-bar-icon').textContent = opts.icon;

            container.scrollTop = container.scrollHeight;
        }

        // Re-render FT bars for the given peer (called after a chat re-render)
        function reattachFtBars(peer) {
            ftTransfers.forEach(t => {
                if (t.peer !== peer) return;
                const done = t.direction === 'send' ? t.bytesSent : t.receivedBytes;
                const total = t.filesize || 1;
                const pctVal = Math.min(100, (done / total) * 100);
                let barIcon, barTitle, barSub, barStatus;
                if (t.direction === 'send') { barIcon = '📤'; barTitle = 'Sending "' + t.filename + '"'; }
                else { barIcon = '📥'; barTitle = 'Receiving "' + t.filename + '"'; }
                switch (t.status) {
                    case 'offered':     barSub = formatBytes(total) + ' • waiting for accept…'; break;
                    case 'connecting':  barSub = formatBytes(total) + ' • connecting…'; break;
                    case 'transferring': barSub = formatBytes(done) + ' / ' + formatBytes(total) + (t.speed > 0 ? ' • ' + formatSpeed(t.speed) : ''); break;
                    case 'done':        barSub = formatBytes(total) + ' • complete'; barStatus = 'success'; break;
                    case 'declined':    barSub = 'Declined'; barStatus = 'error'; break;
                    case 'cancelled':   barSub = 'Cancelled'; barStatus = 'cancelled'; break;
                    case 'failed':      barSub = 'Failed: ' + (t.error || 'error'); barStatus = 'error'; break;
                }
                showFtChatBar(peer, t.id, { icon: barIcon, title: barTitle, sub: barSub, progress: pctVal, status: barStatus });
            });
        }

        // ==================== FILE TRANSFER: SENDER ====================
        function handleFilePick(e, recipient) {
            const file = e.target.files && e.target.files[0];
            e.target.value = '';
            if (!file) return;
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                alert('Not connected to server');
                return;
            }
            if (!recipient) {
                alert('No recipient selected');
                return;
            }
            if (file.size === 0) {
                alert('Cannot send empty file');
                return;
            }
            if (file.size > 500 * 1024 * 1024) {
                alert('File too large (max 500MB)');
                return;
            }

            const transferId = makeTransferId();

            const transfer = {
                id: transferId,
                direction: 'send',
                peer: recipient,
                filename: file.name,
                filesize: file.size,
                mime: file.type || 'application/octet-stream',
                file: file,
                status: 'offered',
                bytesSent: 0,
                bytesReceived: 0,
                startTime: null,
                lastTickTime: null,
                lastTickBytes: 0,
                speed: 0,
                pc: null,
                dc: null,
                pendingIce: [],
                domId: 'ft_' + transferId
            };

            ftTransfers.set(transferId, transfer);
            createFtProgressWindow(transfer);
            updateFtProgressWindow(transfer);

            // Inline chat bar
            showFtChatBar(recipient, transferId, {
                icon: '📤',
                title: 'Sending "' + file.name + '"',
                sub: formatBytes(file.size) + ' • waiting for accept…',
                progress: 0
            });

            playFtStartSound();

            ws.send(JSON.stringify({
                type: 'ft_offer',
                transferId: transferId,
                from: currentUser.username,
                fromDisplay: currentUser.displayName,
                to: recipient,
                filename: file.name,
                filesize: file.size,
                mime: transfer.mime
            }));
        }

        function handleFtOffer(data) {
            if (!data || !data.transferId) return;

            if (ftIncomingOffer) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'ft_decline',
                        transferId: data.transferId,
                        from: currentUser.username,
                        to: data.from
                    }));
                }
                return;
            }

            ftIncomingOffer = {
                transferId: data.transferId,
                from: data.from,
                fromDisplay: data.fromDisplay || data.from,
                filename: data.filename || 'file.bin',
                filesize: data.filesize || 0,
                mime: data.mime || 'application/octet-stream'
            };

            document.getElementById('ftOfferFrom').textContent =
                (data.fromDisplay || data.from) + ' wants to transfer a file!';
            document.getElementById('ftOfferFilename').textContent = ftIncomingOffer.filename;
            document.getElementById('ftOfferFilesize').textContent = formatBytes(ftIncomingOffer.filesize);
            document.getElementById('ftOfferWindow').classList.remove('hidden');

            playFtStartSound();
        }

        function acceptIncomingTransfer() {
            if (!ftIncomingOffer) return;
            const offer = ftIncomingOffer;
            ftIncomingOffer = null;
            document.getElementById('ftOfferWindow').classList.add('hidden');

            if (!ws || ws.readyState !== WebSocket.OPEN) {
                playFtFailSound();
                return;
            }

            ws.send(JSON.stringify({
                type: 'ft_accept',
                transferId: offer.transferId,
                from: currentUser.username,
                to: offer.from
            }));

            const transfer = {
                id: offer.transferId,
                direction: 'receive',
                peer: offer.from,
                peerDisplay: offer.fromDisplay,
                filename: offer.filename,
                filesize: offer.filesize,
                mime: offer.mime,
                status: 'connecting',
                bytesSent: 0,
                bytesReceived: 0,
                startTime: null,
                lastTickTime: null,
                lastTickBytes: 0,
                speed: 0,
                pc: null,
                dc: null,
                pendingIce: [],
                chunks: [],
                receivedBytes: 0,
                domId: 'ft_' + offer.transferId
            };

            ftTransfers.set(offer.transferId, transfer);
            createFtProgressWindow(transfer);
            updateFtProgressWindow(transfer);

            // Inline chat bar for the receiver
            showFtChatBar(offer.from, offer.transferId, {
                icon: '📥',
                title: 'Receiving "' + offer.filename + '"',
                sub: formatBytes(offer.filesize) + ' • connecting…',
                progress: 0
            });

            // Receiver does NOT create an offer — sender will.
            setupFtReceiver(transfer);
        }

        function declineIncomingTransfer() {
            if (!ftIncomingOffer) return;
            const offer = ftIncomingOffer;
            ftIncomingOffer = null;
            document.getElementById('ftOfferWindow').classList.add('hidden');

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'ft_decline',
                    transferId: offer.transferId,
                    from: currentUser.username,
                    to: offer.from
                }));
            }

            playFtFailSound();

            showFtChatBar(offer.from, null, {
                icon: '❌',
                title: '"' + offer.filename + '"',
                sub: 'You declined',
                hideProgress: true,
                status: 'cancelled'
            });
        }

        function handleFtAccept(data) {
            const transfer = ftTransfers.get(data.transferId);
            if (!transfer || transfer.direction !== 'send') return;

            transfer.status = 'connecting';
            updateFtProgressWindow(transfer);
            setupFtSender(transfer);
        }

        function handleFtDecline(data) {
            const transfer = ftTransfers.get(data.transferId);
            if (!transfer) return;

            transfer.status = 'declined';
            updateFtProgressWindow(transfer);
            playFtFailSound();

            if (transfer.direction === 'send') {
                showFtChatBar(transfer.peer, transfer.id, {
                    icon: '❌',
                    title: '"' + transfer.filename + '"',
                    sub: 'Declined',
                    hideProgress: true,
                    status: 'error'
                });
            }

            setTimeout(() => {
                removeFtTransfer(transfer.id);
            }, 2500);
        }

        function handleFtCancel(data) {
            const transfer = ftTransfers.get(data.transferId);
            if (!transfer) return;

            transfer.status = 'cancelled';
            updateFtProgressWindow(transfer);
            playFtFailSound();

            if (transfer.pc) {
                try { transfer.pc.close(); } catch (e) {}
            }
            transfer.pc = null;

            if (transfer.direction === 'send') {
                showFtChatBar(transfer.peer, transfer.id, {
                    icon: '❌',
                    title: '"' + transfer.filename + '"',
                    sub: 'Cancelled',
                    hideProgress: true,
                    status: 'cancelled'
                });
            } else {
                showFtChatBar(transfer.peer, transfer.id, {
                    icon: '❌',
                    title: '"' + transfer.filename + '"',
                    sub: 'Sender cancelled',
                    hideProgress: true,
                    status: 'cancelled'
                });
            }

            setTimeout(() => {
                removeFtTransfer(transfer.id);
            }, 2500);
        }

        function handleFtSignal(data) {
            const transfer = ftTransfers.get(data.transferId);
            if (!transfer) return;
            if (!transfer.pc) {
                transfer.pendingSignals = transfer.pendingSignals || [];
                transfer.pendingSignals.push(data.signal);
                return;
            }
            processFtSignal(transfer, data.signal);
        }

        async function processFtSignal(transfer, signal) {
            try {
                if (signal.type === 'offer' || signal.type === 'answer') {
                    // Guard against out-of-order / duplicate signals
                    if (transfer.pc.signalingState === 'have-local-offer' && signal.type === 'offer') {
                        console.warn('FT: Ignoring incoming offer — we already have a local offer');
                        return;
                    }
                    if (transfer.pc.signalingState === 'have-remote-offer' && signal.type === 'offer') {
                        console.warn('FT: Ignoring incoming offer — already processing a remote offer');
                        return;
                    }
                    if (transfer.pc.signalingState === 'stable' && signal.type === 'answer') {
                        console.warn('FT: Ignoring incoming answer — connection is already stable');
                        return;
                    }
                    if (transfer.pc.signalingState !== 'have-local-offer' && signal.type === 'answer') {
                        console.warn('FT: Ignoring incoming answer — no local offer to answer');
                        return;
                    }

                    await transfer.pc.setRemoteDescription(signal);
                    for (const c of (transfer.pendingIce || [])) {
                        try { await transfer.pc.addIceCandidate(c); } catch (e) {}
                    }
                    transfer.pendingIce = [];

                    if (signal.type === 'offer') {
                        const answer = await transfer.pc.createAnswer();
                        await transfer.pc.setLocalDescription(answer);
                        sendFtSignal(transfer, { type: 'answer', sdp: answer.sdp });
                    }
                } else if (signal.type === 'candidate' && signal.candidate) {
                    if (transfer.pc.remoteDescription) {
                        await transfer.pc.addIceCandidate(signal.candidate);
                    } else {
                        transfer.pendingIce = transfer.pendingIce || [];
                        transfer.pendingIce.push(signal.candidate);
                    }
                }
            } catch (e) {
                console.error('FT signal error:', e);
                failFtTransfer(transfer, 'Connection error: ' + e.message);
            }
        }

        function sendFtSignal(transfer, signal) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'ft_signal',
                    transferId: transfer.id,
                    from: currentUser.username,
                    to: transfer.peer,
                    signal: signal
                }));
            }
        }

        async function setupFtSender(transfer) {
            try {
                transfer.pc = new RTCPeerConnection(rtcConfiguration);

                transfer.pc.onicecandidate = (e) => {
                    if (e.candidate) {
                        sendFtSignal(transfer, { type: 'candidate', candidate: e.candidate });
                    }
                };

                transfer.pc.oniceconnectionstatechange = () => {
                    // 'closed' just means someone called pc.close() (normal end-of-transfer).
                    // Only 'failed' indicates a real network problem.
                    if (transfer.pc.iceConnectionState === 'failed') {
                        if (transfer.status !== 'done' && transfer.status !== 'cancelled' &&
                            transfer.status !== 'declined' && transfer.status !== 'failed') {
                            failFtTransfer(transfer, 'Connection failed');
                        }
                    }
                };

                const dc = transfer.pc.createDataChannel('file', {
                    ordered: true
                });
                transfer.dc = dc;
                wireDataChannel(transfer, dc, 'send');

                const offer = await transfer.pc.createOffer();
                await transfer.pc.setLocalDescription(offer);
                sendFtSignal(transfer, { type: 'offer', sdp: offer.sdp });
            } catch (e) {
                console.error('setupFtSender error:', e);
                failFtTransfer(transfer, 'Setup failed: ' + e.message);
            }
        }

        // Receiver: create PC, wait for sender's offer, wait for data channel.
        // Receiver does NOT create an offer (sender is the offerer).
        async function setupFtReceiver(transfer) {
            try {
                transfer.pc = new RTCPeerConnection(rtcConfiguration);

                transfer.pc.onicecandidate = (e) => {
                    if (e.candidate) {
                        sendFtSignal(transfer, { type: 'candidate', candidate: e.candidate });
                    }
                };

                transfer.pc.oniceconnectionstatechange = () => {
                    if (transfer.pc.iceConnectionState === 'failed' ||
                        transfer.pc.iceConnectionState === 'closed') {
                        if (transfer.status !== 'done' && transfer.status !== 'cancelled' && transfer.status !== 'declined') {
                            failFtTransfer(transfer, 'Connection failed');
                        }
                    }
                };

                transfer.pc.ondatachannel = (event) => {
                    const dc = event.channel;
                    transfer.dc = dc;
                    wireDataChannel(transfer, dc, 'receive');
                };

                // Process any signals that arrived before the PC was ready
                if (transfer.pendingSignals) {
                    for (const sig of transfer.pendingSignals) {
                        await processFtSignal(transfer, sig);
                    }
                    transfer.pendingSignals = [];
                }
            } catch (e) {
                console.error('setupFtReceiver error:', e);
                failFtTransfer(transfer, 'Setup failed: ' + e.message);
            }
        }

        function wireDataChannel(transfer, dc, side) {
            dc.binaryType = 'arraybuffer';

            dc.onopen = () => {
                transfer.status = 'transferring';
                transfer.startTime = Date.now();
                transfer.lastTickTime = Date.now();
                transfer.lastTickBytes = 0;
                updateFtProgressWindow(transfer);

                if (side === 'send') {
                    startSendingChunks(transfer);
                } else {
                    transfer.receivedBytes = 0;
                    transfer.chunks = [];
                }
            };

            dc.onmessage = (event) => {
                if (side !== 'receive') return;
                const data = event.data;

                if (typeof data === 'string') {
                    try {
                        const msg = JSON.parse(data);
                        if (msg.type === 'file-end') {
                            transfer.gotFileEnd = true;
                            finishReceive(transfer);
                        }
                    } catch (e) {}
                    return;
                }

                const chunk = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
                transfer.chunks.push(chunk);
                transfer.receivedBytes += chunk.byteLength;

                if (transfer.receivedBytes - (transfer.lastAckBytes || 0) > 256 * 1024) {
                    transfer.lastAckBytes = transfer.receivedBytes;
                    try {
                        dc.send(JSON.stringify({ type: 'progress', received: transfer.receivedBytes }));
                    } catch (e) {}
                }

                const now = Date.now();
                if (now - transfer.lastTickTime >= 500) {
                    const dt = (now - transfer.lastTickTime) / 1000;
                    const db = transfer.receivedBytes - transfer.lastTickBytes;
                    transfer.speed = db / dt;
                    transfer.lastTickTime = now;
                    transfer.lastTickBytes = transfer.receivedBytes;
                }
                updateFtProgressWindow(transfer);
            };

            dc.onclose = () => {
                if (transfer.status !== 'transferring') return;

                if (transfer.direction === 'receive') {
                    if (transfer.receivedBytes >= transfer.filesize || transfer.gotFileEnd) {
                        finishReceive(transfer);
                    } else {
                        failFtTransfer(transfer, 'Connection closed prematurely');
                    }
                } else if (transfer.direction === 'send') {
                    if (transfer.bytesSent >= transfer.filesize) {
                        finishSend(transfer);
                    } else {
                        failFtTransfer(transfer, 'Connection closed prematurely');
                    }
                }
            };

            dc.onerror = (e) => {
                // Chrome fires a "Restricted" error on RTCDataChannel when the
                // underlying DTLS transport is torn down after a successful
                // transfer. It's benign — ignore it.
                const errName = (e && e.error && (e.error.name || e.error.message || e.error)) || '';
                if (errName === 'Restricted') return;

                if (transfer.status === 'done' ||
                    transfer.status === 'cancelled' ||
                    transfer.status === 'declined' ||
                    transfer.status === 'failed') {
                    return;
                }
                console.error('DC error:', e);
                failFtTransfer(transfer, 'Data channel error');
            };
        }

        async function startSendingChunks(transfer) {
            try {
                const file = transfer.file;
                let offset = 0;
                const dc = transfer.dc;

                const pump = async () => {
                    while (offset < file.size) {
                        while (dc.bufferedAmount > FT_BUFFER_THRESHOLD) {
                            await new Promise(r => setTimeout(r, 20));
                            if (transfer.status === 'cancelled' || transfer.status === 'failed') return;
                        }

                        const slice = file.slice(offset, offset + FT_CHUNK_SIZE);
                        const buf = await slice.arrayBuffer();
                        try {
                            dc.send(buf);
                        } catch (e) {
                            failFtTransfer(transfer, 'Send failed: ' + e.message);
                            return;
                        }
                        offset += buf.byteLength;
                        transfer.bytesSent = offset;

                        const now = Date.now();
                        if (now - transfer.lastTickTime >= 500) {
                            const dt = (now - transfer.lastTickTime) / 1000;
                            const db = transfer.bytesSent - transfer.lastTickBytes;
                            transfer.speed = db / dt;
                            transfer.lastTickTime = now;
                            transfer.lastTickBytes = transfer.bytesSent;
                            updateFtProgressWindow(transfer);
                        }
                    }

                    try {
                        dc.send(JSON.stringify({ type: 'file-end' }));
                    } catch (e) {}

                    updateFtProgressWindow(transfer);
                    setTimeout(() => {
                        if (transfer.status === 'transferring') {
                            finishSend(transfer);
                        }
                    }, 800);
                };

                pump();
            } catch (e) {
                console.error('startSendingChunks error:', e);
                failFtTransfer(transfer, 'Send error: ' + e.message);
            }
        }

        function finishSend(transfer) {
            if (transfer.status === 'done') return;
            // Silence the data channel before we tear it down — Chrome
            // fires a benign "Restricted" error on DTLS teardown.
            if (transfer.dc) {
                transfer.dc.onerror = null;
                transfer.dc.onclose = null;
                transfer.dc.onmessage = null;
            }
            transfer.status = 'done';
            transfer.bytesSent = transfer.filesize;
            updateFtProgressWindow(transfer);
            playFtSuccessSound();

            showFtChatBar(transfer.peer, transfer.id, {
                icon: '✅',
                title: '"' + transfer.filename + '"',
                sub: 'Sent • ' + formatBytes(transfer.filesize),
                hideProgress: true,
                status: 'success'
            });

            if (transfer.pc) {
                try { transfer.pc.close(); } catch (e) {}
                transfer.pc = null;
            }

            setTimeout(() => removeFtTransfer(transfer.id), 4000);
        }

        function finishReceive(transfer) {
            if (transfer.status === 'done') return;
            if (transfer.dc) {
                transfer.dc.onerror = null;
                transfer.dc.onclose = null;
                transfer.dc.onmessage = null;
            }
            transfer.status = 'done';
            updateFtProgressWindow(transfer);
            playFtSuccessSound();

            try {
                const blob = new Blob(transfer.chunks, { type: transfer.mime || 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = transfer.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 10000);

                showFtChatBar(transfer.peer, transfer.id, {
                    icon: '✅',
                    title: '"' + transfer.filename + '"',
                    sub: 'Received • ' + formatBytes(transfer.filesize),
                    hideProgress: true,
                    status: 'success'
                });
            } catch (e) {
                console.error('Download trigger failed:', e);
            }

            if (transfer.pc) {
                try { transfer.pc.close(); } catch (e) {}
                transfer.pc = null;
            }

            setTimeout(() => removeFtTransfer(transfer.id), 4000);
        }

        function failFtTransfer(transfer, reason) {
            if (transfer.status === 'done' || transfer.status === 'failed') return;
            if (transfer.dc) {
                transfer.dc.onerror = null;
                transfer.dc.onclose = null;
            }
            transfer.status = 'failed';
            transfer.error = reason;
            updateFtProgressWindow(transfer);
            playFtFailSound();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'ft_cancel',
                    transferId: transfer.id,
                    from: currentUser.username,
                    to: transfer.peer
                }));
            }

            if (transfer.pc) {
                try { transfer.pc.close(); } catch (e) {}
                transfer.pc = null;
            }

            showFtChatBar(transfer.peer, transfer.id, {
                icon: '❌',
                title: '"' + transfer.filename + '"',
                sub: 'Failed: ' + (reason || 'error'),
                hideProgress: true,
                status: 'error'
            });

            setTimeout(() => removeFtTransfer(transfer.id), 3000);
        }

        function cancelFtTransfer(transferId) {
            const transfer = ftTransfers.get(transferId);
            if (!transfer) return;
            if (transfer.status === 'done' || transfer.status === 'failed' || transfer.status === 'cancelled') return;

            if (transfer.dc) {
                transfer.dc.onerror = null;
                transfer.dc.onclose = null;
            }
            transfer.status = 'cancelled';
            updateFtProgressWindow(transfer);
            playFtFailSound();

            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'ft_cancel',
                    transferId: transfer.id,
                    from: currentUser.username,
                    to: transfer.peer
                }));
            }

            if (transfer.pc) {
                try { transfer.pc.close(); } catch (e) {}
                transfer.pc = null;
            }

            showFtChatBar(transfer.peer, transfer.id, {
                icon: '❌',
                title: '"' + transfer.filename + '"',
                sub: 'Cancelled',
                hideProgress: true,
                status: 'cancelled'
            });

            setTimeout(() => removeFtTransfer(transfer.id), 2500);
        }

        function removeFtTransfer(transferId) {
            const transfer = ftTransfers.get(transferId);
            if (!transfer) return;
            const el = document.getElementById(transfer.domId);
            if (el) el.remove();
            ftTransfers.delete(transferId);
        }

        // ==================== FILE TRANSFER UI ====================
        function createFtProgressWindow(transfer) {
            const stack = document.getElementById('ftTransfersStack');
            const win = document.createElement('div');
            win.className = 'xp-window ft-window';
            win.id = transfer.domId;

            const isSend = transfer.direction === 'send';
            const title = isSend ? '📤 Sending File' : '📥 Receiving File';
            const peerLabel = isSend ? ('To: ' + transfer.peer) : ('From: ' + (transfer.peerDisplay || transfer.peer));

            win.innerHTML = \`
                <div class="xp-titlebar">
                    <span>\${title}</span>
                    <div class="xp-titlebar-controls">
                        <div class="xp-button" onclick="cancelFtTransfer('\${transfer.id}')">×</div>
                    </div>
                </div>
                <div class="xp-content">
                    <div class="ft-filename" title="\${escapeHtml(transfer.filename)}">\${escapeHtml(transfer.filename)}</div>
                    <div class="ft-filesize">\${formatBytes(transfer.filesize)} • \${peerLabel}</div>
                    <div class="ft-progress-bar">
                        <div class="ft-progress-fill" id="\${transfer.domId}_fill"></div>
                        <div class="ft-progress-segments">
                            <div></div><div></div><div></div><div></div><div></div>
                            <div></div><div></div><div></div><div></div><div></div>
                        </div>
                    </div>
                    <div class="ft-info-row">
                        <span id="\${transfer.domId}_status">\${ftStatusLabel(transfer)}</span>
                        <span id="\${transfer.domId}_pct">0%</span>
                    </div>
                    <div class="ft-stats">
                        <span id="\${transfer.domId}_speed">0 B/s</span>
                        <span id="\${transfer.domId}_eta">ETA: --:--</span>
                    </div>
                    <div style="text-align: center; margin-top: 10px;">
                        <button class="ft-cancel-btn" onclick="cancelFtTransfer('\${transfer.id}')">Cancel</button>
                    </div>
                </div>
            \`;
            stack.appendChild(win);
        }

        function ftStatusLabel(transfer) {
            switch (transfer.status) {
                case 'offered': return 'Waiting for acceptance...';
                case 'connecting': return 'Connecting...';
                case 'transferring': return transfer.direction === 'send' ? 'Sending...' : 'Receiving...';
                case 'done': return 'Complete';
                case 'declined': return 'Declined';
                case 'cancelled': return 'Cancelled';
                case 'failed': return 'Failed: ' + (transfer.error || 'error');
                default: return transfer.status;
            }
        }

        function updateFtProgressWindow(transfer) {
            const fill = document.getElementById(transfer.domId + '_fill');
            const status = document.getElementById(transfer.domId + '_status');
            const pct = document.getElementById(transfer.domId + '_pct');
            const speed = document.getElementById(transfer.domId + '_speed');
            const eta = document.getElementById(transfer.domId + '_eta');
            if (!fill) return;

            const done = transfer.direction === 'send' ? transfer.bytesSent : transfer.receivedBytes;
            const total = transfer.filesize || 1;
            const pctVal = Math.min(100, (done / total) * 100);

            fill.style.width = pctVal.toFixed(2) + '%';
            if (pct) pct.textContent = pctVal.toFixed(0) + '%';
            if (status) status.textContent = ftStatusLabel(transfer);
            if (speed) speed.textContent = transfer.status === 'transferring' ? formatSpeed(transfer.speed) : '';

            if (eta) {
                if (transfer.status === 'transferring' && transfer.speed > 0) {
                    const remaining = (total - done) / transfer.speed;
                    eta.textContent = 'ETA: ' + formatEta(remaining);
                } else {
                    eta.textContent = '';
                }
            }

            // Also update the inline chat bar
            let barIcon, barTitle, barSub, barStatus;
            if (transfer.direction === 'send') {
                barIcon = '📤';
                barTitle = 'Sending "' + transfer.filename + '"';
            } else {
                barIcon = '📥';
                barTitle = 'Receiving "' + transfer.filename + '"';
            }
            switch (transfer.status) {
                case 'offered':     barSub = formatBytes(total) + ' • waiting for accept…'; break;
                case 'connecting':  barSub = formatBytes(total) + ' • connecting…'; break;
                case 'transferring':
                    barSub = formatBytes(done) + ' / ' + formatBytes(total) +
                             (transfer.speed > 0 ? ' • ' + formatSpeed(transfer.speed) : '');
                    break;
                case 'done':        barSub = formatBytes(total) + ' • complete'; barStatus = 'success'; break;
                case 'declined':    barSub = 'Declined'; barStatus = 'error'; break;
                case 'cancelled':   barSub = 'Cancelled'; barStatus = 'cancelled'; break;
                case 'failed':      barSub = 'Failed: ' + (transfer.error || 'error'); barStatus = 'error'; break;
            }
            showFtChatBar(transfer.peer, transfer.id, {
                icon: barIcon,
                title: barTitle,
                sub: barSub,
                progress: pctVal,
                status: barStatus
            });
        }

        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[c]);
        }

        document.addEventListener('DOMContentLoaded', function() {
            loadTheme();
            document.getElementById('loginUsername').focus();
            
            document.getElementById('imageModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeImageModal();
                }
            });
        });
    </script>
    <div style="position: fixed; bottom: 5px; right: 5px; font-size: 9px; color: #666; background: rgba(255,255,255,0.7); padding: 2px 5px; border-radius: 3px;">Fan project. Not affiliated with Microsoft or Skype in any way.</div>
</body>
</html>
    `);
});

// ==================== WEBSOCKET SERVER ====================
wss.on('connection', (ws) => {
    console.log('🔗 New client connected');
    
    let currentUser = null;
    
    ws.send(JSON.stringify({
        type: 'system',
        message: 'Welcome to Skype Classic! 🟣',
        timestamp: new Date().toISOString()
    }));
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('📨 Received:', data.type, 'from:', data.username);
            
            if (data.type === 'join') {
                currentUser = data.username;
                const requestedStatus = isValidStatus(data.status) ? data.status : 'online';
                const user = {
                    id: data.userId,
                    username: currentUser,
                    displayName: data.displayName,
                    ws: ws,
                    status: requestedStatus
                };
                users.set(currentUser, user);
                
                if (data.contacts && Array.isArray(data.contacts)) {
                    try {
                        const contactsFile = path.join(__dirname, 'data', 'contacts_' + currentUser + '.json');
                        fs.writeFileSync(contactsFile, JSON.stringify(data.contacts, null, 2));
                        console.log('📱 Synced desktop contacts for', currentUser);
                    } catch (e) {
                        console.error('Error saving contacts:', e);
                    }
                }
                
                broadcast({
                    type: 'user_join',
                    message: data.displayName + ' joined the chat',
                    users: Array.from(users.values()).map(u => ({ 
                        username: u.username, 
                        displayName: u.displayName,
                        status: visibleStatus(u.status)
                    }))
                });

                chatMessages.forEach((messages, chatId) => {
                    let shouldSendHistory = false;
                    
                    if (chatId === 'public') {
                        shouldSendHistory = true;
                    } else if (chatId.startsWith('group_')) {
                        const group = groups.get(chatId);
                        if (group && group.members.includes(currentUser)) {
                            shouldSendHistory = true;
                        }
                    } else {
                        if (chatId === currentUser) {
                            shouldSendHistory = true;
                        } else {
                            const recentMsg = messages.find(msg => 
                                msg.from === currentUser || msg.to === currentUser
                            );
                            if (recentMsg) {
                                shouldSendHistory = true;
                            }
                        }
                    }
                    
                    if (shouldSendHistory) {
                        const history = messages.slice(-50);
                        if (history.length > 0) {
                            ws.send(JSON.stringify({
                                type: 'chat_history',
                                chatId: chatId,
                                messages: history
                            }));
                        }
                    }
                });

            } else if (data.type === 'get_message_history') {
                const chatId = data.chatId;
                const history = chatMessages.get(chatId) || [];
                ws.send(JSON.stringify({
                    type: 'message_history',
                    chatId: chatId,
                    messages: history.slice(-100)
                }));
                
            } else if (data.type === 'get_history') {
                const chatId = data.with;
                const history = chatMessages.get(chatId) || [];
                ws.send(JSON.stringify({
                    type: 'chat_history',
                    chatId: chatId,
                    messages: history.slice(-100)
                }));
                
            } else if (data.type === 'sync_messages') {
                const { chatId, messages } = data;
                if (!chatMessages.has(chatId)) {
                    chatMessages.set(chatId, []);
                }
                const existingMessages = chatMessages.get(chatId);
                
                messages.forEach(msg => {
                    if (!existingMessages.find(m => m.id === msg.id)) {
                        existingMessages.push(msg);
                    }
                });
                
                if (existingMessages.length > 1000) {
                    chatMessages.set(chatId, existingMessages.slice(-1000));
                } else {
                    chatMessages.set(chatId, existingMessages);
                }
                
                scheduleSaveMessages();
                
                ws.send(JSON.stringify({
                    type: 'messages_synced',
                    chatId: chatId,
                    success: true
                }));
                
            } else if (data.type === 'message') {
                const messageObj = {
                    id: data.data.id,
                    from: data.data.from,
                    fromDisplay: data.data.fromDisplay,
                    to: data.data.to,
                    message: data.data.message,
                    timestamp: data.data.timestamp
                };
                
                const recipientId = data.data.to || 'public';
                const senderId = data.data.from;
                
                [recipientId, senderId].forEach(chatId => {
                    if (!chatId) return;
                    if (!chatMessages.has(chatId)) {
                        chatMessages.set(chatId, []);
                    }
                    const arr = chatMessages.get(chatId);
                    if (!arr.find(m => m.id === messageObj.id)) {
                        arr.push(messageObj);
                        if (arr.length > 1000) {
                            arr.splice(0, arr.length - 1000);
                        }
                    }
                });
                
                scheduleSaveMessages();
                
                if (data.data.to) {
                    if (data.data.to.startsWith('group_')) {
                        const group = groups.get(data.data.to);
                        if (group) {
                            group.members.forEach(memberUsername => {
                                if (memberUsername !== data.data.from && users.has(memberUsername)) {
                                    users.get(memberUsername).ws.send(JSON.stringify({
                                        type: 'new_message',
                                        data: messageObj
                                    }));
                                }
                            });
                            ws.send(JSON.stringify({
                                type: 'new_message',
                                data: messageObj
                            }));
                        }
                    } else {
                        const targetUser = users.get(data.data.to);
                        if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                            targetUser.ws.send(JSON.stringify({
                                type: 'new_message',
                                data: messageObj
                            }));
                        }
                        ws.send(JSON.stringify({
                            type: 'new_message',
                            data: messageObj
                        }));
                    }
                } else {
                    broadcast({
                        type: 'new_message',
                        data: messageObj
                    });
                }
                
            } else if (data.type === 'status_change') {
                if (users.has(currentUser)) {
                    const newStatus = isValidStatus(data.status) ? data.status : 'online';
                    users.get(currentUser).status = newStatus;
                    console.log('🟢 Status change:', currentUser, '→', newStatus);
                    
                    broadcast({
                        type: 'user_join',
                        message: currentUser + ' is now ' + newStatus,
                        users: Array.from(users.values()).map(u => ({ 
                            username: u.username, 
                            displayName: u.displayName,
                            status: visibleStatus(u.status)
                        }))
                    });
                }
                
            } else if (data.type === 'call_request') {
                console.log('📞 call_request: from=' + data.from + ' to=' + data.to + ' callId=' + data.callId);
                console.log('📞 users map has:', Array.from(users.keys()).join(', '));
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    console.log('📞 Forwarding call_request to:', data.to);
                    targetUser.ws.send(JSON.stringify({
                        type: 'call_request',
                        from: data.from,
                        fromDisplay: data.fromDisplay,
                        to: data.to,
                        callId: data.callId
                    }));
                } else {
                    console.log('❌ Cannot forward call_request - target not found or WS not open. Found:', !!targetUser);
                }
                
            } else if (data.type === 'image_share') {
                console.log("🖼️ Relaying image from", data.from, "to", data.to);
                
                const imgMsg = {
                    id: data.id || Date.now(),
                    from: data.from,
                    fromDisplay: data.fromDisplay,
                    to: data.to,
                    imageData: data.imageData,
                    fileName: data.fileName,
                    isImage: true,
                    timestamp: data.timestamp
                };
                
                const recipientId = data.to;
                const senderId = data.from;
                [recipientId, senderId].forEach(chatId => {
                    if (!chatId) return;
                    if (!chatMessages.has(chatId)) {
                        chatMessages.set(chatId, []);
                    }
                    const arr = chatMessages.get(chatId);
                    if (!arr.find(m => m.id === imgMsg.id)) {
                        arr.push(imgMsg);
                    }
                });
                scheduleSaveMessages();
                
                if (data.to.startsWith('group_')) {
                    const group = groups.get(data.to);
                    if (group) {
                        group.members.forEach(memberUsername => {
                            if (memberUsername !== data.from && users.has(memberUsername)) {
                                users.get(memberUsername).ws.send(JSON.stringify({
                                    type: 'image_receive',
                                    from: data.from,
                                    fromDisplay: data.fromDisplay,
                                    imageData: data.imageData,
                                    fileName: data.fileName,
                                    timestamp: data.timestamp
                                }));
                            }
                        });
                        if (users.has(data.from)) {
                            users.get(data.from).ws.send(JSON.stringify({
                                type: 'image_receive',
                                from: data.from,
                                fromDisplay: data.fromDisplay,
                                imageData: data.imageData,
                                fileName: data.fileName,
                                timestamp: data.timestamp
                            }));
                        }
                    }
                } else {
                    const targetUser = users.get(data.to);
                    if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                        targetUser.ws.send(JSON.stringify({
                            type: 'image_receive',
                            from: data.from,
                            fromDisplay: data.fromDisplay,
                            imageData: data.imageData,
                            fileName: data.fileName,
                            timestamp: data.timestamp
                        }));
                    }
                }
                
            } else if (data.type === 'call_accepted') {
                console.log('📞 call_accepted: from=' + data.from + ' to=' + data.to + ' callId=' + data.callId);
                console.log('📞 users map has:', Array.from(users.keys()).join(', '));
                const caller = users.get(data.to);
                if (caller && caller.ws.readyState === WebSocket.OPEN) {
                    console.log('📞 Forwarding call_accepted to caller:', data.to);
                    caller.ws.send(JSON.stringify({
                        type: 'call_accepted',
                        from: data.from,
                        fromDisplay: data.fromDisplay,
                        callId: data.callId
                    }));
                } else {
                    console.log('❌ Cannot forward call_accepted - caller not found or WS not open. Found:', !!caller);
                }
                
            } else if (data.type === 'create_group') {
                console.log("🆕 Creating group:", data.groupName, "by", data.creator);
                
                const groupId = 'group_' + Date.now();
                const newGroup = {
                    id: groupId,
                    name: data.groupName,
                    creator: data.creator,
                    members: data.members || [data.creator],
                    createdAt: new Date().toISOString()
                };
                
                groups.set(groupId, newGroup);
                
                const members = data.members || [data.creator];
                members.forEach(memberUsername => {
                    if (users.has(memberUsername)) {
                        users.get(memberUsername).ws.send(JSON.stringify({
                            type: 'group_created',
                            group: newGroup
                        }));
                    }
                });
                
            } else if (data.type === 'call_declined') {
                const caller = users.get(data.to);
                if (caller && caller.ws.readyState === WebSocket.OPEN) {
                    caller.ws.send(JSON.stringify({
                        type: 'call_declined',
                        from: data.from
                    }));
                }
                
            } else if (data.type === 'call_end') {
                const otherUser = users.get(data.to);
                if (otherUser && otherUser.ws.readyState === WebSocket.OPEN) {
                    otherUser.ws.send(JSON.stringify({
                        type: 'call_end',
                        from: data.from,
                        fromDisplay: data.fromDisplay
                    }));
                }
                
            } else if (data.type === 'webrtc_offer') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'webrtc_offer',
                        from: data.from,
                        offer: data.offer
                    }));
                }
                
            } else if (data.type === 'webrtc_answer') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'webrtc_answer',
                        from: data.from,
                        answer: data.answer
                    }));
                }
                
            } else if (data.type === 'ice_candidate') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ice_candidate',
                        from: data.from,
                        candidate: data.candidate
                    }));
                }
                
            // ==================== FILE TRANSFER RELAY ====================
            } else if (data.type === 'ft_offer') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ft_offer',
                        transferId: data.transferId,
                        from: data.from,
                        fromDisplay: data.fromDisplay,
                        filename: data.filename,
                        filesize: data.filesize,
                        mime: data.mime
                    }));
                    console.log('📁 FT offer relayed:', data.filename, 'from', data.from, 'to', data.to);
                } else {
                    ws.send(JSON.stringify({
                        type: 'ft_cancel',
                        transferId: data.transferId,
                        from: data.to,
                        reason: 'offline'
                    }));
                }

            } else if (data.type === 'ft_accept') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ft_accept',
                        transferId: data.transferId,
                        from: data.from
                    }));
                }

            } else if (data.type === 'ft_decline') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ft_decline',
                        transferId: data.transferId,
                        from: data.from
                    }));
                }

            } else if (data.type === 'ft_cancel') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ft_cancel',
                        transferId: data.transferId,
                        from: data.from
                    }));
                }

            } else if (data.type === 'ft_signal') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'ft_signal',
                        transferId: data.transferId,
                        from: data.from,
                        signal: data.signal
                    }));
                }

            } else if (data.type === 'get_contacts') {
                console.log('📱 Getting contacts for:', data.username);
                
                const contactsFile = path.join(__dirname, 'data', 'contacts_' + data.username + '.json');
                let contacts = [];
                
                try {
                    if (fs.existsSync(contactsFile)) {
                        contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
                        console.log('📱 Found', contacts.length, 'contacts for', data.username);
                    }
                } catch (e) {
                    console.error('Error reading contacts:', e);
                }
                
                ws.send(JSON.stringify({
                    type: 'contact_list',
                    contacts: contacts
                }));
                
            } else if (data.type === 'add_contact') {
                console.log('📱 Adding contact:', data.contactUsername, 'for:', data.username);
                
                const contactsFile = path.join(__dirname, 'data', 'contacts_' + data.username + '.json');
                let contacts = [];
                
                try {
                    if (fs.existsSync(contactsFile)) {
                        contacts = JSON.parse(fs.readFileSync(contactsFile, 'utf8'));
                    }
                } catch (e) {
                    console.error('Error reading contacts:', e);
                }
                
                if (!contacts.find(c => c.username === data.contactUsername)) {
                    const newContact = {
                        username: data.contactUsername,
                        displayName: data.contactDisplayName || data.contactUsername,
                        status: 'offline',
                        addedAt: new Date().toISOString()
                    };
                    contacts.push(newContact);
                    
                    try {
                        fs.writeFileSync(contactsFile, JSON.stringify(contacts, null, 2));
                        
                        ws.send(JSON.stringify({
                            type: 'contact_add_result',
                            success: true,
                            message: 'Contact added successfully'
                        }));
                        
                        const otherUserFile = path.join(__dirname, 'data', 'contacts_' + data.contactUsername + '.json');
                        let otherContacts = [];
                        
                        try {
                            if (fs.existsSync(otherUserFile)) {
                                otherContacts = JSON.parse(fs.readFileSync(otherUserFile, 'utf8'));
                            }
                        } catch (e) {}
                        
                        if (!otherContacts.find(c => c.username === data.username)) {
                            otherContacts.push({
                                username: data.username,
                                displayName: data.username,
                                status: 'offline',
                                addedAt: new Date().toISOString()
                            });
                            
                            fs.writeFileSync(otherUserFile, JSON.stringify(otherContacts, null, 2));
                            
                            const otherUser = users.get(data.contactUsername);
                            if (otherUser && otherUser.ws.readyState === WebSocket.OPEN) {
                                otherUser.ws.send(JSON.stringify({
                                    type: 'contact_added',
                                    contact: {
                                        username: data.username,
                                        displayName: data.username
                                    }
                                }));
                            }
                        }
                        
                    } catch (e) {
                        console.error('Error saving contact:', e);
                        ws.send(JSON.stringify({
                            type: 'contact_add_result',
                            success: false,
                            message: 'Error saving contact'
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({
                        type: 'contact_add_result',
                        success: false,
                        message: 'Contact already exists'
                    }));
                }
                
            } else if (data.type === 'sync_contacts') {
                console.log('📱 Syncing contacts for:', data.username);
                
                if (data.contacts && Array.isArray(data.contacts)) {
                    const contactsFile = path.join(__dirname, 'data', 'contacts_' + data.username + '.json');
                    
                    try {
                        fs.writeFileSync(contactsFile, JSON.stringify(data.contacts, null, 2));
                        
                        ws.send(JSON.stringify({
                            type: 'contact_list',
                            contacts: data.contacts
                        }));
                    } catch (e) {
                        console.error('Error syncing contacts:', e);
                    }
                }
            }
            
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });
    
    ws.on('close', () => {
        console.log('🔌 Client disconnected');
        if (currentUser) {
            users.delete(currentUser);
            
            broadcast({
                type: 'user_leave',
                message: currentUser + ' left the chat',
                users: Array.from(users.values()).map(u => ({ 
                    username: u.username, 
                    displayName: u.displayName,
                    status: visibleStatus(u.status)
                }))
            });
        }
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// ==================== SOCKET.IO (CALLS) ====================
ioserver.on('connection', (socket) => {
    console.log('📞 New call socket connection:', socket.id);
    
    socket.on('register-call-user', (username) => {
        socket.username = username;
        socket.join(username);
        console.log(`📞 User registered for calls: ${username}`);
    });
    
    socket.on('initiate-call', (data) => {
        const { caller, receiver, callType } = data;
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        activeCalls.set(callId, {
            id: callId,
            caller: caller,
            receiver: receiver,
            type: callType,
            status: 'ringing',
            timestamp: new Date().toISOString()
        });
        
        userCallStatus.set(caller, {
            inCall: true,
            callId: callId,
            partner: receiver
        });
        
        socket.to(receiver).emit('incoming-call', {
            callId: callId,
            caller: caller,
            callType: callType,
            timestamp: new Date().toISOString()
        });
        
        console.log(`📞 Call initiated: ${caller} → ${receiver} (${callType})`);
    });
    
    socket.on('accept-call', (callId) => {
        const call = activeCalls.get(callId);
        if (call) {
            call.status = 'active';
            activeCalls.set(callId, call);
            
            userCallStatus.set(call.receiver, {
                inCall: true,
                callId: callId,
                partner: call.caller
            });
            
            ioserver.to(call.caller).emit('call-accepted', {
                callId: callId,
                receiver: call.receiver
            });
            
            console.log(`✅ Call accepted: ${callId}`);
        }
    });
    
    socket.on('reject-call', (callId) => {
        const call = activeCalls.get(callId);
        if (call) {
            socket.to(call.caller).emit('call-rejected', {
                callId: callId,
                receiver: call.receiver
            });
            
            activeCalls.delete(callId);
            userCallStatus.delete(call.caller);
            
            console.log(`❌ Call rejected: ${callId}`);
        }
    });
    
    socket.on('end-call', (callId) => {
        const call = activeCalls.get(callId);
        if (call) {
            ioserver.to(call.caller).emit('call-ended', {
                callId: callId,
                endedBy: socket.username
            });
            ioserver.to(call.receiver).emit('call-ended', {
                callId: callId,
                endedBy: socket.username
            });
            
            activeCalls.delete(callId);
            userCallStatus.delete(call.caller);
            userCallStatus.delete(call.receiver);
            
            console.log(`📴 Call ended: ${callId}`);
        }
    });
    
    socket.on('webrtc-signal', (data) => {
        const { to, signal, callId } = data;
        socket.to(to).emit('webrtc-signal', {
            from: socket.username,
            signal: signal,
            callId: callId
        });
    });
    
    socket.on('check-user-availability', (username, callback) => {
        const userStatus = userCallStatus.get(username);
        callback({
            inCall: userStatus ? userStatus.inCall : false
        });
    });
    
    socket.on('disconnect', () => {
        if (socket.username) {
            console.log(`📞 Call socket disconnected: ${socket.username}`);
            for (let [callId, call] of activeCalls.entries()) {
                if (call.caller === socket.username || call.receiver === socket.username) {
                    ioserver.emit('call-ended', {
                        callId: callId,
                        endedBy: 'system',
                        reason: 'User disconnected'
                    });
                    activeCalls.delete(callId);
                    userCallStatus.delete(call.caller);
                    userCallStatus.delete(call.receiver);
                }
            }
        }
    });
});

// ==================== MOBILE VERSION ====================
app.get('/mobile', (req, res) => {
    console.log('📱 Serving mobile version');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html>
<html>
<head>
<title>Skype Classic</title>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black">
<style>
* { margin:0; padding:0; box-sizing:border-box;
    font-family:-apple-system,'Helvetica Neue',Helvetica,Arial,sans-serif;
    -webkit-tap-highlight-color:transparent;
    -webkit-font-smoothing:antialiased; }
html, body { height:100%; overflow:hidden; background:#000; }
body { color:#1a1a1a; font-size:15px; display:flex; flex-direction:column; }

/* ============ STATUS BAR ============ */
.status-bar {
    height:20px; background:#000; color:#fff;
    display:flex; align-items:center; justify-content:space-between;
    padding:0 8px; font-size:11px; font-weight:600;
    flex-shrink:0; letter-spacing:0.3px;
}
.sb-side { display:flex; align-items:center; gap:4px; min-width:70px; }
.sb-right { justify-content:flex-end; }
.sb-center { font-weight:600; font-size:12px; }
.sb-battery {
    display:inline-block; width:22px; height:10px;
    border:1px solid #fff; border-radius:2px; position:relative;
}
.sb-battery::after {
    content:''; position:absolute; left:1px; top:1px; bottom:1px;
    width:70%; background:#4CAF50; border-radius:1px;
}
.sb-battery::before {
    content:''; position:absolute; right:-3px; top:3px;
    width:2px; height:4px; background:#fff;
    border-radius:0 1px 1px 0;
}
.sb-dots { display:flex; gap:2px; align-items:center; }
.sb-dots span {
    width:5px; height:5px; border-radius:50%;
    background:#fff; opacity:0.85;
}

/* ============ AUTH ============ */
#authOverlay {
    position:fixed; top:20px; left:0; right:0; bottom:0;
    display:none; flex-direction:column; overflow-y:auto; z-index:1000;
    background-color:#4a4a52;
    background-image:
        repeating-linear-gradient(0deg,
            rgba(255,255,255,0.03) 0px, rgba(255,255,255,0.03) 1px,
            transparent 1px, transparent 4px),
        repeating-linear-gradient(90deg,
            rgba(0,0,0,0.15) 0px, rgba(0,0,0,0.15) 1px,
            transparent 1px, transparent 4px);
}
#authOverlay.active { display:flex; }
.auth-window {
    width:100%; max-width:480px; margin:auto; padding:24px 20px;
}
.auth-tabs {
    display:flex; margin:0 auto 20px;
    width:100%; max-width:340px;
    background:linear-gradient(180deg,#3a3a42 0%,#1a1a20 100%);
    border:1px solid #000; border-radius:8px; padding:3px;
    box-shadow:inset 0 1px 2px rgba(0,0,0,0.5);
}
.auth-tab {
    flex:1; padding:9px 12px; text-align:center;
    color:#8a8a8a; font-size:13px; font-weight:700;
    cursor:pointer; border-radius:6px;
    text-shadow:0 -1px 0 rgba(0,0,0,0.5); transition:all 0.15s;
}
.auth-tab.active {
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 50%,#4a0070 100%);
    color:#fff; text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.3);
}
.auth-body { width:100%; max-width:340px; margin:0 auto; }
.auth-fieldset {
    position:relative;
    background:linear-gradient(180deg,#fff 0%,#f7f7f7 100%);
    border:1px solid #000; border-radius:10px;
    padding:8px 0; margin-bottom:16px; overflow:hidden;
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
}
.auth-legend {
    display:block;
    background:linear-gradient(180deg,#f0f0f0 0%,#d0d0d0 100%);
    color:#3c3c43; padding:7px 14px;
    font-size:12px; font-weight:700;
    text-transform:uppercase; letter-spacing:0.5px;
    text-shadow:0 1px 0 rgba(255,255,255,0.7);
    border-bottom:1px solid #b0b0b0;
}
.xp-input {
    display:block; width:100%; padding:10px 14px;
    border:none; border-bottom:1px solid #d9d9d9;
    background:transparent; font-size:15px; font-family:inherit;
    color:#1a1a1a; outline:none;
}
.xp-input:last-of-type { border-bottom:none; }
.xp-input::placeholder { color:#8e8e93; }
.xp-button-large {
    display:flex; align-items:center; justify-content:center;
    width:100%; min-height:44px; padding:12px 20px;
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 50%,#4a0070 100%);
    border:1px solid #2c0044; border-radius:10px;
    color:#fff; font-size:16px; font-weight:700; font-family:inherit;
    text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3);
    cursor:pointer;
}
.xp-button-large:active { background:linear-gradient(180deg,#4a0070 0%,#2c0044 100%); }
.auth-error {
    display:none;
    background:linear-gradient(180deg,#8a1a1a 0%,#5a0a0a 100%);
    color:#fff; padding:10px 14px;
    border:1px solid #400; border-radius:8px;
    font-size:13px; font-weight:600; text-align:center;
    text-shadow:0 -1px 0 rgba(0,0,0,0.4); margin-bottom:12px;
}
.auth-error.show { display:block; }
.auth-footer {
    text-align:center; color:#b0b0b0; font-size:12px;
    margin-top:24px; text-shadow:0 -1px 0 rgba(0,0,0,0.6);
}
.auth-footer a { color:#cfb0e8; text-decoration:none; font-weight:700; }

/* ============ MAIN APP ============ */
#mobileApp {
    display:none; flex:1; flex-direction:column;
    background:#fff; min-height:0; overflow:hidden;
}
#mobileApp.active { display:flex; }

/* ============ NAV BAR ============ */
.nav-bar {
    height:44px;
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 50%,#4a0070 100%);
    border-bottom:1px solid #2c0044;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);
    display:flex; align-items:center; padding:0 8px;
    color:#fff; font-size:17px; font-weight:700;
    flex-shrink:0; position:relative; z-index:10;
}
.nav-title {
    flex:1; text-align:center;
    text-shadow:0 -1px 0 rgba(0,0,0,0.5);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    padding:0 8px;
}
.nav-btn {
    background:linear-gradient(180deg,#e8d8f4 0%,#c8a8e0 49%,#b088d0 50%,#9068b8 100%);
    border:1px solid #3a0055; border-radius:6px;
    color:#2c0044; font-family:inherit; font-size:12px; font-weight:700;
    padding:5px 10px; min-height:30px; min-width:44px;
    text-shadow:0 1px 0 rgba(255,255,255,0.6);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.7), 0 1px 1px rgba(0,0,0,0.3);
    cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
    visibility:visible;
}
.nav-btn:active {
    background:linear-gradient(180deg,#6C00A0 0%,#4a0070 100%);
    color:#fff; text-shadow:0 -1px 0 rgba(0,0,0,0.5);
}
.nav-btn.hidden { visibility:hidden; }

/* ============ PANES ============ */
.tab-content {
    display:none; flex:1; min-height:0; overflow:hidden;
    flex-direction:column;
}
.tab-content.active { display:flex; }

/* ============ CONTACT LIST ============ */
#contactsTab.active {
    background:#fff; overflow-y:auto;
    -webkit-overflow-scrolling:touch; display:block;
}
.messages-list { background:#fff; min-height:100%; }
.contact-row {
    display:flex; align-items:center;
    padding:9px 30px 9px 12px; min-height:62px;
    border-bottom:1px solid #d9d9d9;
    background:#fff; cursor:pointer; position:relative;
}
.contact-row:active { background:linear-gradient(180deg,#b088d0 0%,#9068b8 100%); }
.contact-row:active .contact-name,
.contact-row:active .contact-preview { color:#fff; }
.contact-row:active .contact-chev::after { border-color:#fff; }
.contact-main { flex:1; min-width:0; }
.contact-name {
    font-size:16px; font-weight:700; color:#000;
    margin-bottom:3px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.contact-preview {
    font-size:14px; color:#8e8e93;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    display:flex; align-items:center; gap:4px;
}
.status-dot {
    display:inline-block; width:8px; height:8px;
    border-radius:50%; flex-shrink:0;
    border:1px solid rgba(0,0,0,0.15);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);
}
.status-dot.online    { background:linear-gradient(180deg,#7ad86a 0%,#4aac3a 100%); }
.status-dot.busy      { background:linear-gradient(180deg,#e87878 0%,#d94a4a 100%); }
.status-dot.away      { background:linear-gradient(180deg,#f0b040 0%,#d97a20 100%); }
.status-dot.offline   { background:linear-gradient(180deg,#b0b0b0 0%,#808080 100%); }
.contact-chev {
    position:absolute; right:10px; top:50%;
    transform:translateY(-50%);
    width:10px; height:10px;
}
.contact-chev::after {
    content:''; display:block; width:8px; height:8px;
    border-top:2px solid #b088d0;
    border-right:2px solid #b088d0;
    transform:rotate(45deg); margin-top:-2px;
}

/* ============ CHAT ============ */
#chatTab.active { display:flex; }
.chat-header {
    display:flex; gap:8px; padding:8px 10px;
    background:linear-gradient(180deg,#f0f0f0 0%,#e0e0e0 100%);
    border-bottom:1px solid #c0c0c0; flex-shrink:0;
}
.chat-header.hidden { display:none; }
.seg-btn {
    flex:1; padding:9px 8px;
    background:linear-gradient(180deg,#fbfbfb 0%,#e8e8e8 45%,#d5d5d5 46%,#c0c0c0 100%);
    border:1px solid #7a7a7a; border-radius:6px;
    color:#3c3c43; font-size:14px; font-weight:700; font-family:inherit;
    text-shadow:0 1px 0 rgba(255,255,255,0.75);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 1px rgba(0,0,0,0.15);
    cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center;
    gap:4px;
}
.seg-btn:active { background:linear-gradient(180deg,#b8b8b8 0%,#a0a0a0 100%); }

.chat-messages {
    flex:1; overflow-y:auto; padding:12px 0; min-height:0;
    -webkit-overflow-scrolling:touch;
    background-color:#d6d8db;
    background-image:
        repeating-linear-gradient(135deg,
            rgba(255,255,255,0.35) 0px, rgba(255,255,255,0.35) 1px,
            transparent 1px, transparent 8px);
}

/* ============ EMPTY STATE ============ */
.empty-state {
    text-align:center; padding:60px 20px; color:#8e8e93;
}
.empty-icon { font-size:48px; margin-bottom:12px; opacity:0.7; }
.empty-title {
    font-size:16px; font-weight:700; color:#4c566c;
    text-shadow:0 1px 0 rgba(255,255,255,0.7); margin-bottom:4px;
}
.empty-text { font-size:13px; color:#8e8e93; }

/* ============ MESSAGES ============ */
.message {
    display:flex; margin:4px 12px;
    max-width:100%; clear:both;
}
.message-self { justify-content:flex-end; }
.message-other { justify-content:flex-start; }
.bubble-wrap {
    max-width:76%; display:flex; flex-direction:column;
    position:relative;
}
.message-self .bubble-wrap { align-items:flex-end; }
.message-other .bubble-wrap { align-items:flex-start; }
.message-sender {
    font-size:11px; color:#6a6a6f; font-weight:700;
    margin-bottom:3px; padding:0 12px;
    text-shadow:0 1px 0 rgba(255,255,255,0.8);
}
.bubble {
    padding:9px 14px; border-radius:16px;
    font-size:15px; line-height:1.3; position:relative;
    word-wrap:break-word;
    box-shadow:0 1px 1px rgba(0,0,0,0.12);
    max-width:100%;
}
.message-self .bubble {
    background:linear-gradient(180deg,#c8f0a8 0%,#8de060 45%,#5dc238 46%,#4aad2a 100%);
    border:1px solid #3a8a1a; color:#0a2000;
    border-bottom-right-radius:4px;
}
.message-self .bubble::after {
    content:''; position:absolute;
    bottom:-1px; right:-7px;
    width:10px; height:12px;
    background:#4aad2a; border-right:1px solid #3a8a1a;
    clip-path:polygon(0 0, 100% 100%, 0 100%);
}
.message-other .bubble {
    background:linear-gradient(180deg,#ffffff 0%,#f4f4f4 45%,#e6e6e6 46%,#d8d8d8 100%);
    border:1px solid #a8a8a8; color:#1a1a1a;
    border-bottom-left-radius:4px;
}
.message-other .bubble::after {
    content:''; position:absolute;
    bottom:-1px; left:-7px;
    width:10px; height:12px;
    background:#d8d8d8; border-left:1px solid #a8a8a8;
    clip-path:polygon(100% 0, 100% 100%, 0 100%);
}
.bubble-image { padding:4px !important; background:transparent !important;
    border:none !important; box-shadow:none !important; }
.bubble-image::after { display:none !important; }
.message-image {
    max-width:220px; max-height:220px; border-radius:12px;
    border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.3);
    cursor:pointer; display:block;
}
.message-time {
    font-size:10px; color:#8e8e93;
    text-shadow:0 1px 0 rgba(255,255,255,0.8);
    padding:2px 14px 0;
}

/* ============ INPUT BAR ============ */
.chat-input-container {
    background:linear-gradient(180deg,#d8d8d8 0%,#b0b0b0 100%);
    border-top:1px solid #7a7a7a;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.5);
    padding:7px 8px;
    padding-bottom:max(7px, env(safe-area-inset-bottom));
    display:flex; align-items:center; gap:6px; flex-shrink:0;
}
.chat-input-container.hidden { display:none; }
.camera-btn {
    flex-shrink:0; width:32px; height:32px; border-radius:50%;
    background:linear-gradient(180deg,#fff 0%,#d5d5d5 100%);
    border:1px solid #7a7a7a;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 1px rgba(0,0,0,0.2);
    color:#3c3c43; font-size:16px; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    font-family:inherit; padding:0;
}
.camera-btn:active { background:linear-gradient(180deg,#b8b8b8 0%,#a0a0a0 100%); }
.chat-input {
    flex:1; padding:8px 14px;
    border:1px solid #8a8a8a; border-radius:16px;
    background:linear-gradient(180deg,#fafafa 0%,#fff 100%);
    box-shadow:inset 0 1px 2px rgba(0,0,0,0.12);
    font-size:15px; font-family:inherit; outline:none;
    min-width:0; color:#1a1a1a;
}
.chat-input::placeholder { color:#8e8e93; }
.send-button {
    flex-shrink:0; height:32px; padding:0 16px; min-width:60px;
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 50%,#4a0070 100%);
    border:1px solid #2c0044; border-radius:16px;
    color:#fff; font-size:14px; font-weight:700; font-family:inherit;
    cursor:pointer; text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4), 0 1px 2px rgba(0,0,0,0.3);
    display:flex; align-items:center; justify-content:center;
}
.send-button:active { background:linear-gradient(180deg,#4a0070 0%,#2c0044 100%); }

/* ============ MODALS ============ */
.modal {
    display:none; position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.92); z-index:10000;
    align-items:center; justify-content:center;
}
.modal.active { display:flex; }
.modal-content {
    max-width:95%; max-height:95%; border-radius:8px;
    box-shadow:0 4px 30px rgba(0,0,0,0.8);
}
.modal-close {
    position:absolute; top:20px; right:20px;
    width:40px; height:40px; border-radius:50%;
    background:rgba(0,0,0,0.5); border:1px solid rgba(255,255,255,0.4);
    color:#fff; font-size:26px; cursor:pointer;
    display:flex; align-items:center; justify-content:center; line-height:1;
}
.toast {
    position:fixed; top:60px; left:50%; transform:translateX(-50%);
    background:linear-gradient(180deg,#555 0%,#1a1a1a 100%);
    color:#fff; padding:10px 20px; border-radius:20px;
    font-size:13px; font-weight:600; z-index:11000; display:none;
    box-shadow:0 2px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2);
    text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    max-width:90%; text-align:center;
    border:1px solid rgba(255,255,255,0.2);
}
.toast.show { display:block; }
.toast.error { background:linear-gradient(180deg,#8a1a1a 0%,#5a0a0a 100%); }

/* ============ ACTION SHEET ============ */
.status-sheet-overlay {
    display:none; position:fixed; top:0; left:0; right:0; bottom:0;
    background:rgba(0,0,0,0.5); z-index:10100;
    align-items:flex-end; justify-content:center;
}
.status-sheet-overlay.active { display:flex; }
.status-sheet {
    width:100%; max-width:500px; padding:8px;
    padding-bottom:max(8px, env(safe-area-inset-bottom));
    animation:slideUp 0.2s ease;
}
@keyframes slideUp { from { transform:translateY(100%); } to { transform:translateY(0); } }
.status-sheet-title {
    background:linear-gradient(180deg,#f0f0f0 0%,#d0d0d0 100%);
    color:#3c3c43; font-weight:700; font-size:13px; text-align:center;
    padding:10px;
    border:1px solid #5a5a5a; border-bottom:none;
    border-top-left-radius:10px; border-top-right-radius:10px;
    text-shadow:0 1px 0 rgba(255,255,255,0.7);
}
.status-sheet-body {
    background:linear-gradient(180deg,#f0f0f0 0%,#d0d0d0 100%);
    border:1px solid #5a5a5a; border-top:none;
    border-bottom-left-radius:10px; border-bottom-right-radius:10px;
    overflow:hidden; margin-bottom:8px;
}
.status-sheet-option {
    display:flex; align-items:center; gap:12px;
    width:100%; padding:12px 16px;
    background:linear-gradient(180deg,#fbfbfb 0%,#e8e8e8 100%);
    border:none; border-bottom:1px solid #b0b0b0;
    font-size:16px; font-weight:600; color:#2c2c2c;
    text-shadow:0 1px 0 rgba(255,255,255,0.7);
    cursor:pointer; font-family:inherit; text-align:left;
}
.status-sheet-option:last-child { border-bottom:none; }
.status-sheet-option:active {
    background:linear-gradient(180deg,#8040b0 0%,#6C00A0 100%);
    color:#fff; text-shadow:0 -1px 0 rgba(0,0,0,0.4);
}
.status-sheet-option .dot {
    width:12px; height:12px; border-radius:50%; flex-shrink:0;
    border:1px solid rgba(0,0,0,0.2);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);
}
.status-sheet-option .dot.online    { background:linear-gradient(180deg,#7ad86a 0%,#4aac3a 100%); }
.status-sheet-option .dot.busy      { background:linear-gradient(180deg,#e87878 0%,#d94a4a 100%); }
.status-sheet-option .dot.away      { background:linear-gradient(180deg,#f0b040 0%,#d97a20 100%); }
.status-sheet-option .dot.invisible,
.status-sheet-option .dot.offline   { background:linear-gradient(180deg,#b0b0b0 0%,#808080 100%); }
.status-sheet-option .check { margin-left:auto; opacity:0; font-weight:700; }
.status-sheet-option.current .check { opacity:1; }
.status-sheet-cancel {
    background:linear-gradient(180deg,#555 0%,#2a2a2a 100%);
    color:#fff; text-shadow:0 -1px 0 rgba(0,0,0,0.5);
    font-weight:700; font-size:16px; text-align:center;
    padding:12px; border:1px solid #111; border-radius:10px; cursor:pointer;
}

/* ============ CALLS ============ */
.xp-window-overlay {
    position:fixed; top:0; left:0; right:0; bottom:0;
    z-index:10500; display:none;
    align-items:center; justify-content:center; padding:16px;
    background:rgba(0,0,0,0.65);
}
.xp-window-overlay.active { display:flex; }
.call-window {
    width:100%; max-width:340px;
    background:linear-gradient(180deg,#f0f0f0 0%,#d8d8d8 100%);
    border:1px solid #000; border-radius:12px;
    box-shadow:0 4px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.6);
    overflow:hidden;
}
.call-window .xp-titlebar {
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 50%,#4a0070 100%);
    color:#fff; padding:8px 12px;
    font-weight:700; font-size:14px; text-align:center;
    text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    border-bottom:1px solid #2c0044; min-height:34px;
    display:flex; align-items:center; justify-content:space-between;
}
.call-window .xp-titlebar .xp-button {
    min-width:32px; min-height:24px; padding:2px 8px; font-size:14px;
    background:linear-gradient(180deg,#e8d8f4 0%,#c8a8e0 50%,#a880c8 100%);
    border:1px solid #3a0055; border-radius:6px;
    color:#2c0044; cursor:pointer; font-weight:700;
}
.call-body { padding:20px 16px; text-align:center; }
.call-body .call-icon { font-size:54px; margin:8px 0 16px;
    filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3)); }
.call-body .call-name { font-size:20px; font-weight:700;
    color:#1a1a1a; text-shadow:0 1px 0 rgba(255,255,255,0.8);
    margin-bottom:4px; }
.call-body .call-sub { font-size:14px; color:#666;
    text-shadow:0 1px 0 rgba(255,255,255,0.8); margin-bottom:12px; }
.call-body .call-timer {
    font-size:30px; font-weight:300; color:#2c2c2c;
    font-family:'Courier New',monospace; letter-spacing:3px;
    margin:12px 0; text-shadow:0 1px 0 rgba(255,255,255,0.8);
}
.call-body .call-status-line {
    font-size:14px; font-weight:700; color:#6C00A0;
    text-shadow:0 1px 0 rgba(255,255,255,0.8); margin-bottom:6px;
}
.call-actions {
    display:flex; gap:12px; justify-content:center; margin-top:16px;
}
.call-actions .xp-button-large {
    flex:1; min-width:0; padding:12px 8px;
    font-size:15px; border-radius:10px;
    border:1px solid #2c0044; font-weight:700;
    cursor:pointer; color:#fff; text-shadow:0 -1px 0 rgba(0,0,0,0.4);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3);
}
.btn-answer {
    background:linear-gradient(180deg,#7ad86a 0%,#4aac3a 45%,#2a8c1a 46%,#1a6a0a 100%) !important;
    border-color:#0a4a00 !important;
}
.btn-decline, .btn-end {
    background:linear-gradient(180deg,#e87878 0%,#d94a4a 45%,#a82a2a 46%,#8a1a1a 100%) !important;
    border-color:#5a0a0a !important;
}
.btn-end { width:100%; margin-top:12px; }
.audio-controls-mobile {
    display:flex; gap:8px; justify-content:center; margin:12px 0;
}
.audio-controls-mobile button {
    flex:1; padding:10px 6px; font-size:13px; font-weight:700;
    background:linear-gradient(180deg,#fbfbfb 0%,#e8e8e8 45%,#d5d5d5 46%,#c0c0c0 100%);
    border:1px solid #7a7a7a; border-radius:8px;
    color:#3c3c43; font-family:inherit; cursor:pointer;
}
.call-error-mobile {
    display:none;
    background:linear-gradient(180deg,#8a1a1a 0%,#5a0a0a 100%);
    color:#fff; border:1px solid #400;
    padding:8px 12px; font-size:12px; font-weight:600;
    border-radius:8px; text-align:center; margin:8px 0;
}
.call-error-mobile.show { display:block; }
.call-hidden-video {
    position:absolute; width:1px; height:1px;
    overflow:hidden; opacity:0; pointer-events:none;
}

/* ============ FILE TRANSFER ============ */
.ft-progress-bar {
    height:14px;
    background:linear-gradient(180deg,#c8c8c8 0%,#a0a0a0 100%);
    border:1px solid #7a7a7a; border-radius:7px;
    box-shadow:inset 0 1px 2px rgba(0,0,0,0.25);
    overflow:hidden; margin:12px 0;
}
.ft-progress-fill {
    height:100%;
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 100%);
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.4);
    width:0%; transition:width 0.15s linear; border-radius:6px;
}
.ft-filename-mobile {
    font-weight:700; font-size:14px; color:#1a1a1a;
    word-break:break-all; margin:6px 0;
}
.ft-filesize-mobile {
    font-size:12px; color:#666; margin-bottom:8px;
}
.ft-stats-mobile {
    display:flex; justify-content:space-between;
    font-size:12px; color:#666; margin-top:6px;
}
.ft-status-mobile {
    text-align:center; font-size:14px; font-weight:600;
    color:#2c2c2c; margin:8px 0;
}
.ft-icon-mobile {
    font-size:54px; text-align:center; margin:8px 0 16px;
    filter:drop-shadow(0 3px 4px rgba(0,0,0,0.3));
}
.ft-chat-bar {
    display:flex; align-items:center; gap:8px;
    padding:6px 10px; margin:6px 10px;
    background:linear-gradient(180deg,#f0f0f0 0%,#d8d8d8 100%);
    border:1px solid #a8a8a8; border-radius:8px;
    box-shadow:inset 0 1px 0 rgba(255,255,255,0.6), 0 1px 1px rgba(0,0,0,0.1);
    font-size:12px; color:#2c2c2c;
    clear:both; width:calc(100% - 20px); box-sizing:border-box;
    float:none; max-width:100%;
}
.ft-chat-bar .ft-bar-icon { font-size:16px; flex-shrink:0; }
.ft-chat-bar .ft-bar-text { flex:1; min-width:0; }
.ft-chat-bar .ft-bar-text strong {
    display:block; font-weight:700; font-size:12px;
    margin-bottom:2px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.ft-chat-bar .ft-bar-text small {
    color:#666; font-size:11px; display:block;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.ft-chat-bar .ft-bar-progress {
    width:100%; height:6px; background:rgba(0,0,0,0.15);
    border:1px solid #a8a8a8; border-radius:3px;
    margin-top:4px; overflow:hidden;
}
.ft-chat-bar .ft-bar-progress-fill {
    height:100%;
    background:linear-gradient(180deg,#b088d0 0%,#8040b0 49%,#6C00A0 100%);
    width:0%; transition:width 0.2s linear;
}
.ft-chat-bar.success { border-color:#2a8c1a; }
.ft-chat-bar.success .ft-bar-progress-fill { background:linear-gradient(180deg,#7ad86a 0%,#2a8c1a 100%); }
.ft-chat-bar.error { border-color:#a82a2a; }
.ft-chat-bar.error .ft-bar-progress-fill { background:linear-gradient(180deg,#e87878 0%,#a82a2a 100%); }
.ft-chat-bar.cancelled { border-color:#808080; }
.ft-chat-bar .ft-bar-close {
    flex-shrink:0; width:20px; height:20px; border-radius:50%;
    background:linear-gradient(180deg,#d0d0d0 0%,#a0a0a0 100%);
    border:1px solid #7a7a7a; color:#3c3c43;
    font-size:12px; font-weight:700;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; padding:0; font-family:inherit; line-height:1;
}
.hidden { display:none !important; }
</style>
</head>
<body>

<div class="status-bar">
    <span class="sb-side sb-left">
        <span class="sb-dots"><span></span><span></span><span></span></span>
    </span>
    <span class="sb-center" id="sbTime">12:34 PM</span>
    <span class="sb-side sb-right">
        <span class="sb-battery"></span>
    </span>
</div>

<div id="authOverlay" class="active">
    <div class="auth-window">
        <div class="auth-tabs">
            <div class="auth-tab active" id="loginTabBtn" onclick="showAuthTab('login')">Sign In</div>
            <div class="auth-tab" id="registerTabBtn" onclick="showAuthTab('register')">Create</div>
        </div>
        <div class="auth-body">
            <div id="authErrorMessage" class="auth-error"></div>
            <div id="loginTabContent">
                <div class="auth-fieldset">
                    <div class="auth-legend">Account</div>
                    <input type="text" id="mobileUsername" class="xp-input" placeholder="Username" value="test" autocomplete="off">
                    <input type="password" id="mobilePassword" class="xp-input" placeholder="Password" value="test" autocomplete="off">
                </div>
                <button class="xp-button-large" id="mobileLoginBtn">Sign In</button>
            </div>
            <div id="registerTabContent" class="hidden">
                <div class="auth-fieldset">
                    <div class="auth-legend">New Account</div>
                    <input type="text" id="regUsername" class="xp-input" placeholder="Username" autocomplete="off">
                    <input type="password" id="regPassword" class="xp-input" placeholder="Password" autocomplete="off">
                    <input type="email" id="regEmail" class="xp-input" placeholder="Email" autocomplete="off">
                    <input type="text" id="regDisplayName" class="xp-input" placeholder="Display Name" autocomplete="off">
                </div>
                <button class="xp-button-large" id="mobileRegisterBtn">Create Account</button>
            </div>
        </div>
        <div class="auth-footer">
            <a href="/?desktop=true">Desktop Version</a> &bull; Demo: test/test
        </div>
    </div>
</div>

<div id="mobileApp">
    <div class="nav-bar">
        <button class="nav-btn hidden" id="navBackBtn" onclick="leaveChat()">Messages</button>
        <span class="nav-title" id="navTitle">Messages</span>
        <button class="nav-btn" id="navActionBtn" onclick="navAction()">✎</button>
    </div>
    
    <div id="contactsTab" class="tab-content active">
        <div class="messages-list" id="mobileContactList">
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">No Messages</div>
                <div class="empty-text">Tap ✎ to start</div>
            </div>
        </div>
    </div>
    
    <div id="chatTab" class="tab-content">
        <div id="chatHeader" class="chat-header hidden">
            <button class="seg-btn" onclick="startMobileCall()">📞 Call</button>
            <button class="seg-btn" onclick="selectMobileFile()">📎 Send File</button>
        </div>
        <div class="chat-messages" id="mobileMessages"></div>
        <div class="chat-input-container hidden" id="chatInputContainer">
            <button class="camera-btn" onclick="selectImage()" title="Send Image">📷</button>
            <input type="text" id="mobileMessageInput" class="chat-input" placeholder="Text Message" onkeypress="if(event.key === 'Enter') sendMobileMessage()">
            <button class="send-button" onclick="sendMobileMessage()">Send</button>
        </div>
    </div>
</div>

<input type="file" id="imageInput" accept="image/*" style="display:none;">
<input type="file" id="mobileFileInput" style="display:none;">

<div id="imageModal" class="modal" onclick="closeModal()">
    <span class="modal-close">&times;</span>
    <img class="modal-content" id="modalImage">
</div>

<div id="toast" class="toast"></div>

<div id="statusSheetOverlay" class="status-sheet-overlay" onclick="if (event.target === this) closeStatusSheet()">
    <div class="status-sheet" onclick="event.stopPropagation()">
        <div class="status-sheet-title">Change your status</div>
        <div class="status-sheet-body">
            <button class="status-sheet-option" data-status="online" onclick="setStatus('online')">
                <span class="dot online"></span><span>Online</span><span class="check">✓</span>
            </button>
            <button class="status-sheet-option" data-status="busy" onclick="setStatus('busy')">
                <span class="dot busy"></span><span>Busy</span><span class="check">✓</span>
            </button>
            <button class="status-sheet-option" data-status="away" onclick="setStatus('away')">
                <span class="dot away"></span><span>Away</span><span class="check">✓</span>
            </button>
            <button class="status-sheet-option" data-status="invisible" onclick="setStatus('invisible')">
                <span class="dot invisible"></span><span>Invisible</span><span class="check">✓</span>
            </button>
            <button class="status-sheet-option" data-status="offline" onclick="setStatus('offline')">
                <span class="dot offline"></span><span>Appear Offline</span><span class="check">✓</span>
            </button>
        </div>
        <div class="status-sheet-cancel" onclick="closeStatusSheet()">Cancel</div>
    </div>
</div>

<div id="mobileIncomingCallOverlay" class="xp-window-overlay">
    <div class="call-window">
        <div class="xp-titlebar">
            <span>Incoming Call</span>
            <button class="xp-button" onclick="declineIncomingCall()">×</button>
        </div>
        <div class="call-body">
            <div class="call-icon">📞</div>
            <div class="call-name" id="mobileCallerName">User</div>
            <div class="call-sub">is calling you</div>
            <div class="call-actions">
                <button class="xp-button-large btn-decline" onclick="declineIncomingCall()">Decline</button>
                <button class="xp-button-large btn-answer" onclick="acceptIncomingCall()">Accept</button>
            </div>
        </div>
    </div>
</div>

<div id="mobileCallOverlay" class="xp-window-overlay">
    <div class="call-window">
        <div class="xp-titlebar">
            <span>Call</span>
            <button class="xp-button" onclick="endMobileCall()">×</button>
        </div>
        <div class="call-body">
            <div class="call-status-line" id="mobileCallStatusLine">Calling</div>
            <div class="call-name" id="mobileCallTargetName">User</div>
            <div class="call-timer" id="mobileCallTimer">00:00</div>
            <div class="call-error-mobile" id="mobileCallError"></div>
            <div class="audio-controls-mobile" id="mobileAudioControls" style="display:none;">
                <button id="mobileMuteBtn" onclick="toggleMute()">Mute</button>
                <button id="mobileDeafenBtn" onclick="toggleDeafen()">Deafen</button>
            </div>
            <button class="xp-button-large btn-end" onclick="endMobileCall()">End Call</button>
            <video id="mobileLocalVideo" autoplay muted playsinline class="call-hidden-video"></video>
            <audio id="mobileRemoteAudio" autoplay></audio>
        </div>
    </div>
</div>

<div id="mobileFtOfferOverlay" class="xp-window-overlay">
    <div class="call-window">
        <div class="xp-titlebar">
            <span>Incoming File</span>
            <button class="xp-button" onclick="declineIncomingTransfer()">×</button>
        </div>
        <div class="call-body">
            <div class="ft-icon-mobile">📄</div>
            <div class="ft-status-mobile" id="mobileFtOfferFrom">Someone wants to send you a file</div>
            <div class="ft-filename-mobile" id="mobileFtOfferFilename">file.bin</div>
            <div class="ft-filesize-mobile" id="mobileFtOfferFilesize">0 B</div>
            <div class="call-actions">
                <button class="xp-button-large btn-decline" onclick="declineIncomingTransfer()">Decline</button>
                <button class="xp-button-large btn-answer" onclick="acceptIncomingTransfer()">Accept</button>
            </div>
        </div>
    </div>
</div>

<div id="mobileFtProgressOverlay" class="xp-window-overlay">
    <div class="call-window">
        <div class="xp-titlebar">
            <span id="mobileFtTitle">File Transfer</span>
            <button class="xp-button" onclick="cancelCurrentFt()">×</button>
        </div>
        <div class="call-body">
            <div class="ft-filename-mobile" id="mobileFtFilename">file.bin</div>
            <div class="ft-filesize-mobile" id="mobileFtPeer">0 B</div>
            <div class="ft-progress-bar">
                <div class="ft-progress-fill" id="mobileFtFill"></div>
            </div>
            <div class="ft-status-mobile" id="mobileFtStatus">Waiting...</div>
            <div class="ft-stats-mobile">
                <span id="mobileFtSpeed">0 B/s</span>
                <span id="mobileFtEta">ETA: --:--</span>
            </div>
            <button class="xp-button-large btn-end" onclick="cancelCurrentFt()" style="margin-top:12px;">Cancel</button>
        </div>
    </div>
</div>

<audio id="mLoginSound" preload="auto"><source src="/sounds/logon.mp3" type="audio/mpeg"></audio>
<audio id="mLogoutSound" preload="auto"><source src="/sounds/logoff.mp3" type="audio/mpeg"></audio>
<audio id="mMessageSound" preload="auto"><source src="/sounds/messagereceived.mp3" type="audio/mpeg"></audio>
<audio id="mSendSound" preload="auto"><source src="/sounds/messagesent.mp3" type="audio/mpeg"></audio>
<audio id="mCallSound" preload="auto" loop><source src="/sounds/call_incoming.mp3" type="audio/mpeg"></audio>
<audio id="mDialingSound" preload="auto" loop><source src="/sounds/dialing.mp3" type="audio/mpeg"></audio>
<audio id="mCallEndSound" preload="auto"><source src="/sounds/call_end.mp3" type="audio/mpeg"></audio>
<audio id="mCallAcceptSound" preload="auto"><source src="/sounds/call_accept.mp3" type="audio/mpeg"></audio>
<audio id="mCallErrorSound" preload="auto"><source src="/sounds/call_error.mp3" type="audio/mpeg"></audio>
<audio id="mFtStartSound" preload="auto"><source src="/sounds/ft-start.mp3" type="audio/mpeg"></audio>
<audio id="mFtSuccessSound" preload="auto"><source src="/sounds/ft-success.mp3" type="audio/mpeg"></audio>
<audio id="mFtFailSound" preload="auto"><source src="/sounds/ft-fail.mp3" type="audio/mpeg"></audio>

<script>
let mobileUser = null;
let mobileWs = null;
let currentChat = null;
let currentChatDisplayName = null;
let currentView = 'list';
let contacts = [];
let reconnectAttempts = 0;
const MAX_RECONNECT = 5;
let connectionInProgress = false;
let renderedMessageIds = new Set();
let myStatus = 'online';

let isInCall = false;
let currentCallWith = null;
let incomingCallFrom = null;
let mobileCallStartTime = null;
let mobileCallTimerInterval = null;
let mobileLocalStream = null;
let mobilePeerConnection = null;
let mobileMuted = false;
let mobileDeafened = false;
let mobileMicGranted = false;
let mobilePendingIce = [];

const FT_CHUNK_SIZE = 16 * 1024;
const FT_BUFFER_THRESHOLD = 1024 * 1024;
const mFtTransfers = new Map();
let mFtIncomingOffer = null;
let mFtActiveId = null;

const STATUS_LABELS = {
    online: 'Online',
    busy: 'Busy',
    away: 'Away',
    invisible: 'Invisible',
    offline: 'Appear Offline'
};

function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
        return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
    });
}

function mPlaySound(id, loop) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
        el.loop = !!loop;
        el.currentTime = 0;
        el.play().catch(function(e) { console.log('Audio play failed:', e); });
    } catch (e) {}
}
function mStopSound(id) {
    const el = document.getElementById(id);
    if (!el) return;
    try { el.pause(); el.currentTime = 0; el.loop = false; } catch (e) {}
}
function playMobileLoginSound()      { mPlaySound('mLoginSound'); }
function playMobileLogoutSound()     { mPlaySound('mLogoutSound'); }
function playMobileMessageSound()    { mPlaySound('mMessageSound'); }
function playMobileSendSound()       { mPlaySound('mSendSound'); }
function playMobileCallSound()       { mPlaySound('mCallSound', true); }
function playMobileDialingSound()    { mPlaySound('mDialingSound', true); }
function playMobileCallEndSound()    { mPlaySound('mCallEndSound'); mStopSound('mCallSound'); mStopSound('mDialingSound'); }
function playMobileCallAcceptSound() { mPlaySound('mCallAcceptSound'); }
function playMobileCallErrorSound()  { mPlaySound('mCallErrorSound'); }
function stopMobileCallSounds()      { mStopSound('mCallSound'); mStopSound('mDialingSound'); }
function playMobileFtStartSound()    { mPlaySound('mFtStartSound'); }
function playMobileFtSuccessSound()  { mPlaySound('mFtSuccessSound'); }
function playMobileFtFailSound()     { mPlaySound('mFtFailSound'); }

function updateSelfStatusUI() {
    const dot = document.getElementById('mobileSelfStatusDot');
    if (!dot) return;
    dot.className = 'mobile-self-status-dot ' + myStatus;
}

function updateStatusBarTime() {
    const now = new Date();
    let h = now.getHours();
    const m = now.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    const el = document.getElementById('sbTime');
    if (el) el.textContent = h + ':' + m + ' ' + ampm;
}
setInterval(updateStatusBarTime, 30000);

function setView(view) {
    currentView = view;
    document.querySelectorAll('.tab-content').forEach(function(c) {
        c.classList.remove('active');
    });
    const backBtn = document.getElementById('navBackBtn');
    const titleEl = document.getElementById('navTitle');
    const actionBtn = document.getElementById('navActionBtn');
    const chatHeader = document.getElementById('chatHeader');
    const inputBar = document.getElementById('chatInputContainer');
    
    if (view === 'chat') {
        document.getElementById('chatTab').classList.add('active');
        backBtn.classList.remove('hidden');
        titleEl.textContent = currentChatDisplayName || 'Chat';
        actionBtn.style.visibility = 'hidden';
        if (chatHeader) chatHeader.classList.remove('hidden');
        if (inputBar) inputBar.classList.remove('hidden');
    } else {
        document.getElementById('contactsTab').classList.add('active');
        backBtn.classList.add('hidden');
        titleEl.textContent = 'Messages';
        actionBtn.style.visibility = 'visible';
        if (chatHeader) chatHeader.classList.add('hidden');
        if (inputBar) inputBar.classList.add('hidden');
    }
}

function switchTab(name) {
    setView(name === 'chat' ? 'chat' : 'list');
}

function navAction() {
    if (currentView === 'list') {
        addContact();
    }
}

function openStatusSheet() {
    const sheet = document.getElementById('statusSheetOverlay');
    if (!sheet) return;
    document.querySelectorAll('.status-sheet-option').forEach(function(opt) {
        if (opt.getAttribute('data-status') === myStatus) opt.classList.add('current');
        else opt.classList.remove('current');
    });
    sheet.classList.add('active');
}
function closeStatusSheet() {
    const sheet = document.getElementById('statusSheetOverlay');
    if (sheet) sheet.classList.remove('active');
}

function setStatus(status) {
    if (!STATUS_LABELS[status]) return;
    myStatus = status;
    updateSelfStatusUI();
    closeStatusSheet();
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({ type: 'status_change', status: status }));
    }
    showToast('Status: ' + STATUS_LABELS[status]);
}

function showAuthTab(tab) {
    const loginBtn = document.getElementById('loginTabBtn');
    const registerBtn = document.getElementById('registerTabBtn');
    const loginContent = document.getElementById('loginTabContent');
    const registerContent = document.getElementById('registerTabContent');
    const err = document.getElementById('authErrorMessage');
    err.classList.remove('show');
    if (tab === 'login') {
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
        loginContent.classList.remove('hidden');
        registerContent.classList.add('hidden');
    } else {
        registerBtn.classList.add('active');
        loginBtn.classList.remove('active');
        registerContent.classList.remove('hidden');
        loginContent.classList.add('hidden');
    }
}

function showToast(message, isError) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.toggle('error', !!isError);
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(function() {
        toast.classList.remove('show');
    }, 3000);
}

async function mobileLogin() {
    const username = document.getElementById('mobileUsername').value.trim();
    const password = document.getElementById('mobilePassword').value.trim();
    const errorDiv = document.getElementById('authErrorMessage');
    errorDiv.classList.remove('show');
    if (!username || !password) {
        errorDiv.textContent = 'Please enter username and password';
        errorDiv.classList.add('show');
        return;
    }
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password })
        });
        const result = await res.json();
        if (result.success) {
            mobileUser = { username: username, displayName: result.displayName || username };
            myStatus = 'online';
            document.getElementById('authOverlay').classList.remove('active');
            document.getElementById('mobileApp').classList.add('active');
            connectionInProgress = false;
            playMobileLoginSound();
            setView('list');
            connectWebSocket();
        } else {
            errorDiv.textContent = result.error || 'Invalid username or password';
            errorDiv.classList.add('show');
        }
    } catch (e) {
        console.error('Login error:', e);
        errorDiv.textContent = 'Login failed. Check server connection.';
        errorDiv.classList.add('show');
    }
}

async function mobileRegister() {
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const email = document.getElementById('regEmail').value.trim();
    const displayName = document.getElementById('regDisplayName').value.trim() || username;
    const errorDiv = document.getElementById('authErrorMessage');
    errorDiv.classList.remove('show');
    if (!username || !password) {
        errorDiv.textContent = 'Please enter username and password';
        errorDiv.classList.add('show');
        return;
    }
    try {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: username, password: password, displayName: displayName, email: email })
        });
        const result = await res.json();
        if (result.success) {
            showToast('Account created! Please sign in.');
            document.getElementById('mobileUsername').value = username;
            document.getElementById('mobilePassword').value = '';
            document.getElementById('regUsername').value = '';
            document.getElementById('regPassword').value = '';
            document.getElementById('regEmail').value = '';
            document.getElementById('regDisplayName').value = '';
            showAuthTab('login');
        } else {
            errorDiv.textContent = result.error || 'Registration failed';
            errorDiv.classList.add('show');
        }
    } catch (e) {
        console.error('Register error:', e);
        errorDiv.textContent = 'Registration failed. Check server connection.';
        errorDiv.classList.add('show');
    }
}

function connectWebSocket() {
    if (connectionInProgress) return;
    connectionInProgress = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = protocol + '//' + window.location.host;
    try {
        mobileWs = new WebSocket(wsUrl);
        mobileWs.onopen = function() {
            connectionInProgress = false;
            reconnectAttempts = 0;
            showToast('Connected');
            mobileWs.send(JSON.stringify({
                type: 'join',
                username: mobileUser.username,
                userId: Date.now(),
                displayName: mobileUser.displayName,
                status: myStatus
            }));
            setTimeout(function() {
                if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                    mobileWs.send(JSON.stringify({ type: 'get_contacts', username: mobileUser.username }));
                }
            }, 500);
        };
        mobileWs.onmessage = function(event) {
            try { handleMessage(JSON.parse(event.data)); }
            catch (e) { console.error('Error parsing message:', e); }
        };
        mobileWs.onerror = function() {
            connectionInProgress = false;
            showToast('Connection error', true);
        };
        mobileWs.onclose = function() {
            connectionInProgress = false;
            if (mobileUser) {
                if (reconnectAttempts < MAX_RECONNECT) {
                    reconnectAttempts++;
                    showToast('Reconnecting... (' + reconnectAttempts + '/' + MAX_RECONNECT + ')');
                    setTimeout(connectWebSocket, 3000);
                } else {
                    showToast('Connection lost. Please refresh.', true);
                }
            }
        };
    } catch (e) {
        connectionInProgress = false;
        showToast('Failed to connect', true);
    }
}

function handleMessage(data) {
    switch (data.type) {
        case 'contact_list':
            if (data.contacts) { contacts = data.contacts; renderContacts(); }
            break;
        case 'contact_add_result':
            if (data.success) {
                showToast('Contact added');
                if (mobileWs && mobileWs.readyState === WebSocket.OPEN)
                    mobileWs.send(JSON.stringify({ type: 'get_contacts', username: mobileUser.username }));
            } else {
                showToast(data.message || 'Failed to add contact', true);
            }
            break;
        case 'contact_added':
            if (data.contact) {
                showToast((data.contact.displayName || 'Someone') + ' added you');
                if (mobileWs && mobileWs.readyState === WebSocket.OPEN)
                    mobileWs.send(JSON.stringify({ type: 'get_contacts', username: mobileUser.username }));
            }
            break;
        case 'new_message':
            if (data.data) {
                if (data.data.from !== mobileUser.username) playMobileMessageSound();
                if (data.data.from === currentChat || data.data.to === currentChat) {
                    displayMessage(data.data, data.data.from === mobileUser.username);
                } else {
                    showToast('New message from ' + (data.data.fromDisplay || data.data.from));
                }
            }
            break;
        case 'image_receive':
            playMobileMessageSound();
            if (data.from === currentChat || data.to === currentChat) displayImage(data);
            else showToast('Image from ' + (data.fromDisplay || data.from));
            break;
        case 'chat_history':
            if (data.messages && data.chatId === currentChat) {
                document.getElementById('mobileMessages').innerHTML = '';
                renderedMessageIds.clear();
                data.messages.forEach(function(msg) {
                    if (msg.imageData) displayImage(msg, msg.from === mobileUser.username);
                    else displayMessage(msg, msg.from === mobileUser.username);
                });
                reattachMobileFtBars(data.chatId);
            }
            break;
        case 'user_join':
        case 'user_leave':
            if (data.users) updateContactStatuses(data.users);
            break;
        case 'call_request':
            if (isInCall) {
                if (mobileWs && mobileWs.readyState === WebSocket.OPEN)
                    mobileWs.send(JSON.stringify({ type: 'call_declined', from: mobileUser.username, to: data.from }));
                return;
            }
            incomingCallFrom = data.from;
            document.getElementById('mobileCallerName').textContent = data.fromDisplay || data.from;
            document.getElementById('mobileIncomingCallOverlay').classList.add('active');
            playMobileCallSound();
            window.currentCallId = data.callId || 'call_' + Date.now();
            break;
        case 'call_accepted':
            stopMobileCallSounds();
            playMobileCallAcceptSound();
            if (data.callId) window.currentCallId = data.callId;
            document.getElementById('mobileCallTargetName').textContent = data.fromDisplay || data.from;
            document.getElementById('mobileCallStatusLine').textContent = 'In call with';
            document.getElementById('mobileCallOverlay').classList.add('active');
            startMobileCallTimer();
            isInCall = true;
            currentCallWith = data.from;
            setupMobileWebRTC(true);
            break;
        case 'call_declined':
            stopMobileCallSounds();
            playMobileCallEndSound();
            document.getElementById('mobileCallOverlay').classList.remove('active');
            document.getElementById('mobileIncomingCallOverlay').classList.remove('active');
            showToast((data.fromDisplay || data.from) + ' declined', true);
            isInCall = false;
            currentCallWith = null;
            cleanupMobileWebRTC();
            break;
        case 'call_end':
            if (isInCall || incomingCallFrom) {
                stopMobileCallSounds();
                playMobileCallEndSound();
                document.getElementById('mobileCallOverlay').classList.remove('active');
                document.getElementById('mobileIncomingCallOverlay').classList.remove('active');
                if (mobileCallTimerInterval) { clearInterval(mobileCallTimerInterval); mobileCallTimerInterval = null; }
                isInCall = false;
                currentCallWith = null;
                incomingCallFrom = null;
                mobileCallStartTime = null;
                cleanupMobileWebRTC();
                showToast('Call ended');
            }
            break;
        case 'webrtc_offer':    handleMobileWebRTCOffer(data.offer, data.from); break;
        case 'webrtc_answer':   handleMobileWebRTCAnswer(data.answer); break;
        case 'ice_candidate':   handleMobileICECandidate(data.candidate); break;
        case 'ft_offer':        handleMobileFtOffer(data); break;
        case 'ft_accept':       handleMobileFtAccept(data); break;
        case 'ft_decline':      handleMobileFtDecline(data); break;
        case 'ft_cancel':       handleMobileFtCancel(data); break;
        case 'ft_signal':       handleMobileFtSignal(data); break;
    }
}

function updateContactStatuses(onlineUsers) {
    contacts.forEach(function(contact) {
        const online = onlineUsers.find(function(u) { return u.username === contact.username; });
        contact.status = online ? (online.status || 'online') : 'offline';
    });
    renderContacts();
}

function renderContacts() {
    const list = document.getElementById('mobileContactList');
    if (!contacts.length) {
        list.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-icon">💬</div>' +
                '<div class="empty-title">No Messages</div>' +
                '<div class="empty-text">Tap ✎ to start</div>' +
            '</div>';
        return;
    }
    list.innerHTML = contacts.map(function(contact) {
        const st = contact.status || 'offline';
        const stLabel = st.charAt(0).toUpperCase() + st.slice(1);
        const name = escHtml(contact.displayName || contact.username);
        const user = escHtml(contact.username);
        return '<div class="contact-row" data-user="' + user + '" data-display="' + name + '">' +
            '<div class="contact-main">' +
                '<div class="contact-name">' + name + '</div>' +
                '<div class="contact-preview">' +
                    '<span class="status-dot ' + st + '"></span>' +
                    '<span>' + stLabel + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="contact-chev"></div>' +
        '</div>';
    }).join('');
}

function searchContacts() {
    const term = (document.getElementById('contactSearch') || {}).value;
    if (!term) return;
    const lower = term.toLowerCase();
    document.querySelectorAll('.contact-row').forEach(function(row) {
        const name = (row.querySelector('.contact-name') || {}).textContent || '';
        row.style.display = name.toLowerCase().indexOf(lower) !== -1 ? 'flex' : 'none';
    });
}

function addContact() {
    if (!mobileUser) { showToast('Please login first', true); return; }
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { showToast('Connecting...', true); connectWebSocket(); return; }
    const username = prompt('Enter username to add:');
    if (!username || !username.trim()) return;
    if (username === mobileUser.username) { showToast("You can't add yourself", true); return; }
    if (contacts.find(function(c) { return c.username === username; })) { showToast('Already a contact', true); return; }
    const displayName = prompt('Enter display name (optional):') || username;
    mobileWs.send(JSON.stringify({
        type: 'add_contact',
        username: mobileUser.username,
        contactUsername: username,
        contactDisplayName: displayName
    }));
    showToast('Adding contact...');
}

function selectContact(username, displayName) {
    currentChat = username;
    currentChatDisplayName = displayName;
    renderedMessageIds.clear();
    document.getElementById('mobileMessages').innerHTML =
        '<div class="empty-state">' +
            '<div class="empty-icon">💬</div>' +
            '<div class="empty-title">No Messages</div>' +
            '<div class="empty-text">Send a message to start</div>' +
        '</div>';
    setView('chat');
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({ type: 'get_history', with: username }));
    }
    setTimeout(function() {
        const input = document.getElementById('mobileMessageInput');
        if (input) input.focus();
    }, 300);
}

function leaveChat() {
    currentChat = null;
    currentChatDisplayName = null;
    renderedMessageIds.clear();
    setView('list');
}

function selectImage() {
    if (!currentChat) { showToast('Open a chat first', true); return; }
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { showToast('Not connected', true); return; }
    document.getElementById('imageInput').click();
}

function selectMobileFile() {
    if (!currentChat) { showToast('Open a chat first', true); return; }
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { showToast('Not connected', true); return; }
    document.getElementById('mobileFileInput').click();
}

document.getElementById('imageInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Not an image', true); return; }
    if (file.size > 5 * 1024 * 1024) { showToast('Image too large (max 5MB)', true); return; }
    const reader = new FileReader();
    reader.onload = function(event) {
        if (mobileWs && mobileWs.readyState === WebSocket.OPEN && currentChat) {
            mobileWs.send(JSON.stringify({
                type: 'image_share',
                to: currentChat,
                from: mobileUser.username,
                fromDisplay: mobileUser.displayName,
                imageData: event.target.result,
                fileName: file.name,
                timestamp: new Date().toISOString()
            }));
            displayImage({
                id: Date.now(),
                from: mobileUser.username,
                fromDisplay: mobileUser.displayName,
                imageData: event.target.result,
                timestamp: new Date().toISOString()
            }, true);
        }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
});

document.getElementById('mobileFileInput').addEventListener('change', function(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!currentChat) { showToast('Open a chat first', true); return; }
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { showToast('Not connected', true); return; }
    if (file.size === 0) { showToast('Empty file', true); return; }
    if (file.size > 500 * 1024 * 1024) { showToast('File too large (max 500MB)', true); return; }
    sendMobileFile(currentChat, file);
});

function sendMobileMessage() {
    const input = document.getElementById('mobileMessageInput');
    const message = input.value.trim();
    if (!message || !currentChat || !mobileWs) return;
    if (mobileWs.readyState !== WebSocket.OPEN) { showToast('Not connected', true); return; }
    const messageData = {
        id: Date.now(),
        from: mobileUser.username,
        fromDisplay: mobileUser.displayName,
        to: currentChat,
        message: message,
        timestamp: new Date().toISOString()
    };
    mobileWs.send(JSON.stringify({ type: 'message', data: messageData }));
    playMobileSendSound();
    displayMessage(messageData, true);
    input.value = '';
}

function displayMessage(data, isSelf) {
    const msgId = data.id;
    if (msgId != null) {
        if (renderedMessageIds.has(msgId)) return;
        renderedMessageIds.add(msgId);
    }
    const messagesDiv = document.getElementById('mobileMessages');
    const emptyState = messagesDiv.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isSelf ? 'message-self' : 'message-other');
    let html = '<div class="bubble-wrap">';
    if (!isSelf) {
        html += '<div class="message-sender">' + escHtml(data.fromDisplay || data.from) + '</div>';
    }
    html += '<div class="bubble">' + escHtml(data.message || '') + '</div>';
    html += '<div class="message-time">' + time + '</div>';
    html += '</div>';
    messageDiv.innerHTML = html;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function displayImage(data, isSelf) {
    const msgId = data.id;
    if (msgId != null) {
        if (renderedMessageIds.has(msgId)) return;
        renderedMessageIds.add(msgId);
    }
    const messagesDiv = document.getElementById('mobileMessages');
    const emptyState = messagesDiv.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    const time = new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ' + (isSelf ? 'message-self' : 'message-other');
    let html = '<div class="bubble-wrap">';
    if (!isSelf) html += '<div class="message-sender">' + escHtml(data.fromDisplay || data.from) + '</div>';
    html += '<div class="bubble bubble-image"><img class="message-image" alt="image"></div>';
    html += '<div class="message-time">' + time + '</div>';
    html += '</div>';
    messageDiv.innerHTML = html;
    const img = messageDiv.querySelector('.message-image');
    if (img) {
        img.src = data.imageData;
        img.onclick = function() { openModal(data.imageData); };
    }
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function openModal(src) {
    document.getElementById('modalImage').src = src;
    document.getElementById('imageModal').classList.add('active');
}
function closeModal() {
    document.getElementById('imageModal').classList.remove('active');
}

function mobileLogout() {
    playMobileLogoutSound();
    endMobileCall();
    if (mobileWs) mobileWs.close();
    mobileUser = null;
    currentChat = null;
    currentChatDisplayName = null;
    contacts = [];
    connectionInProgress = false;
    renderedMessageIds.clear();
    myStatus = 'online';
    document.getElementById('mobileApp').classList.remove('active');
    document.getElementById('authOverlay').classList.add('active');
    document.getElementById('authErrorMessage').classList.remove('show');
    setView('list');
    showToast('Logged out');
}

/* ==================== CALLS ==================== */
function startMobileCall() {
    if (!currentChat) { showToast('Open a chat first', true); return; }
    if (isInCall) { showToast('Already in a call', true); return; }
    if (!mobileMicGranted) {
        requestMobileMicPermission().then(function(ok) { if (ok) startMobileCall(); });
        return;
    }
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { showToast('Not connected', true); return; }
    currentCallWith = currentChat;
    playMobileDialingSound();
    const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    window.currentCallId = callId;
    document.getElementById('mobileCallTargetName').textContent = currentChatDisplayName || currentChat;
    document.getElementById('mobileCallStatusLine').textContent = 'Calling...';
    document.getElementById('mobileCallTimer').textContent = 'Ringing';
    document.getElementById('mobileCallOverlay').classList.add('active');
    mobileWs.send(JSON.stringify({
        type: 'call_request',
        callId: callId,
        from: mobileUser.username,
        fromDisplay: mobileUser.displayName,
        to: currentChat
    }));
    setTimeout(function() {
        const overlay = document.getElementById('mobileCallOverlay');
        const statusLine = document.getElementById('mobileCallStatusLine');
        if (overlay.classList.contains('active') && statusLine.textContent === 'Calling...') {
            showToast('Call timed out', true);
            endMobileCall();
        }
    }, 30000);
}

function acceptIncomingCall() {
    stopMobileCallSounds();
    playMobileCallAcceptSound();
    const partner = incomingCallFrom;
    if (!partner) return;
    document.getElementById('mobileIncomingCallOverlay').classList.remove('active');
    document.getElementById('mobileCallTargetName').textContent = partner;
    document.getElementById('mobileCallStatusLine').textContent = 'In call with';
    document.getElementById('mobileCallOverlay').classList.add('active');
    startMobileCallTimer();
    isInCall = true;
    currentCallWith = partner;
    incomingCallFrom = null;
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({
            type: 'call_accepted',
            callId: window.currentCallId,
            from: mobileUser.username,
            fromDisplay: mobileUser.displayName,
            to: partner
        }));
    }
    if (!mobileMicGranted) {
        requestMobileMicPermission().then(function(ok) { if (ok) setupMobileWebRTC(false); });
    } else {
        setupMobileWebRTC(false);
    }
}

function declineIncomingCall() {
    stopMobileCallSounds();
    playMobileCallEndSound();
    document.getElementById('mobileIncomingCallOverlay').classList.remove('active');
    if (incomingCallFrom && mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({
            type: 'call_declined',
            callId: window.currentCallId,
            from: mobileUser.username,
            to: incomingCallFrom
        }));
    }
    incomingCallFrom = null;
    cleanupMobileWebRTC();
}

function endMobileCall() {
    stopMobileCallSounds();
    if (isInCall || incomingCallFrom) playMobileCallEndSound();
    document.getElementById('mobileCallOverlay').classList.remove('active');
    document.getElementById('mobileIncomingCallOverlay').classList.remove('active');
    if (mobileCallTimerInterval) { clearInterval(mobileCallTimerInterval); mobileCallTimerInterval = null; }
    if (currentCallWith && mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({
            type: 'call_end',
            callId: window.currentCallId,
            from: mobileUser.username,
            fromDisplay: mobileUser.displayName,
            to: currentCallWith
        }));
    }
    cleanupMobileWebRTC();
    isInCall = false;
    currentCallWith = null;
    incomingCallFrom = null;
    mobileCallStartTime = null;
}

function startMobileCallTimer() {
    mobileCallStartTime = new Date();
    document.getElementById('mobileCallTimer').textContent = '00:00';
    if (mobileCallTimerInterval) clearInterval(mobileCallTimerInterval);
    mobileCallTimerInterval = setInterval(function() {
        const diff = Math.floor((Date.now() - mobileCallStartTime) / 1000);
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        document.getElementById('mobileCallTimer').textContent =
            m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    }, 1000);
}

async function requestMobileMicPermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        mobileMicGranted = true;
        stream.getTracks().forEach(function(t) { t.stop(); });
        return true;
    } catch (e) {
        showMobileCallError('Microphone access denied.');
        playMobileCallErrorSound();
        return false;
    }
}

function showMobileCallError(msg) {
    const el = document.getElementById('mobileCallError');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
}
function hideMobileCallError() {
    const el = document.getElementById('mobileCallError');
    if (el) el.classList.remove('show');
}

async function setupMobileWebRTC(isCaller) {
    try {
        if (!mobileMicGranted) {
            const ok = await requestMobileMicPermission();
            if (!ok) return;
        }
        mobileLocalStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000, channelCount: 1 },
            video: false
        });
        const localVideo = document.getElementById('mobileLocalVideo');
        if (localVideo) { localVideo.srcObject = mobileLocalStream; localVideo.muted = true; localVideo.play().catch(function(){}); }
        mobilePeerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ],
            iceCandidatePoolSize: 10
        });
        mobileLocalStream.getTracks().forEach(function(track) {
            mobilePeerConnection.addTrack(track, mobileLocalStream);
        });
        mobilePeerConnection.ontrack = function(event) {
            const remoteAudio = document.getElementById('mobileRemoteAudio');
            if (remoteAudio && event.streams[0]) {
                remoteAudio.srcObject = event.streams[0];
                remoteAudio.play().catch(function(e){ console.log('Remote audio play failed:', e); });
            }
        };
        mobilePeerConnection.onicecandidate = function(event) {
            if (event.candidate && mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                mobileWs.send(JSON.stringify({ type: 'ice_candidate', to: currentCallWith, candidate: event.candidate }));
            }
        };
        mobilePeerConnection.oniceconnectionstatechange = function() {
            const st = mobilePeerConnection.iceConnectionState;
            if (st === 'connected' || st === 'completed') {
                hideMobileCallError();
                document.getElementById('mobileAudioControls').style.display = 'flex';
            } else if (st === 'failed') {
                showMobileCallError('Connection failed.');
                playMobileCallErrorSound();
                setTimeout(endMobileCall, 2500);
            }
        };
        if (isCaller) {
            const offer = await mobilePeerConnection.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: false });
            await mobilePeerConnection.setLocalDescription(offer);
            if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                mobileWs.send(JSON.stringify({ type: 'webrtc_offer', to: currentCallWith, offer: offer }));
            }
        }
    } catch (e) {
        console.error('WebRTC setup error:', e);
        showMobileCallError('Call setup failed: ' + e.message);
        playMobileCallErrorSound();
        setTimeout(endMobileCall, 2500);
    }
}

async function handleMobileWebRTCOffer(offer, from) {
    try {
        if (!mobilePeerConnection) await setupMobileWebRTC(false);
        await mobilePeerConnection.setRemoteDescription(offer);
        const answer = await mobilePeerConnection.createAnswer();
        await mobilePeerConnection.setLocalDescription(answer);
        if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
            mobileWs.send(JSON.stringify({ type: 'webrtc_answer', to: from, answer: answer }));
        }
        await flushMobileIce();
    } catch (e) {
        console.error('Offer handling error:', e);
        showMobileCallError('Failed to accept call.');
        playMobileCallErrorSound();
        setTimeout(endMobileCall, 2500);
    }
}

async function handleMobileWebRTCAnswer(answer) {
    try {
        if (!mobilePeerConnection) return;
        await mobilePeerConnection.setRemoteDescription(answer);
        await flushMobileIce();
    } catch (e) { console.error('Answer handling error:', e); }
}

async function handleMobileICECandidate(candidate) {
    try {
        if (mobilePeerConnection && mobilePeerConnection.remoteDescription) {
            await mobilePeerConnection.addIceCandidate(candidate);
        } else {
            mobilePendingIce.push(candidate);
        }
    } catch (e) { console.error('ICE error:', e); }
}

async function flushMobileIce() {
    if (!mobilePeerConnection || !mobilePeerConnection.remoteDescription) return;
    const queued = mobilePendingIce;
    mobilePendingIce = [];
    for (const c of queued) { try { await mobilePeerConnection.addIceCandidate(c); } catch (e) {} }
}

function toggleMute() {
    if (mobileLocalStream) {
        mobileLocalStream.getAudioTracks().forEach(function(t) { t.enabled = !t.enabled; });
        mobileMuted = !mobileMuted;
        const btn = document.getElementById('mobileMuteBtn');
        if (btn) btn.textContent = mobileMuted ? 'Unmute' : 'Mute';
    }
}

function toggleDeafen() {
    const remote = document.getElementById('mobileRemoteAudio');
    if (remote) {
        remote.muted = !remote.muted;
        mobileDeafened = !mobileDeafened;
        const btn = document.getElementById('mobileDeafenBtn');
        if (btn) btn.textContent = mobileDeafened ? 'Undeafen' : 'Deafen';
    }
}

function cleanupMobileWebRTC() {
    mobilePendingIce = [];
    if (mobileLocalStream) {
        mobileLocalStream.getTracks().forEach(function(t) { t.stop(); });
        mobileLocalStream = null;
    }
    if (mobilePeerConnection) { mobilePeerConnection.close(); mobilePeerConnection = null; }
    const lv = document.getElementById('mobileLocalVideo');
    if (lv) { lv.srcObject = null; lv.pause(); }
    const ra = document.getElementById('mobileRemoteAudio');
    if (ra) { ra.srcObject = null; ra.pause(); }
    mobileMuted = false;
    mobileDeafened = false;
    const mb = document.getElementById('mobileMuteBtn');
    if (mb) mb.textContent = 'Mute';
    const db = document.getElementById('mobileDeafenBtn');
    if (db) db.textContent = 'Deafen';
    document.getElementById('mobileAudioControls').style.display = 'none';
    hideMobileCallError();
}

/* ==================== FILE TRANSFER ==================== */
function mFormatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
}
function mFormatSpeed(bps) {
    if (!bps || bps <= 0) return '0 B/s';
    return mFormatBytes(bps) + '/s';
}
function mFormatEta(sec) {
    if (!isFinite(sec) || sec <= 0) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
}
function makeMobileTransferId() {
    return 'ft_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
}

function showMobileFtChatBar(peer, transferId, opts) {
    if (!peer) return;
    if (currentChat !== peer) return;
    opts = opts || {};
    const container = document.getElementById('mobileMessages');
    if (!container) return;
    const barId = 'mftbar_' + (transferId || (Date.now() + '_' + Math.random().toString(36).substr(2, 5)));
    let bar = document.getElementById(barId);
    if (!bar) {
        bar = document.createElement('div');
        bar.id = barId;
        bar.className = 'ft-chat-bar';
        bar.innerHTML =
            '<div class="ft-bar-icon">📎</div>' +
            '<div class="ft-bar-text">' +
                '<strong class="ft-bar-title"></strong>' +
                '<small class="ft-bar-sub"></small>' +
                '<div class="ft-bar-progress"><div class="ft-bar-progress-fill"></div></div>' +
            '</div>' +
            '<div class="ft-bar-close" title="Dismiss">×</div>';
        bar.querySelector('.ft-bar-close').onclick = function() { bar.remove(); };
        container.appendChild(bar);
    }
    const titleEl = bar.querySelector('.ft-bar-title');
    const subEl = bar.querySelector('.ft-bar-sub');
    const fillEl = bar.querySelector('.ft-bar-progress-fill');
    const progressWrap = bar.querySelector('.ft-bar-progress');
    if (opts.title) titleEl.textContent = opts.title;
    if (opts.sub) subEl.textContent = opts.sub;
    if (typeof opts.progress === 'number') {
        progressWrap.style.display = '';
        fillEl.style.width = Math.max(0, Math.min(100, opts.progress)).toFixed(1) + '%';
    } else if (opts.hideProgress) {
        progressWrap.style.display = 'none';
    }
    bar.classList.remove('success', 'error', 'cancelled');
    if (opts.status === 'success') bar.classList.add('success');
    else if (opts.status === 'error') bar.classList.add('error');
    else if (opts.status === 'cancelled') bar.classList.add('cancelled');
    if (opts.icon) bar.querySelector('.ft-bar-icon').textContent = opts.icon;
    container.scrollTop = container.scrollHeight;
}

function reattachMobileFtBars(peer) {
    mFtTransfers.forEach(function(t) {
        if (t.peer !== peer) return;
        const done = t.direction === 'send' ? t.bytesSent : t.receivedBytes;
        const total = t.filesize || 1;
        const pct = Math.min(100, (done / total) * 100);
        let icon, title, sub, status;
        if (t.direction === 'send') { icon = '📤'; title = 'Sending ' + t.filename; }
        else { icon = '📥'; title = 'Receiving ' + t.filename; }
        switch (t.status) {
            case 'offered':      sub = mFormatBytes(total) + ' - waiting'; break;
            case 'connecting':   sub = mFormatBytes(total) + ' - connecting'; break;
            case 'transferring': sub = mFormatBytes(done) + ' / ' + mFormatBytes(total) + (t.speed > 0 ? ' - ' + mFormatSpeed(t.speed) : ''); break;
            case 'done':         sub = mFormatBytes(total) + ' - complete'; status = 'success'; break;
            case 'declined':     sub = 'Declined'; status = 'error'; break;
            case 'cancelled':    sub = 'Cancelled'; status = 'cancelled'; break;
            case 'failed':       sub = 'Failed: ' + (t.error || 'error'); status = 'error'; break;
        }
        showMobileFtChatBar(peer, t.id, { icon: icon, title: title, sub: sub, progress: pct, status: status });
    });
}

function sendMobileFile(recipient, file) {
    const transferId = makeMobileTransferId();
    const transfer = {
        id: transferId, direction: 'send', peer: recipient,
        filename: file.name, filesize: file.size,
        mime: file.type || 'application/octet-stream',
        file: file, status: 'offered',
        bytesSent: 0, bytesReceived: 0,
        startTime: null, lastTickTime: null, lastTickBytes: 0,
        speed: 0, pc: null, dc: null, pendingIce: []
    };
    mFtTransfers.set(transferId, transfer);
    showMobileFtProgress(transfer);
    playMobileFtStartSound();
    showMobileFtChatBar(recipient, transferId, {
        icon: '📤', title: 'Sending ' + file.name,
        sub: mFormatBytes(file.size) + ' - waiting',
        progress: 0
    });
    mobileWs.send(JSON.stringify({
        type: 'ft_offer',
        transferId: transferId,
        from: mobileUser.username,
        fromDisplay: mobileUser.displayName,
        to: recipient,
        filename: file.name,
        filesize: file.size,
        mime: transfer.mime
    }));
    console.log('FT: [mobile] sent ft_offer', { transferId: transferId, to: recipient, filename: file.name });
}

function handleMobileFtOffer(data) {
    console.log('FT: [mobile] received ft_offer', data);
    if (!data || !data.transferId) return;
    if (mFtIncomingOffer) {
        if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
            mobileWs.send(JSON.stringify({ type: 'ft_decline', transferId: data.transferId, from: mobileUser.username, to: data.from }));
        }
        return;
    }
    mFtIncomingOffer = {
        transferId: data.transferId,
        from: data.from,
        fromDisplay: data.fromDisplay || data.from,
        filename: data.filename || 'file.bin',
        filesize: data.filesize || 0,
        mime: data.mime || 'application/octet-stream'
    };
    document.getElementById('mobileFtOfferFrom').textContent = (data.fromDisplay || data.from) + ' wants to send you a file';
    document.getElementById('mobileFtOfferFilename').textContent = mFtIncomingOffer.filename;
    document.getElementById('mobileFtOfferFilesize').textContent = mFormatBytes(mFtIncomingOffer.filesize);
    document.getElementById('mobileFtOfferOverlay').classList.add('active');
    playMobileFtStartSound();
}

function acceptIncomingTransfer() {
    if (!mFtIncomingOffer) return;
    const offer = mFtIncomingOffer;
    mFtIncomingOffer = null;
    document.getElementById('mobileFtOfferOverlay').classList.remove('active');
    if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) { playMobileFtFailSound(); return; }
    mobileWs.send(JSON.stringify({ type: 'ft_accept', transferId: offer.transferId, from: mobileUser.username, to: offer.from }));
    const transfer = {
        id: offer.transferId, direction: 'receive', peer: offer.from,
        peerDisplay: offer.fromDisplay,
        filename: offer.filename, filesize: offer.filesize, mime: offer.mime,
        status: 'connecting',
        bytesSent: 0, bytesReceived: 0,
        startTime: null, lastTickTime: null, lastTickBytes: 0,
        speed: 0, pc: null, dc: null, pendingIce: [],
        chunks: [], receivedBytes: 0
    };
    mFtTransfers.set(offer.transferId, transfer);
    showMobileFtProgress(transfer);
    showMobileFtChatBar(offer.from, offer.transferId, {
        icon: '📥', title: 'Receiving ' + offer.filename,
        sub: mFormatBytes(offer.filesize) + ' - connecting',
        progress: 0
    });
    setupMobileFtReceiver(transfer);
}

function declineIncomingTransfer() {
    if (!mFtIncomingOffer) return;
    const offer = mFtIncomingOffer;
    mFtIncomingOffer = null;
    document.getElementById('mobileFtOfferOverlay').classList.remove('active');
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({ type: 'ft_decline', transferId: offer.transferId, from: mobileUser.username, to: offer.from }));
    }
    playMobileFtFailSound();
    showMobileFtChatBar(offer.from, null, {
        icon: '❌', title: offer.filename, sub: 'You declined',
        hideProgress: true, status: 'cancelled'
    });
}

function handleMobileFtAccept(data) {
    const transfer = mFtTransfers.get(data.transferId);
    if (!transfer || transfer.direction !== 'send') return;
    transfer.status = 'connecting';
    updateMobileFtProgress(transfer);
    setupMobileFtSender(transfer);
}

function handleMobileFtDecline(data) {
    const transfer = mFtTransfers.get(data.transferId);
    if (!transfer) return;
    transfer.status = 'declined';
    updateMobileFtProgress(transfer);
    playMobileFtFailSound();
    showMobileFtChatBar(transfer.peer, transfer.id, {
        icon: '❌', title: transfer.filename, sub: 'Declined',
        hideProgress: true, status: 'error'
    });
    setTimeout(function() { removeMobileFtTransfer(transfer.id); }, 2500);
}

function handleMobileFtCancel(data) {
    const transfer = mFtTransfers.get(data.transferId);
    if (!transfer) return;
    transfer.status = 'cancelled';
    updateMobileFtProgress(transfer);
    playMobileFtFailSound();
    if (transfer.pc) { try { transfer.pc.close(); } catch (e) {} transfer.pc = null; }
    showMobileFtChatBar(transfer.peer, transfer.id, {
        icon: '❌', title: transfer.filename,
        sub: transfer.direction === 'send' ? 'Cancelled' : 'Sender cancelled',
        hideProgress: true, status: 'cancelled'
    });
    setTimeout(function() { removeMobileFtTransfer(transfer.id); }, 2500);
}

function handleMobileFtSignal(data) {
    const transfer = mFtTransfers.get(data.transferId);
    if (!transfer) return;
    if (!transfer.pc) {
        transfer.pendingSignals = transfer.pendingSignals || [];
        transfer.pendingSignals.push(data.signal);
        return;
    }
    processMobileFtSignal(transfer, data.signal);
}

async function processMobileFtSignal(transfer, signal) {
    try {
        if (signal.type === 'offer' || signal.type === 'answer') {
            if (transfer.pc.signalingState === 'have-local-offer' && signal.type === 'offer') return;
            if (transfer.pc.signalingState === 'have-remote-offer' && signal.type === 'offer') return;
            if (transfer.pc.signalingState === 'stable' && signal.type === 'answer') return;
            if (transfer.pc.signalingState !== 'have-local-offer' && signal.type === 'answer') return;
            await transfer.pc.setRemoteDescription(signal);
            for (const c of (transfer.pendingIce || [])) { try { await transfer.pc.addIceCandidate(c); } catch (e) {} }
            transfer.pendingIce = [];
            if (signal.type === 'offer') {
                const answer = await transfer.pc.createAnswer();
                await transfer.pc.setLocalDescription(answer);
                sendMobileFtSignal(transfer, { type: 'answer', sdp: answer.sdp });
            }
        } else if (signal.type === 'candidate' && signal.candidate) {
            if (transfer.pc.remoteDescription) await transfer.pc.addIceCandidate(signal.candidate);
            else { transfer.pendingIce = transfer.pendingIce || []; transfer.pendingIce.push(signal.candidate); }
        }
    } catch (e) {
        failMobileFtTransfer(transfer, 'Signal error: ' + e.message);
    }
}

function sendMobileFtSignal(transfer, signal) {
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({
            type: 'ft_signal',
            transferId: transfer.id,
            from: mobileUser.username,
            to: transfer.peer,
            signal: signal
        }));
    }
}

async function setupMobileFtSender(transfer) {
    try {
        transfer.pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        transfer.pc.onicecandidate = function(e) {
            if (e.candidate) sendMobileFtSignal(transfer, { type: 'candidate', candidate: e.candidate });
        };
        transfer.pc.oniceconnectionstatechange = function() {
            const st = transfer.pc.iceConnectionState;
            if (st !== 'failed') return;
            if (transfer.direction === 'send' && transfer.bytesSent >= transfer.filesize) { finishMobileSend(transfer); return; }
            if (transfer.direction === 'receive' && (transfer.receivedBytes >= transfer.filesize || transfer.gotFileEnd)) { finishMobileReceive(transfer); return; }
            if (transfer.status !== 'done' && transfer.status !== 'cancelled' && transfer.status !== 'declined' && transfer.status !== 'failed') {
                failMobileFtTransfer(transfer, 'Connection failed');
            }
        };
        const dc = transfer.pc.createDataChannel('file', { ordered: true });
        transfer.dc = dc;
        wireMobileDataChannel(transfer, dc, 'send');
        const offer = await transfer.pc.createOffer();
        await transfer.pc.setLocalDescription(offer);
        sendMobileFtSignal(transfer, { type: 'offer', sdp: offer.sdp });
    } catch (e) {
        failMobileFtTransfer(transfer, 'Setup failed: ' + e.message);
    }
}

async function setupMobileFtReceiver(transfer) {
    try {
        transfer.pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });
        transfer.pc.onicecandidate = function(e) {
            if (e.candidate) sendMobileFtSignal(transfer, { type: 'candidate', candidate: e.candidate });
        };
        transfer.pc.oniceconnectionstatechange = function() {
            const st = transfer.pc.iceConnectionState;
            if (st !== 'failed') return;
            if (transfer.direction === 'receive' && (transfer.receivedBytes >= transfer.filesize || transfer.gotFileEnd)) { finishMobileReceive(transfer); return; }
            if (transfer.status !== 'done' && transfer.status !== 'cancelled' && transfer.status !== 'declined' && transfer.status !== 'failed') {
                failMobileFtTransfer(transfer, 'Connection failed');
            }
        };
        transfer.pc.ondatachannel = function(event) {
            transfer.dc = event.channel;
            wireMobileDataChannel(transfer, event.channel, 'receive');
        };
        if (transfer.pendingSignals) {
            for (const sig of transfer.pendingSignals) await processMobileFtSignal(transfer, sig);
            transfer.pendingSignals = [];
        }
    } catch (e) {
        failMobileFtTransfer(transfer, 'Setup failed: ' + e.message);
    }
}

function wireMobileDataChannel(transfer, dc, side) {
    dc.binaryType = 'arraybuffer';
    dc.onopen = function() {
        transfer.status = 'transferring';
        transfer.startTime = Date.now();
        transfer.lastTickTime = Date.now();
        transfer.lastTickBytes = 0;
        updateMobileFtProgress(transfer);
        if (side === 'send') startMobileSendingChunks(transfer);
        else { transfer.receivedBytes = 0; transfer.chunks = []; }
    };
    dc.onmessage = function(event) {
        if (side !== 'receive') return;
        const data = event.data;
        if (typeof data === 'string') {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'file-end') { transfer.gotFileEnd = true; finishMobileReceive(transfer); }
            } catch (e) {}
            return;
        }
        const chunk = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
        transfer.chunks.push(chunk);
        transfer.receivedBytes += chunk.byteLength;
        const now = Date.now();
        if (now - transfer.lastTickTime >= 500) {
            const dt = (now - transfer.lastTickTime) / 1000;
            transfer.speed = (transfer.receivedBytes - transfer.lastTickBytes) / dt;
            transfer.lastTickTime = now;
            transfer.lastTickBytes = transfer.receivedBytes;
        }
        updateMobileFtProgress(transfer);
    };
    dc.onclose = function() {
        if (transfer.status !== 'transferring') return;
        if (transfer.direction === 'receive') {
            if (transfer.receivedBytes >= transfer.filesize || transfer.gotFileEnd) finishMobileReceive(transfer);
            else failMobileFtTransfer(transfer, 'Connection closed');
        } else if (transfer.direction === 'send') {
            if (transfer.bytesSent >= transfer.filesize) finishMobileSend(transfer);
            else failMobileFtTransfer(transfer, 'Connection closed');
        }
    };
    dc.onerror = function(e) {
        if (transfer.sendingDone) return;
        if (transfer.direction === 'send' && transfer.bytesSent >= transfer.filesize) return;
        if (transfer.direction === 'receive' && (transfer.receivedBytes >= transfer.filesize || transfer.gotFileEnd)) return;
        if (transfer.status === 'done' || transfer.status === 'cancelled' || transfer.status === 'declined' || transfer.status === 'failed') return;
        const err = e && e.error;
        if (err) {
            const probe = String(err) + ' ' + (err.name || '') + ' ' + (err.message || '') + ' ' + ((err.constructor && err.constructor.name) || '');
            if (probe.indexOf('Restricted') !== -1) return;
        }
        failMobileFtTransfer(transfer, 'Data channel error');
    };
}

async function startMobileSendingChunks(transfer) {
    try {
        const file = transfer.file;
        let offset = 0;
        const dc = transfer.dc;
        while (offset < file.size) {
            while (dc.bufferedAmount > FT_BUFFER_THRESHOLD) {
                await new Promise(function(r) { setTimeout(r, 20); });
                if (transfer.status === 'cancelled' || transfer.status === 'failed') return;
            }
            const slice = file.slice(offset, offset + FT_CHUNK_SIZE);
            const buf = await slice.arrayBuffer();
            try { dc.send(buf); } catch (e) { failMobileFtTransfer(transfer, 'Send failed: ' + e.message); return; }
            offset += buf.byteLength;
            transfer.bytesSent = offset;
            const now = Date.now();
            if (now - transfer.lastTickTime >= 500) {
                const dt = (now - transfer.lastTickTime) / 1000;
                transfer.speed = (transfer.bytesSent - transfer.lastTickBytes) / dt;
                transfer.lastTickTime = now;
                transfer.lastTickBytes = transfer.bytesSent;
                updateMobileFtProgress(transfer);
            }
        }
        try { dc.send(JSON.stringify({ type: 'file-end' })); } catch (e) {}
        transfer.sendingDone = true;
        try { dc.onerror = null; } catch (e) {}
        updateMobileFtProgress(transfer);
        setTimeout(function() {
            if (transfer.status === 'transferring') finishMobileSend(transfer);
        }, 800);
    } catch (e) {
        failMobileFtTransfer(transfer, 'Send error: ' + e.message);
    }
}

function finishMobileSend(transfer) {
    if (transfer.status === 'done') return;
    if (transfer.dc) { transfer.dc.onerror = null; transfer.dc.onclose = null; transfer.dc.onmessage = null; }
    transfer.status = 'done';
    transfer.bytesSent = transfer.filesize;
    updateMobileFtProgress(transfer);
    playMobileFtSuccessSound();
    showMobileFtChatBar(transfer.peer, transfer.id, {
        icon: '✅', title: transfer.filename,
        sub: 'Sent - ' + mFormatBytes(transfer.filesize),
        hideProgress: true, status: 'success'
    });
    setTimeout(function() { removeMobileFtTransfer(transfer.id); }, 4000);
}

function finishMobileReceive(transfer) {
    if (transfer.status === 'done') return;
    if (transfer.dc) { transfer.dc.onerror = null; transfer.dc.onclose = null; transfer.dc.onmessage = null; }
    transfer.status = 'done';
    updateMobileFtProgress(transfer);
    playMobileFtSuccessSound();
    try {
        const blob = new Blob(transfer.chunks, { type: transfer.mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = transfer.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function() { URL.revokeObjectURL(url); }, 10000);
    } catch (e) {}
    showMobileFtChatBar(transfer.peer, transfer.id, {
        icon: '✅', title: transfer.filename,
        sub: 'Received - ' + mFormatBytes(transfer.filesize),
        hideProgress: true, status: 'success'
    });
    setTimeout(function() { removeMobileFtTransfer(transfer.id); }, 4000);
}

function failMobileFtTransfer(transfer, reason) {
    if (transfer.status === 'done' || transfer.status === 'failed') return;
    transfer.status = 'failed';
    transfer.error = reason;
    updateMobileFtProgress(transfer);
    playMobileFtFailSound();
    if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
        mobileWs.send(JSON.stringify({ type: 'ft_cancel', transferId: transfer.id, from: mobileUser.username, to: transfer.peer }));
    }
    if (transfer.pc) { try { transfer.pc.close(); } catch (e) {} transfer.pc = null; }
    showMobileFtChatBar(transfer.peer, transfer.id, {
        icon: '❌', title: transfer.filename, sub: 'Failed: ' + (reason || 'error'),
        hideProgress: true, status: 'error'
    });
    setTimeout(function() { removeMobileFtTransfer(transfer.id); }, 3000);
}

function cancelCurrentFt() {
    if (mFtActiveId) {
        const transfer = mFtTransfers.get(mFtActiveId);
        if (transfer && transfer.status !== 'done' && transfer.status !== 'failed' && transfer.status !== 'cancelled') {
            transfer.status = 'cancelled';
            updateMobileFtProgress(transfer);
            playMobileFtFailSound();
            if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                mobileWs.send(JSON.stringify({ type: 'ft_cancel', transferId: transfer.id, from: mobileUser.username, to: transfer.peer }));
            }
            if (transfer.pc) { try { transfer.pc.close(); } catch (e) {} transfer.pc = null; }
            showMobileFtChatBar(transfer.peer, transfer.id, {
                icon: '❌', title: transfer.filename, sub: 'Cancelled',
                hideProgress: true, status: 'cancelled'
            });
        }
    }
    document.getElementById('mobileFtProgressOverlay').classList.remove('active');
    mFtActiveId = null;
}

function removeMobileFtTransfer(id) {
    const transfer = mFtTransfers.get(id);
    if (!transfer) return;
    mFtTransfers.delete(id);
    if (mFtActiveId === id) {
        document.getElementById('mobileFtProgressOverlay').classList.remove('active');
        mFtActiveId = null;
    }
}

function showMobileFtProgress(transfer) {
    mFtActiveId = transfer.id;
    document.getElementById('mobileFtTitle').textContent = transfer.direction === 'send' ? 'Sending File' : 'Receiving File';
    document.getElementById('mobileFtFilename').textContent = transfer.filename;
    document.getElementById('mobileFtPeer').textContent =
        mFormatBytes(transfer.filesize) + (transfer.direction === 'send' ? ' to ' + transfer.peer : ' from ' + (transfer.peerDisplay || transfer.peer));
    document.getElementById('mobileFtProgressOverlay').classList.add('active');
    updateMobileFtProgress(transfer);
}

function updateMobileFtProgress(transfer) {
    if (mFtActiveId !== transfer.id) {
        updateMobileFtChatBarOnly(transfer);
        return;
    }
    const fill = document.getElementById('mobileFtFill');
    const status = document.getElementById('mobileFtStatus');
    const speed = document.getElementById('mobileFtSpeed');
    const eta = document.getElementById('mobileFtEta');
    const done = transfer.direction === 'send' ? transfer.bytesSent : transfer.receivedBytes;
    const total = transfer.filesize || 1;
    const pct = Math.min(100, (done / total) * 100);
    if (fill) fill.style.width = pct.toFixed(2) + '%';
    if (status) {
        switch (transfer.status) {
            case 'offered':      status.textContent = 'Waiting for acceptance...'; break;
            case 'connecting':   status.textContent = 'Connecting...'; break;
            case 'transferring': status.textContent = (transfer.direction === 'send' ? 'Sending... ' : 'Receiving... ') + pct.toFixed(0) + '%'; break;
            case 'done':         status.textContent = 'Complete'; break;
            case 'declined':     status.textContent = 'Declined'; break;
            case 'cancelled':    status.textContent = 'Cancelled'; break;
            case 'failed':       status.textContent = 'Failed: ' + (transfer.error || 'error'); break;
        }
    }
    if (speed) speed.textContent = transfer.status === 'transferring' ? mFormatSpeed(transfer.speed) : '';
    if (eta) {
        if (transfer.status === 'transferring' && transfer.speed > 0) eta.textContent = 'ETA: ' + mFormatEta((total - done) / transfer.speed);
        else eta.textContent = '';
    }
    updateMobileFtChatBarOnly(transfer);
}

function updateMobileFtChatBarOnly(transfer) {
    const done = transfer.direction === 'send' ? transfer.bytesSent : transfer.receivedBytes;
    const total = transfer.filesize || 1;
    const pct = Math.min(100, (done / total) * 100);
    let icon, title, sub, status;
    if (transfer.direction === 'send') { icon = '📤'; title = 'Sending ' + transfer.filename; }
    else { icon = '📥'; title = 'Receiving ' + transfer.filename; }
    switch (transfer.status) {
        case 'offered':      sub = mFormatBytes(total) + ' - waiting'; break;
        case 'connecting':   sub = mFormatBytes(total) + ' - connecting'; break;
        case 'transferring': sub = mFormatBytes(done) + ' / ' + mFormatBytes(total) + (transfer.speed > 0 ? ' - ' + mFormatSpeed(transfer.speed) : ''); break;
        case 'done':         sub = mFormatBytes(total) + ' - complete'; status = 'success'; break;
        case 'declined':     sub = 'Declined'; status = 'error'; break;
        case 'cancelled':    sub = 'Cancelled'; status = 'cancelled'; break;
        case 'failed':       sub = 'Failed: ' + (transfer.error || 'error'); status = 'error'; break;
    }
    showMobileFtChatBar(transfer.peer, transfer.id, { icon: icon, title: title, sub: sub, progress: pct, status: status });
}

document.addEventListener('DOMContentLoaded', function() {
    updateStatusBarTime();
    setView('list');
    const contactsListEl = document.getElementById('mobileContactList');
    if (contactsListEl) {
        contactsListEl.addEventListener('click', function(e) {
            const row = e.target.closest('.contact-row');
            if (!row) return;
            selectContact(row.getAttribute('data-user'), row.getAttribute('data-display'));
        });
    }
    const loginBtn = document.getElementById('mobileLoginBtn');
    if (loginBtn) loginBtn.addEventListener('click', mobileLogin);
    const registerBtn = document.getElementById('mobileRegisterBtn');
    if (registerBtn) registerBtn.addEventListener('click', mobileRegister);
    const pw = document.getElementById('mobilePassword');
    if (pw) pw.addEventListener('keypress', function(e) { if (e.key === 'Enter') mobileLogin(); });
    const modal = document.getElementById('imageModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === this) closeModal(); });
    const navMe = document.getElementById('navBackBtn');
    // Long-press on nav title to open status sheet (nice little easter egg)
    const navTitle = document.getElementById('navTitle');
    if (navTitle) {
        let pressTimer;
        navTitle.addEventListener('touchstart', function() {
            pressTimer = setTimeout(openStatusSheet, 600);
        });
        navTitle.addEventListener('touchend', function() { clearTimeout(pressTimer); });
        navTitle.addEventListener('mousedown', function() {
            pressTimer = setTimeout(openStatusSheet, 600);
        });
        navTitle.addEventListener('mouseup', function() { clearTimeout(pressTimer); });
    }
});
</script>
</body>
</html>
`);
});

// ==================== ANALYTICS PAGE ====================
app.get('/analytics', (req, res) => {
    console.log('📊 Serving analytics page');
    
    const onlineUsers = Array.from(users.values()).filter(u => visibleStatus(u.status) === 'online').length;
    const totalGroups = groups.size;
    
    let messagesToday = 0;
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    chatMessages.forEach((messages) => {
        messages.forEach(msg => {
            const msgTime = new Date(msg.timestamp).getTime();
            if (now - msgTime < oneDay) {
                messagesToday++;
            }
        });
    });
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic - Analytics</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'Tahoma', 'Arial', sans-serif;
                font-size: 11px;
            }
            
            :root {
                --bg-primary: #6C00A0;
                --window-bg: #ECE9D8;
                --titlebar-start: #0A246A;
                --titlebar-end: #6B8DC3;
                --border-light: #FFFFFF;
                --border-dark: #808080;
                --text-primary: #000000;
                --text-light: #FFFFFF;
                --button-bg: #ECE9D8;
                --contact-hover: #6C00A0;
                --banner-bg: linear-gradient(90deg, #FFD700, #FFA500);
                --banner-text: #0A246A;
                --bg-image: url('/images/bbg.jpg');
                --text-secondary: #666666;
                --accent: #6C00A0;
            }
            
            .dark-theme {
                --bg-primary: #1a1a1a;
                --window-bg: #2d2d2d;
                --titlebar-start: #2b2b2b;
                --titlebar-end: #4a4a4a;
                --border-light: #4a4a4a;
                --border-dark: #1a1a1a;
                --text-primary: #e0e0e0;
                --text-light: #ffffff;
                --button-bg: #3d3d3d;
                --contact-hover: #4a4a4a;
                --banner-bg: linear-gradient(90deg, #b8860b, #8b4513);
                --banner-text: #ffd700;
                --bg-image: url('/images/dbg.jpg');
                --text-secondary: #b0b0b0;
                --accent: #9b59b6;
            }
            
            body {
                background: var(--bg-primary) var(--bg-image);
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
                margin: 0;
                padding-top: 45px;
                color: var(--text-primary);
                transition: background-color 0.5s ease, color 0.3s ease;
            }
            
            .xp-window, .xp-titlebar, .xp-content, .xp-fieldset, .xp-legend,
            .xp-button, .stat-box, .stat-title, .stat-value, .ascii-art,
            .theme-btn, .theme-switcher, .global-banner {
                transition: background-color 0.4s ease, color 0.3s ease, border-color 0.3s ease;
            }
            
            .global-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background: var(--banner-bg);
                border-bottom: 3px solid var(--titlebar-start);
                overflow: hidden;
                padding: 8px 0;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            }
            
            .global-banner marquee {
                background: none;
                color: var(--banner-text);
                text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
                font-family: 'Tahoma', 'Arial', sans-serif;
                font-size: 12px;
            }
            
            .theme-switcher {
                position: fixed;
                top: 55px;
                left: 10px;
                z-index: 9999;
                background: var(--window-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                padding: 3px;
                border-radius: 3px;
            }
            
            .theme-btn {
                background: var(--button-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                padding: 3px 8px;
                font-size: 10px;
                font-weight: bold;
                cursor: pointer;
                color: var(--text-primary);
                margin: 0;
            }
            
            .theme-btn:hover {
                background: var(--contact-hover);
                color: var(--text-light);
            }
            
            .xp-window {
                width: 620px;
                max-width: 100%;
                background: var(--window-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                margin-top: 10px;
            }
            
            .xp-titlebar {
                background: linear-gradient(90deg, var(--titlebar-start), var(--titlebar-end));
                color: var(--text-light);
                padding: 4px 8px;
                font-size: 11px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 20px;
            }
            
            .xp-titlebar-controls {
                display: flex;
                gap: 1px;
            }
            
            .xp-button {
                width: 16px;
                height: 14px;
                border: 1px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                background: var(--button-bg);
                font-size: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                line-height: 1;
                color: var(--text-primary);
            }
            
            .xp-content {
                padding: 15px;
                background: var(--window-bg);
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .xp-fieldset {
                border: 1px solid var(--border-dark);
                padding: 15px;
                margin-bottom: 15px;
                background: var(--window-bg);
                position: relative;
            }
            
            .xp-legend {
                background: var(--window-bg);
                padding: 2px 8px;
                font-size: 11px;
                font-weight: bold;
                position: absolute;
                top: -8px;
                left: 8px;
                color: var(--text-primary);
            }
            
            .xp-status-bar {
                background: var(--window-bg);
                border-top: 1px solid var(--border-dark);
                padding: 4px 8px;
                font-size: 10px;
                color: var(--text-primary);
                height: 20px;
            }
            
            .stat-box {
                background: var(--window-bg);
                border: 1px solid var(--border-dark);
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                padding: 12px 15px;
                margin: 10px 0;
            }
            
            .stat-title {
                font-weight: bold;
                color: var(--titlebar-start);
                margin-bottom: 4px;
                font-size: 12px;
            }
            
            .dark-theme .stat-title {
                color: var(--accent);
            }
            
            .stat-value {
                font-size: 28px;
                color: var(--accent);
                font-weight: bold;
            }
            
            .ascii-art {
                font-family: 'Courier New', monospace;
                background: #000000;
                color: #00ff00;
                padding: 15px;
                margin: 10px 0 0 0;
                font-size: 12px;
                line-height: 1.5;
                border: 2px inset var(--border-dark);
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                gap: 10px;
                margin-bottom: 10px;
            }
            
            .nav-links {
                text-align: center;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid var(--border-dark);
            }
            
            .nav-links a {
                color: var(--titlebar-start);
                margin: 0 8px;
                text-decoration: none;
                font-weight: bold;
                font-size: 11px;
            }
            
            .dark-theme .nav-links a {
                color: var(--accent);
            }
            
            .nav-links a:hover {
                text-decoration: underline;
            }
            
            .whats-new-banner {
                margin: 15px 0 10px 0;
                padding: 15px;
                background: linear-gradient(135deg, var(--titlebar-start), var(--titlebar-end));
                color: var(--text-light);
                border: 2px solid gold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }
            
            .whats-new-header {
                text-align: center;
                margin-bottom: 15px;
                font-size: 14px;
                font-weight: bold;
                text-shadow: 1px 1px 0 rgba(0,0,0,0.3);
            }
            
            .feature-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
                gap: 10px;
            }
            
            .feature-card {
                background: rgba(255,255,255,0.15);
                padding: 10px 12px;
                border: 1px solid rgba(255,255,255,0.25);
                border-radius: 3px;
            }
            
            .feature-card-title {
                font-size: 12px;
                font-weight: bold;
                margin-bottom: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
            }
            
            .feature-card-body {
                font-size: 11px;
                line-height: 1.5;
                opacity: 0.95;
            }
            
            .footer-note {
                position: fixed;
                bottom: 5px;
                right: 5px;
                font-size: 9px;
                color: var(--text-secondary);
                background: var(--window-bg);
                padding: 2px 5px;
                border-radius: 3px;
                opacity: 0.75;
                border: 1px solid var(--border-dark);
                z-index: 9999;
            }
        </style>
    </head>
    <body>
        <div class="theme-switcher">
            <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
        </div>
        
        <div class="global-banner">
            <marquee behavior="scroll" direction="left" scrollamount="6">
                🎉 UPDATE 1.4: THE "DIAL-UP MODEM" UPDATE HAS COME OUT! 🎉 CHECK OUT /ANALYTICS FOR MORE INFO! 📊 NOW FEATURING: WORKING VOICE CALLS • PLUG-AND-PLAY MICROPHONES • SERVER-SIDE ACCOUNTS • PERSISTENT MESSAGES • STATUS SELECTOR • MOBILE SYNC • P2P FILE SHARING • AND MORE! 🚀
            </marquee>
        </div>
        
        <div class="xp-window">
            <div class="xp-titlebar">
                <span>📊 Skype Classic Analytics</span>
                <div class="xp-titlebar-controls">
                    <div class="xp-button" onclick="window.location='/'">_</div>
                    <div class="xp-button" onclick="window.location='/'">×</div>
                </div>
            </div>
            <div class="xp-content">
                <div class="xp-fieldset">
                    <div class="xp-legend">📈 Usage Statistics</div>
                    
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-title">👥 Online Users</div>
                            <div class="stat-value">${onlineUsers}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-title">💬 Messages Today</div>
                            <div class="stat-value">${messagesToday}</div>
                        </div>
                        <div class="stat-box">
                            <div class="stat-title">👥 Active Groups</div>
                            <div class="stat-value">${totalGroups}</div>
                        </div>
                    </div>
                    
                    <div class="stat-box" style="margin-top: 5px;">
                        <div class="stat-title">📊 Activity Graph (Last 24h)</div>
                        <div class="ascii-art">
${'█'.repeat(Math.min(40, messagesToday))} ${messagesToday} messages
${'█'.repeat(Math.min(40, onlineUsers))} ${onlineUsers} users online
${'█'.repeat(Math.min(40, totalGroups))} ${totalGroups} active groups
                        </div>
                    </div>
                </div>
                
                <div class="whats-new-banner">
                    <div class="whats-new-header">✨ WHAT'S NEW IN UPDATE 1.4 — THE "DIAL-UP MODEM" UPDATE ✨</div>
                    
                    <div class="feature-grid">
                        <div class="feature-card">
                            <div class="feature-card-title"><span>📁</span> P2P File Transfer</div>
                            <div class="feature-card-body">
                                • Send files directly via WebRTC<br>
                                • Peer-to-peer, no server storage<br>
                                • Accept / decline popup<br>
                                • Progress bar with speed & ETA
                            </div>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-card-title"><span>📞</span> Working VoIP Calls</div>
                            <div class="feature-card-body">
                                • Voice calls across browsers<br>
                                • Real-time WebRTC audio<br>
                                • Mute / Deafen controls
                            </div>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-card-title"><span>🟢</span> Status Selector</div>
                            <div class="feature-card-body">
                                • Online / Busy / Away / Invisible<br>
                                • Click your name to change<br>
                                • Syncs across all devices
                            </div>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-card-title"><span>💾</span> Persistent Messages</div>
                            <div class="feature-card-body">
                                • Chat history saved to disk<br>
                                • Survives server restarts<br>
                                • Synced across all your devices
                            </div>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-card-title"><span>📱</span> Mobile Version</div>
                            <div class="feature-card-body">
                                • Access at <strong>/mobile</strong><br>
                                • XP theme matching desktop<br>
                                • Calling + sounds built in
                            </div>
                        </div>
                        
                        <div class="feature-card">
                            <div class="feature-card-title"><span>🐛</span> Bug Fixes</div>
                            <div class="feature-card-body">
                                • Duplicate message renders fixed<br>
                                • ICE candidate queueing improved<br>
                                • Backpressure handling on transfers
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="nav-links">
                    <a href="/">🏠 Home</a>
                    <a href="/mobile">📱 Mobile</a>
                    <a href="/music">🎵 Music</a>
                    <a href="/old">🕹️ Retro</a>
                    <a href="/dev">💻 Dev</a>
                </div>
                
                <div style="text-align: center; margin-top: 15px; color: var(--text-secondary); font-size: 10px;">
                    Last updated: ${new Date().toLocaleTimeString()} • Auto-refreshes every 60 seconds<br>
                    <small>skypeclassic.ru - Your Classic Chat Experience</small>
                </div>
            </div>
            <div class="xp-status-bar">
                <span>📊 Analytics • Live Server Data</span>
            </div>
        </div>
        
        <div class="footer-note">
            Fan project. Not affiliated with Microsoft.
        </div>
        
        <script>
            function toggleTheme() {
                const body = document.body;
                const button = document.getElementById('themeToggle');
                
                body.style.transition = 'background 0.5s ease, color 0.3s ease';
                
                if (body.classList.contains('dark-theme')) {
                    body.classList.remove('dark-theme');
                    button.innerHTML = '🌙 Dark';
                    localStorage.setItem('skypeTheme', 'light');
                } else {
                    body.classList.add('dark-theme');
                    button.innerHTML = '☀️ Light';
                    localStorage.setItem('skypeTheme', 'dark');
                }
            }
            
            function loadTheme() {
                const savedTheme = localStorage.getItem('skypeTheme');
                const body = document.body;
                const button = document.getElementById('themeToggle');
                
                body.style.transition = 'none';
                
                if (savedTheme === 'dark') {
                    body.classList.add('dark-theme');
                    if (button) button.innerHTML = '☀️ Light';
                } else {
                    body.classList.remove('dark-theme');
                    if (button) button.innerHTML = '🌙 Dark';
                }
                
                setTimeout(() => {
                    body.style.transition = '';
                }, 50);
            }
            
            loadTheme();
            
            setTimeout(() => location.reload(), 60000);
        </script>
    </body>
    </html>
    `);
});

// ===== ABOUT ME PAGE =====
app.get('/aboutme', (req, res) => {
    console.log('👤 Serving about me page');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic - About Me</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Tahoma', 'Arial', sans-serif; font-size: 11px; }
            
            :root {
                --bg-primary: #6C00A0;
                --window-bg: #ECE9D8;
                --titlebar-start: #0A246A;
                --titlebar-end: #6B8DC3;
                --border-light: #FFFFFF;
                --border-dark: #808080;
                --text-primary: #000000;
                --text-light: #FFFFFF;
                --button-bg: #ECE9D8;
                --contact-hover: #6C00A0;
                --banner-bg: linear-gradient(90deg, #FFD700, #FFA500);
                --banner-text: #0A246A;
                --text-secondary: #666666;
                --accent: #6C00A0;
            }
            
            .dark-theme {
                --bg-primary: #1a1a1a;
                --window-bg: #2d2d2d;
                --titlebar-start: #2b2b2b;
                --titlebar-end: #4a4a4a;
                --border-light: #4a4a4a;
                --border-dark: #1a1a1a;
                --text-primary: #e0e0e0;
                --text-light: #ffffff;
                --button-bg: #3d3d3d;
                --contact-hover: #4a4a4a;
                --banner-bg: linear-gradient(90deg, #b8860b, #8b4513);
                --banner-text: #ffd700;
                --text-secondary: #b0b0b0;
                --accent: #9b59b6;
            }
            
            body {
                background: var(--bg-primary);
                background-image: url('/images/bbg.jpg');
                background-size: cover;
                background-position: center;
                background-repeat: no-repeat;
                background-attachment: fixed;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                padding: 20px;
                margin: 0;
                padding-top: 65px;
                color: var(--text-primary);
                transition: background-color 0.5s ease, color 0.3s ease;
            }
            
            .dark-theme body {
                background-image: url('/images/dbg.jpg');
            }
            
            .xp-window, .xp-titlebar, .xp-content, .xp-fieldset, .xp-legend, .xp-button-large,
            .skill-item, .project-card, .contact-card, .section-title {
                transition: background-color 0.4s ease, color 0.3s ease, border-color 0.3s ease;
            }
            
            .global-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background: var(--banner-bg);
                border-bottom: 3px solid var(--titlebar-start);
                overflow: hidden;
                padding: 8px 0;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            }
            
            .global-banner marquee {
                background: none;
                color: var(--banner-text);
                text-shadow: 1px 1px 0 rgba(255,255,255,0.5);
                font-family: 'Tahoma', 'Arial', sans-serif;
                font-size: 12px;
            }
            
            .theme-switcher {
                position: fixed;
                top: 55px;
                left: 10px;
                z-index: 9999;
                background: var(--window-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                padding: 3px;
                border-radius: 3px;
            }
            
            .theme-btn {
                background: var(--button-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                padding: 3px 8px;
                font-size: 10px;
                font-weight: bold;
                cursor: pointer;
                color: var(--text-primary);
                margin: 0;
            }
            
            .theme-btn:hover {
                background: var(--contact-hover);
                color: var(--text-light);
            }
            
            .xp-window {
                width: 800px;
                max-width: 100%;
                background: var(--window-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                margin-top: 10px;
            }
            
            .xp-titlebar {
                background: linear-gradient(90deg, var(--titlebar-start), var(--titlebar-end));
                color: var(--text-light);
                padding: 4px 8px;
                font-size: 11px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                align-items: center;
                height: 20px;
            }
            
            .xp-titlebar-controls {
                display: flex;
                gap: 1px;
            }
            
            .xp-button {
                width: 16px;
                height: 14px;
                border: 1px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                background: var(--button-bg);
                font-size: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                line-height: 1;
                color: var(--text-primary);
            }
            
            .xp-content {
                padding: 15px;
                background: var(--window-bg);
                max-height: 80vh;
                overflow-y: auto;
            }
            
            .xp-fieldset {
                border: 1px solid var(--border-dark);
                padding: 15px;
                margin-bottom: 15px;
                background: var(--window-bg);
                position: relative;
            }
            
            .xp-legend {
                background: var(--window-bg);
                padding: 2px 8px;
                font-size: 11px;
                font-weight: bold;
                position: absolute;
                top: -8px;
                left: 8px;
                color: var(--text-primary);
            }
            
            .xp-button-large {
                background: var(--button-bg);
                border: 2px solid;
                border-top-color: var(--border-light);
                border-left-color: var(--border-light);
                border-right-color: var(--border-dark);
                border-bottom-color: var(--border-dark);
                padding: 5px 20px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                margin-right: 10px;
                color: var(--text-primary);
            }
            
            .xp-button-large:hover {
                background: var(--contact-hover);
                color: var(--text-light);
            }
            
            .xp-status-bar {
                background: var(--window-bg);
                border-top: 1px solid var(--border-dark);
                padding: 4px 8px;
                font-size: 10px;
                color: var(--text-primary);
                height: 20px;
            }
            
            .profile-header {
                display: flex;
                gap: 20px;
                align-items: center;
                padding: 20px;
                background: linear-gradient(135deg, var(--titlebar-start), var(--titlebar-end));
                color: var(--text-light);
                border-radius: 4px;
                margin-bottom: 15px;
            }
            
            .profile-avatar {
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: linear-gradient(135deg, #6C00A0, #0A246A);
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 32px;
                border: 3px solid rgba(255,255,255,0.3);
                flex-shrink: 0;
            }
            
            .profile-info h1 {
                font-size: 24px;
                margin-bottom: 5px;
            }
            
            .profile-info .subtitle {
                font-size: 13px;
                opacity: 0.9;
                margin-bottom: 8px;
            }
            
            .profile-links {
                display: flex;
                gap: 10px;
                flex-wrap: wrap;
            }
            
            .profile-links a {
                color: var(--text-light);
                text-decoration: none;
                font-size: 11px;
                background: rgba(255,255,255,0.15);
                padding: 4px 10px;
                border-radius: 12px;
                border: 1px solid rgba(255,255,255,0.2);
            }
            
            .profile-links a:hover {
                background: rgba(255,255,255,0.25);
            }
            
            .section-title {
                font-size: 13px;
                font-weight: bold;
                color: var(--titlebar-start);
                margin-bottom: 10px;
                padding-bottom: 5px;
                border-bottom: 1px solid var(--border-dark);
            }
            
            .dark-theme .section-title {
                color: var(--accent);
            }
            
            .skill-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 10px;
                margin-bottom: 5px;
                background: var(--window-bg);
                border: 1px solid var(--border-dark);
                border-radius: 3px;
            }
            
            .skill-item:hover {
                background: var(--contact-hover);
                color: var(--text-light);
            }
            
            .skill-icon {
                font-size: 16px;
                width: 24px;
                text-align: center;
                flex-shrink: 0;
            }
            
            .skill-text {
                flex: 1;
            }
            
            .skill-level {
                font-size: 10px;
                opacity: 0.8;
                font-style: italic;
            }
            
            .project-card {
                padding: 15px;
                margin-bottom: 10px;
                background: var(--window-bg);
                border: 1px solid var(--border-dark);
                border-radius: 3px;
                border-left: 4px solid var(--accent);
            }
            
            .project-card h4 {
                font-size: 13px;
                margin-bottom: 5px;
                color: var(--accent);
            }
            
            .project-card p {
                font-size: 11px;
                color: var(--text-secondary);
                line-height: 1.5;
                margin-bottom: 5px;
            }
            
            .project-card ul {
                margin-left: 20px;
                margin-top: 5px;
            }
            
            .project-card li {
                font-size: 11px;
                color: var(--text-secondary);
                line-height: 1.6;
            }
            
            .contact-card {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 15px;
                background: var(--window-bg);
                border: 1px solid var(--border-dark);
                border-radius: 3px;
                margin-bottom: 5px;
                text-decoration: none;
                color: var(--text-primary);
            }
            
            .contact-card:hover {
                background: var(--contact-hover);
                color: var(--text-light);
            }
            
            .contact-icon {
                font-size: 18px;
                width: 30px;
                text-align: center;
                flex-shrink: 0;
            }
            
            .contact-label {
                font-size: 10px;
                opacity: 0.7;
            }
            
            .contact-value {
                font-size: 12px;
                font-weight: bold;
            }
            
            .lang-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 8px 10px;
                border-bottom: 1px solid var(--border-dark);
            }
            
            .lang-item:last-child {
                border-bottom: none;
            }
            
            .lang-name {
                font-weight: bold;
            }
            
            .lang-level {
                font-size: 10px;
                background: var(--accent);
                color: white;
                padding: 2px 8px;
                border-radius: 10px;
            }
            
            .nav-links {
                text-align: center;
                margin-top: 15px;
                padding-top: 15px;
                border-top: 1px solid var(--border-dark);
            }
            
            .nav-links a {
                color: var(--titlebar-start);
                margin: 0 10px;
                text-decoration: none;
                font-weight: bold;
            }
            
            .dark-theme .nav-links a {
                color: var(--accent);
            }
            
            .nav-links a:hover {
                text-decoration: underline;
            }
            
            .tagline {
                text-align: center;
                padding: 10px;
                font-size: 12px;
                color: var(--text-secondary);
                font-style: italic;
                background: var(--window-bg);
                border: 1px dashed var(--border-dark);
                border-radius: 3px;
                margin-bottom: 15px;
            }
        </style>
    </head>
    <body>
        <div class="theme-switcher">
            <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
        </div>
        
        <div class="global-banner">
            <marquee behavior="scroll" direction="left" scrollamount="6">
                👋 HEY THERE! WELCOME TO MY ABOUT ME PAGE! 🎓 STUDENT AT HSE LYCEUM • 💻 PYTHON & C++ DEVELOPER • 🚀 CREATOR OF SKYPECLASSIC • 🤖 AI ENTHUSIAST
            </marquee>
        </div>
        
        <div class="xp-window">
            <div class="xp-titlebar">
                <span>👤 About Me - Timofey Levykin</span>
                <div class="xp-titlebar-controls">
                    <div class="xp-button" onclick="window.location='/'">_</div>
                    <div class="xp-button" onclick="window.location='/'">×</div>
                </div>
            </div>
            <div class="xp-content">
                <div class="profile-header">
                    <div class="profile-avatar">TL</div>
                    <div class="profile-info">
                        <h1>Timofey Levykin</h1>
                        <div class="subtitle">🎓 Student at HSE Lyceum • 💻 Developer • 🚀 Creator of SkypeClassic • 😛 Silly Goober</div>
                        <div class="profile-links">
                            <a href="https://github.com/JoyConYT" target="_blank">🐙 GitHub</a>
                            <a href="https://t.me/JoyConYT" target="_blank">✈️ Telegram</a>
                            <a href="https://skypeclassic.ru/aboutme" target="_blank">🌐 skypeclassic.ru</a>
                            <a href="mailto:rbevruyb@gmail.com">📧 Email</a>
                        </div>
                    </div>
                </div>
                
                <div class="tagline">
                    "I'm a student who loves programming and building digital projects. I'm self-learning Python and C++, and I'm always exploring AI tools. Also, goofing around is present in my daily schedule."
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">👋 About Me</div>
                    <p style="line-height: 1.7; font-size: 12px;">
                        I'm a student at HSE Lyceum in Moscow. I'm passionate about programming and building 
                        digital projects. I'm self-learning Python and C++, and I'm also developing my skills 
                        with AI tools. I'm looking for opportunities to apply my skills in practice, grow in 
                        interesting projects, and gain my first experience in the IT field.
                    </p>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">🛠️ Skills</div>
                    
                    <div class="section-title">💻 Hard Skills</div>
                    <div class="skill-item">
                        <div class="skill-icon">🐍</div>
                        <div class="skill-text">
                            <strong>Python</strong>
                            <div class="skill-level">Confident level</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">⚡</div>
                        <div class="skill-text">
                            <strong>C++</strong>
                            <div class="skill-level">Basic knowledge</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🤖</div>
                        <div class="skill-text">
                            <strong>Prompt Engineering</strong>
                            <div class="skill-level">Writing effective prompts for AI tools</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🌐</div>
                        <div class="skill-text">
                            <strong>Digital Project Development</strong>
                            <div class="skill-level">Building and launching my own projects</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🔍</div>
                        <div class="skill-text">
                            <strong>Information Analysis</strong>
                            <div class="skill-level">Searching, filtering & analyzing information online</div>
                        </div>
                    </div>
                    
                    <div class="section-title" style="margin-top: 15px;">🧰 Programs & Digital Tools</div>
                    <div class="skill-item">
                        <div class="skill-icon">💻</div>
                        <div class="skill-text">
                            <strong>VS Code, Python IDLE</strong>
                            <div class="skill-level">Development environments</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🤖</div>
                        <div class="skill-text">
                            <strong>ChatGPT, Claude & DeepSeek</strong>
                            <div class="skill-level">AI tools</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🎨</div>
                        <div class="skill-text">
                            <strong>Graphic Editors</strong>
                            <div class="skill-level">Creating & editing images (UI elements, icons)</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">💬</div>
                        <div class="skill-text">
                            <strong>Discord, Telegram</strong>
                            <div class="skill-level">Collaboration tools</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">📊</div>
                        <div class="skill-text">
                            <strong>Microsoft Word, PowerPoint</strong>
                            <div class="skill-level">Office software</div>
                        </div>
                    </div>
                    
                    <div class="section-title" style="margin-top: 15px;">🌟 Soft Skills</div>
                    <div class="skill-item">
                        <div class="skill-icon">📚</div>
                        <div class="skill-text">
                            <strong>Self-Learning</strong>
                            <div class="skill-level">Passion for learning new things</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">⏰</div>
                        <div class="skill-text">
                            <strong>Deadline Management</strong>
                            <div class="skill-level">Ability to meet deadlines</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🎨</div>
                        <div class="skill-text">
                            <strong>Creativity & Attention to Detail</strong>
                            <div class="skill-level">Creative and detail-oriented</div>
                        </div>
                    </div>
                    <div class="skill-item">
                        <div class="skill-icon">🚀</div>
                        <div class="skill-text">
                            <strong>Independent Work</strong>
                            <div class="skill-level">Productive when working on my own projects</div>
                        </div>
                    </div>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">🌍 Languages</div>
                    <div class="lang-item">
                        <span class="lang-name">🇷🇺 Russian</span>
                        <span class="lang-level">Native</span>
                    </div>
                    <div class="lang-item">
                        <span class="lang-name">🇬🇧 English</span>
                        <span class="lang-level">C1</span>
                    </div>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">🚀 Projects</div>
                    
                    <div class="project-card">
                        <h4>📞 SkypeClassic — skypeclassic.ru</h4>
                        <p>A web messenger inspired by the classic Skype look and feel.</p>
                        <ul>
                            <li>Developed the concept and functionality of the messenger</li>
                            <li>Drew all images and graphic elements myself</li>
                            <li>Made all UI/UX decisions: designed the look, layout, and usability</li>
                            <li>Built the project using modern development tools</li>
                        </ul>
                    </div>
                    
                    <div class="project-card">
                        <h4>🎵 Music Sharing Platform</h4>
                        <p>A music sharing platform built into SkypeClassic.</p>
                        <ul>
                            <li>Upload and listen to tracks</li>
                            <li>Like system and playlists</li>
                            <li>Follow artists and get notifications</li>
                        </ul>
                    </div>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">🏆 Achievements & Extracurriculars</div>
                    <ul style="margin-left: 20px; line-height: 1.8; font-size: 12px;">
                        <li>✅ Developed and launched my own web project (skypeclassic messenger)</li>
                        <li>✅ Successfully balance school with fun programming, which has developed my development and AI skills</li>
                        <li>✅ Built a full messenger with voice calls, groups, and image sharing</li>
                    </ul>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">🎓 Education</div>
                    <div style="padding: 10px;">
                        <div style="font-size: 14px; font-weight: bold; color: var(--accent); margin-bottom: 5px;">
                            HSE Lyceum
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">
                            Moscow
                        </div>
                        <div style="font-size: 12px;">
                            <strong>8th grade student</strong>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary); margin-top: 5px;">
                            Period: 20__ — present
                        </div>
                        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border-dark);">
                            <div style="font-size: 12px; font-weight: bold; margin-bottom: 5px;">
                                Additional courses:
                            </div>
                            <div style="font-size: 11px; color: var(--text-secondary);">
                                Additional programming classes
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="xp-fieldset">
                    <div class="xp-legend">📬 Contact</div>
                    <a href="mailto:rbevruyb@gmail.com" class="contact-card">
                        <div class="contact-icon">📧</div>
                        <div>
                            <div class="contact-label">Email</div>
                            <div class="contact-value">rbevruyb@gmail.com</div>
                        </div>
                    </a>
                    <a href="https://t.me/JoyConYT" target="_blank" class="contact-card">
                        <div class="contact-icon">✈️</div>
                        <div>
                            <div class="contact-label">Telegram</div>
                            <div class="contact-value">@JoyConYT</div>
                        </div>
                    </a>
                    <a href="https://github.com/JoyConYT" target="_blank" class="contact-card">
                        <div class="contact-icon">🐙</div>
                        <div>
                            <div class="contact-label">GitHub</div>
                            <div class="contact-value">github.com/JoyConYT</div>
                        </div>
                    </a>
                    <a href="tel:+79191055212" class="contact-card">
                        <div class="contact-icon">📱</div>
                        <div>
                            <div class="contact-label">Phone</div>
                            <div class="contact-value">+7 (919) 105 52 12</div>
                        </div>
                    </a>
                    <a href="https://skypeclassic.ru/aboutme" target="_blank" class="contact-card">
                        <div class="contact-icon">🌐</div>
                        <div>
                            <div class="contact-label">Website</div>
                            <div class="contact-value">skypeclassic.ru/aboutme (📍You're Here)</div>
                        </div>
                    </a>
                    <div class="contact-card" style="cursor: default;">
                        <div class="contact-icon">📍</div>
                        <div>
                            <div class="contact-label">City</div>
                            <div class="contact-value">Moscow</div>
                        </div>
                    </div>
                </div>
                
                <div class="nav-links">
                    <a href="/">🏠 Home</a>
                    <a href="/mobile">📱 Mobile</a>
                    <a href="/analytics">📊 Analytics</a>
                    <a href="/music">🎵 Music</a>
                    <a href="/old">🕹️ Retro</a>
                    <a href="/dev">💻 Dev</a>
                </div>
                
                <div style="text-align: center; margin-top: 15px; color: var(--text-secondary); font-size: 10px;">
                    Made with 💜 by Timothy (JoyCon) • skypeclassic.ru
                </div>
            </div>
            <div class="xp-status-bar">
                <span>👤 About Me • Timofey Levykin • Moscow</span>
            </div>
        </div>
        
        <script>
            function toggleTheme() {
                const body = document.body;
                const button = document.getElementById('themeToggle');
                
                body.style.transition = 'background 0.5s ease, color 0.3s ease';
                
                if (body.classList.contains('dark-theme')) {
                    body.classList.remove('dark-theme');
                    button.innerHTML = '🌙 Dark';
                    localStorage.setItem('skypeTheme', 'light');
                } else {
                    body.classList.add('dark-theme');
                    button.innerHTML = '☀️ Light';
                    localStorage.setItem('skypeTheme', 'dark');
                }
            }
            
            function loadTheme() {
                const savedTheme = localStorage.getItem('skypeTheme');
                const body = document.body;
                const button = document.getElementById('themeToggle');
                
                body.style.transition = 'none';
                
                if (savedTheme === 'dark') {
                    body.classList.add('dark-theme');
                    if (button) button.innerHTML = '☀️ Light';
                } else {
                    body.classList.remove('dark-theme');
                    if (button) button.innerHTML = '🌙 Dark';
                }
                
                setTimeout(() => {
                    body.style.transition = '';
                }, 50);
            }
            
            document.addEventListener('DOMContentLoaded', loadTheme);
        </script>
        
        <div style="position: fixed; bottom: 5px; right: 5px; font-size: 9px; color: #666; background: rgba(255,255,255,0.7); padding: 2px 5px; border-radius: 3px;">
            Fan project. Not affiliated with Microsoft or Skype in any way.
        </div>
    </body>
    </html>
    `);
});

// ===== MUSIC SHARING PAGE =====
let musicPosts = [
    {
        id: 1,
        username: 'levyk',
        displayName: 'Levy K',
        title: 'Chill Lofi Study Mix',
        description: 'Perfect for coding and studying - 24/7 lofi beats',
        filename: 'lofi-study.mp3',
        timestamp: new Date().toISOString(),
        likes: 42,
        plays: 128,
        genre: 'Lofi'
    },
    {
        id: 2,
        username: 'test',
        displayName: 'Test User',
        title: '80s Retro Synthwave',
        description: 'Drive soundtrack vibes - perfect nostalgia',
        filename: 'synthwave-80s.mp3',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        likes: 38,
        plays: 95,
        genre: 'Synthwave'
    },
    {
        id: 3,
        username: 'admin',
        displayName: 'Admin',
        title: 'Classical Coding',
        description: 'Mozart and Bach for focused programming sessions',
        filename: 'classical-coding.mp3',
        timestamp: new Date(Date.now() - 172800000).toISOString(),
        likes: 56,
        plays: 203,
        genre: 'Classical'
    }
];

let userPlaylists = new Map();
let musicNotifications = [];

const uploadsDir = path.join(__dirname, 'public', 'music_uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use('/music/uploads', express.static(uploadsDir));

app.get('/music', (req, res) => {
    console.log('🎵 Serving music sharing page');
    
    const currentUser = req.query.username || null;
    const userDisplay = req.query.display || (currentUser === 'test' ? 'Test User' : currentUser);
    
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic - Music Sharing</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Tahoma', 'Arial', sans-serif; }
            body { 
                background: #6C00A0; 
                display: flex; 
                justify-content: center; 
                align-items: center; 
                min-height: 100vh; 
                padding: 20px;
                padding-top: 65px;
            }
            .global-banner {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                background: linear-gradient(90deg, #FFD700, #FFA500);
                border-bottom: 3px solid #0A246A;
                overflow: hidden;
                padding: 8px 0;
                z-index: 9999;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
            }
            .xp-window { 
                width: 900px; 
                background: #ECE9D8; 
                border: 2px solid; 
                border-top-color: #FFFFFF; 
                border-left-color: #FFFFFF; 
                border-right-color: #000000; 
                border-bottom-color: #000000;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            }
            .xp-titlebar { 
                background: linear-gradient(90deg, #0A246A, #A6CAF0); 
                color: white; 
                padding: 5px 10px; 
                font-weight: bold; 
                display: flex; 
                justify-content: space-between; 
                align-items: center;
            }
            .xp-content { 
                padding: 20px; 
                max-height: 80vh;
                overflow-y: auto;
            }
            .login-section {
                background: white;
                border: 2px solid #0A246A;
                padding: 20px;
                margin-bottom: 20px;
                text-align: center;
            }
            .login-input {
                padding: 8px;
                margin: 5px;
                width: 200px;
                border: 2px solid;
                border-top-color: #808080;
                border-left-color: #808080;
                border-right-color: #FFFFFF;
                border-bottom-color: #FFFFFF;
            }
            .login-btn {
                background: #6C00A0;
                color: white;
                padding: 8px 20px;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #4B0082;
                border-bottom-color: #4B0082;
                cursor: pointer;
                font-weight: bold;
            }
            .login-btn:hover {
                background: #7C00B0;
            }
            .user-info {
                background: #0A246A;
                color: white;
                padding: 15px;
                margin-bottom: 20px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #000080;
                border-bottom-color: #000080;
            }
            .music-post { 
                background: white; 
                border: 2px solid; 
                border-top-color: #FFFFFF; 
                border-left-color: #FFFFFF; 
                border-right-color: #808080; 
                border-bottom-color: #808080;
                padding: 20px; 
                margin: 20px 0; 
            }
            .music-header { 
                display: flex; 
                justify-content: space-between; 
                align-items: center;
                margin-bottom: 15px; 
                padding-bottom: 10px;
                border-bottom: 1px solid #E0E0E0;
            }
            .music-user { 
                font-weight: bold; 
                color: #0A246A;
                font-size: 16px;
            }
            .music-title { 
                font-size: 20px; 
                color: #6C00A0; 
                margin-bottom: 10px;
                font-weight: bold;
            }
            .music-desc { 
                color: #404040; 
                margin-bottom: 15px;
                line-height: 1.5;
            }
            .music-genre {
                display: inline-block;
                background: #E0E0E0;
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 12px;
                margin-bottom: 10px;
            }
            .audio-player { 
                width: 100%; 
                margin: 15px 0; 
                background: #000000;
            }
            .music-stats {
                display: flex;
                gap: 20px;
                margin: 10px 0;
                color: #666;
                font-size: 14px;
            }
            .music-actions { 
                display: flex; 
                gap: 10px; 
                margin-top: 15px; 
                flex-wrap: wrap;
            }
            .like-btn { 
                background: #008000; 
                color: white; 
                padding: 8px 15px; 
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #006000;
                border-bottom-color: #006000;
                cursor: pointer; 
                font-weight: bold;
            }
            .like-btn:hover { background: #009000; }
            .playlist-btn { 
                background: #FF8C00; 
                color: white; 
                padding: 8px 15px; 
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #B05E00;
                border-bottom-color: #B05E00;
                cursor: pointer;
                font-weight: bold;
            }
            .playlist-btn:hover { background: #FF9500; }
            .follow-btn { 
                background: #1E90FF; 
                color: white; 
                padding: 8px 15px; 
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #0B5E9E;
                border-bottom-color: #0B5E9E;
                cursor: pointer;
                font-weight: bold;
            }
            .follow-btn:hover { background: #3AA0FF; }
            .delete-btn { 
                background: #C00000; 
                color: white; 
                padding: 8px 15px; 
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #900000;
                border-bottom-color: #900000;
                cursor: pointer;
                font-weight: bold;
            }
            .delete-btn:hover { background: #D00000; }
            .share-form { 
                background: #D4D0C8; 
                padding: 25px; 
                margin: 30px 0; 
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
            }
            .form-group { margin-bottom: 20px; }
            .form-group label { 
                display: block; 
                margin-bottom: 8px; 
                color: #0A246A; 
                font-weight: bold;
                font-size: 14px;
            }
            .form-group input, .form-group textarea, .form-group select { 
                width: 100%; 
                padding: 10px; 
                border: 2px solid;
                border-top-color: #808080;
                border-left-color: #808080;
                border-right-color: #FFFFFF;
                border-bottom-color: #FFFFFF;
                background: white;
                font-family: 'Tahoma', 'Arial', sans-serif;
            }
            .form-group textarea { 
                height: 80px; 
                resize: vertical;
            }
            .file-input {
                padding: 10px;
                background: white;
            }
            .stats-bar {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                gap: 15px;
                background: #0A246A;
                color: white;
                padding: 20px;
                margin: 20px 0;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #000080;
                border-bottom-color: #000080;
            }
            .stat-item {
                text-align: center;
            }
            .stat-number {
                font-size: 28px;
                font-weight: bold;
                color: #FFD700;
            }
            .stat-label {
                font-size: 12px;
                opacity: 0.9;
            }
            .tabs {
                display: flex;
                gap: 2px;
                margin-bottom: 20px;
                flex-wrap: wrap;
            }
            .tab {
                padding: 10px 20px;
                background: #D4D0C8;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
                cursor: pointer;
                font-weight: bold;
            }
            .tab.active {
                background: #ECE9D8;
                border-bottom-color: #ECE9D8;
            }
            .tab-content {
                display: none;
            }
            .tab-content.active {
                display: block;
            }
            .playlist-item {
                background: white;
                border: 1px solid #ccc;
                padding: 15px;
                margin: 10px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .notification {
                background: #E0F0FF;
                border: 2px solid #1E90FF;
                padding: 10px;
                margin: 10px 0;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .nav-links {
                text-align: center;
                margin-top: 30px;
                padding-top: 20px;
                border-top: 2px solid #C0C0C0;
            }
            .nav-links a {
                color: #0A246A;
                margin: 0 15px;
                text-decoration: none;
                font-weight: bold;
            }
            .message {
                padding: 10px;
                margin: 10px 0;
                border: 2px solid;
                display: none;
            }
            .message.success {
                display: block;
                background: #DFF0D8;
                border-color: #4CAF50;
                color: #2E7D32;
            }
            .message.error {
                display: block;
                background: #F2DEDE;
                border-color: #C00000;
                color: #C00000;
            }
        </style>
    </head>
    <body>
        <div class="global-banner">
            <marquee behavior="scroll" direction="left" scrollamount="6" style="color: #0A246A; font-weight: bold; font-size: 14px;">
                🎉 UPDATE 1.5: THE "P2P FILE TRANSFER" UPDATE IS HERE! 🎉 SEND FILES DIRECTLY TO FRIENDS! 📁
            </marquee>
        </div>
        
        <div class="xp-window">
            <div class="xp-titlebar">
                <span>🎵 Skype Classic Music Sharing</span>
                <div style="display: flex; gap: 3px;">
                    <div class="xp-button" onclick="window.location='/'">_</div>
                    <div class="xp-button" onclick="window.location='/'">×</div>
                </div>
            </div>
            <div class="xp-content">
                <div id="loginSection" class="login-section" ${currentUser ? 'style="display:none;"' : ''}>
                    <h3 style="color: #0A246A; margin-bottom: 15px;">🔐 Login to Music Sharing</h3>
                    <input type="text" id="musicUsername" class="login-input" placeholder="Username" value="test">
                    <input type="password" id="musicPassword" class="login-input" placeholder="Password" value="test">
                    <button class="login-btn" onclick="musicLogin()">Login</button>
                    <p style="margin-top: 10px; color: #666; font-size: 12px;">Demo: test/test or use your Skype Classic account</p>
                </div>
                
                <div id="userInfo" class="user-info" ${currentUser ? '' : 'style="display:none;"'}>
                    <div>
                        <span style="font-size: 18px;">👋 Welcome, <span id="displayName">${userDisplay || 'Guest'}</span>!</span>
                        <span style="margin-left: 20px; color: #A0C0FF;">⭐ Music Creator</span>
                    </div>
                    <div>
                        <button class="logout-btn" onclick="musicLogout()" style="background: none; border: 1px solid white; color: white; padding: 5px 15px; cursor: pointer;">Logout</button>
                    </div>
                </div>
                
                <div class="stats-bar">
                    <div class="stat-item">
                        <div class="stat-number" id="totalTracks">${musicPosts.length}</div>
                        <div class="stat-label">Total Tracks</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" id="totalLikes">${musicPosts.reduce((sum, post) => sum + post.likes, 0)}</div>
                        <div class="stat-label">Total Likes</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" id="totalPlays">${musicPosts.reduce((sum, post) => sum + post.plays, 0)}</div>
                        <div class="stat-label">Total Plays</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-number" id="totalArtists">${new Set(musicPosts.map(p => p.username)).size}</div>
                        <div class="stat-label">Active Artists</div>
                    </div>
                </div>
                
                <div id="messageBox" class="message"></div>
                
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('discover')">🎵 Discover</div>
                    <div class="tab" onclick="switchTab('upload')">📤 Upload</div>
                    <div class="tab" onclick="switchTab('playlists')">📋 My Playlists</div>
                    <div class="tab" onclick="switchTab('following')">👥 Following</div>
                    <div class="tab" onclick="switchTab('notifications')">🔔 Notifications</div>
                </div>
                
                <div id="discoverTab" class="tab-content active">
                    <div style="margin-bottom: 20px;">
                        <select id="genreFilter" onchange="filterByGenre()" style="padding: 8px; margin-right: 10px;">
                            <option value="all">All Genres</option>
                            <option value="Lofi">Lofi</option>
                            <option value="Synthwave">Synthwave</option>
                            <option value="Classical">Classical</option>
                            <option value="Electronic">Electronic</option>
                            <option value="Rock">Rock</option>
                            <option value="Jazz">Jazz</option>
                        </select>
                        <input type="text" id="searchTracks" placeholder="🔍 Search tracks..." style="padding: 8px; width: 200px;" onkeyup="searchMusic()">
                    </div>
                    
                    <div id="musicFeed">
                        ${musicPosts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).map(post => `
                            <div class="music-post" data-genre="${post.genre || 'Unknown'}" data-title="${post.title.toLowerCase()}" data-artist="${post.displayName.toLowerCase()}">
                                <div class="music-header">
                                    <div>
                                        <span class="music-user">🎤 ${post.displayName || post.username}</span>
                                        <span style="margin-left: 15px; color: #808080; font-size: 14px;">
                                            📅 ${new Date(post.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <span class="music-genre">${post.genre || 'Various'}</span>
                                </div>
                                <div class="music-title">🎵 ${post.title}</div>
                                <div class="music-desc">${post.description}</div>
                                
                                <audio controls class="audio-player" onplay="trackPlayed(${post.id})">
                                    <source src="/music/uploads/${post.filename}" type="audio/mpeg">
                                    <source src="/music/files/${post.filename}" type="audio/mpeg">
                                    Your browser does not support audio.
                                </audio>
                                
                                <div class="music-stats">
                                    <span>❤️ ${post.likes} likes</span>
                                    <span>▶️ ${post.plays || 0} plays</span>
                                </div>
                                
                                <div class="music-actions">
                                    <button class="like-btn" onclick="likeTrack(${post.id})">❤️ Like (${post.likes})</button>
                                    <button class="playlist-btn" onclick="addToPlaylist(${post.id})">➕ Add to Playlist</button>
                                    <button class="follow-btn" onclick="followArtist('${post.username}')">👤 Follow ${post.displayName}</button>
                                    ${currentUser === post.username ? `<button class="delete-btn" onclick="deleteTrack(${post.id})">🗑️ Delete</button>` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                
                <div id="uploadTab" class="tab-content">
                    <div class="share-form">
                        <h3 style="color: #0A246A; margin-bottom: 20px;">📤 Upload Your Music</h3>
                        
                        <div class="form-group">
                            <label>🎵 Track Title *</label>
                            <input type="text" id="trackTitle" placeholder="e.g., My Awesome Beat">
                        </div>
                        
                        <div class="form-group">
                            <label>📝 Description</label>
                            <textarea id="trackDesc" placeholder="Tell us about your track..."></textarea>
                        </div>
                        
                        <div class="form-group">
                            <label>🎼 Genre</label>
                            <select id="trackGenre">
                                <option value="Lofi">Lofi</option>
                                <option value="Synthwave">Synthwave</option>
                                <option value="Classical">Classical</option>
                                <option value="Electronic">Electronic</option>
                                <option value="Rock">Rock</option>
                                <option value="Jazz">Jazz</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        
                        <div class="form-group">
                            <label>📁 MP3 File *</label>
                            <input type="file" id="musicFile" accept=".mp3,audio/mpeg" class="file-input">
                            <div style="font-size: 12px; color: #666; margin-top: 5px;">Max size: 10MB</div>
                        </div>
                        
                        <button class="login-btn" onclick="uploadMusic()" style="width: 100%;">Upload Track</button>
                    </div>
                </div>
                
                <div id="playlistsTab" class="tab-content">
                    <div style="margin-bottom: 20px;">
                        <button class="login-btn" onclick="createPlaylist()">➕ Create New Playlist</button>
                    </div>
                    <div id="playlistContainer">
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">📋</div>
                            <h3>No playlists yet</h3>
                            <p>Create your first playlist!</p>
                        </div>
                    </div>
                </div>
                
                <div id="followingTab" class="tab-content">
                    <div id="followingContainer">
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">👥</div>
                            <h3>Not following anyone</h3>
                            <p>Follow artists to see their new music</p>
                        </div>
                    </div>
                </div>
                
                <div id="notificationsTab" class="tab-content">
                    <div id="notificationsContainer">
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">🔔</div>
                            <h3>No notifications</h3>
                            <p>When artists you follow upload new music, you'll see it here</p>
                        </div>
                    </div>
                </div>
                
                <div class="nav-links">
                    <a href="/">← Back to Main Chat</a>
                    <a href="/mobile">📱 Mobile</a>
                    <a href="/analytics">📊 Analytics</a>
                    <a href="/old">🕹️ Retro</a>
                    <a href="/dev">💻 Dev</a>
                </div>
            </div>
        </div>
        
        <script>
            let currentMusicUser = ${currentUser ? `"${currentUser}"` : 'null'};
            let userDisplayName = ${userDisplay ? `"${userDisplay}"` : 'null'};
            let userPlaylists = [];
            let following = [];
            let notifications = [];
            
            if (currentMusicUser) {
                loadUserData();
            }
            
            async function musicLogin() {
                const username = document.getElementById('musicUsername').value.trim();
                const password = document.getElementById('musicPassword').value.trim();
                
                if (!username || !password) {
                    showMessage('❌ Please enter username and password', 'error');
                    return;
                }
                
                try {
                    const res = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const result = await res.json();
                    
                    if (result.success) {
                        currentMusicUser = username;
                        userDisplayName = result.displayName || username;
                        
                        document.getElementById('loginSection').style.display = 'none';
                        document.getElementById('userInfo').style.display = 'block';
                        document.getElementById('displayName').textContent = userDisplayName;
                        
                        loadUserData();
                        showMessage('✅ Login successful! Welcome to Music Sharing!', 'success');
                        
                        window.history.pushState({}, '', '/music?username=' + username + '&display=' + userDisplayName);
                    } else {
                        showMessage('❌ ' + (result.error || 'Invalid credentials'), 'error');
                    }
                } catch (e) {
                    console.error('Music login error:', e);
                    showMessage('❌ Login failed. Check server connection.', 'error');
                }
            }
            
            function musicLogout() {
                currentMusicUser = null;
                userDisplayName = null;
                
                document.getElementById('loginSection').style.display = 'block';
                document.getElementById('userInfo').style.display = 'none';
                
                window.history.pushState({}, '', '/music');
                showMessage('👋 Logged out successfully', 'success');
            }
            
            function loadUserData() {
                const saved = localStorage.getItem('music_playlists_' + currentMusicUser);
                if (saved) {
                    userPlaylists = JSON.parse(saved);
                    renderPlaylists();
                }
                
                const followingSaved = localStorage.getItem('music_following_' + currentMusicUser);
                if (followingSaved) {
                    following = JSON.parse(followingSaved);
                    renderFollowing();
                }
                
                loadNotifications();
            }
            
            function showMessage(text, type) {
                const msgBox = document.getElementById('messageBox');
                msgBox.textContent = text;
                msgBox.className = 'message ' + type;
                
                setTimeout(() => {
                    msgBox.style.display = 'none';
                }, 3000);
            }
            
            function switchTab(tabName) {
                document.querySelectorAll('.tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                event.target.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(tabName + 'Tab').classList.add('active');
                
                if (tabName === 'playlists') renderPlaylists();
                if (tabName === 'following') renderFollowing();
                if (tabName === 'notifications') renderNotifications();
            }
            
            function filterByGenre() {
                const genre = document.getElementById('genreFilter').value;
                const posts = document.querySelectorAll('.music-post');
                
                posts.forEach(post => {
                    if (genre === 'all' || post.dataset.genre === genre) {
                        post.style.display = 'block';
                    } else {
                        post.style.display = 'none';
                    }
                });
            }
            
            function searchMusic() {
                const searchTerm = document.getElementById('searchTracks').value.toLowerCase();
                const posts = document.querySelectorAll('.music-post');
                
                posts.forEach(post => {
                    const title = post.dataset.title || '';
                    const artist = post.dataset.artist || '';
                    if (title.includes(searchTerm) || artist.includes(searchTerm)) {
                        post.style.display = 'block';
                    } else {
                        post.style.display = 'none';
                    }
                });
            }
            
            function trackPlayed(trackId) {
                fetch('/music/play', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ trackId: trackId })
                });
            }
            
            function likeTrack(trackId) {
                if (!currentMusicUser) {
                    showMessage('Please login to like tracks', 'error');
                    return;
                }
                
                fetch('/music/like', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        trackId: trackId,
                        username: currentMusicUser 
                    })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        showMessage('❤️ Track liked!', 'success');
                        location.reload();
                    }
                });
            }
            
            function addToPlaylist(trackId) {
                if (!currentMusicUser) {
                    showMessage('Please login to create playlists', 'error');
                    return;
                }
                
                if (userPlaylists.length === 0) {
                    if (confirm('No playlists yet. Create one now?')) {
                        createPlaylist();
                    }
                    return;
                }
                
                const playlistNames = userPlaylists.map(p => p.name).join('\\n');
                const choice = prompt('Enter playlist name to add to:\\n\\n' + playlistNames);
                
                if (choice) {
                    const playlist = userPlaylists.find(p => p.name.toLowerCase() === choice.toLowerCase());
                    if (playlist) {
                        if (!playlist.tracks) playlist.tracks = [];
                        if (!playlist.tracks.includes(trackId)) {
                            playlist.tracks.push(trackId);
                            savePlaylists();
                            showMessage('✅ Added to playlist: ' + playlist.name, 'success');
                        } else {
                            showMessage('Track already in playlist', 'error');
                        }
                    } else {
                        showMessage('Playlist not found', 'error');
                    }
                }
            }
            
            function followArtist(username) {
                if (!currentMusicUser) {
                    showMessage('Please login to follow artists', 'error');
                    return;
                }
                
                if (username === currentMusicUser) {
                    showMessage("You can't follow yourself", 'error');
                    return;
                }
                
                if (!following.includes(username)) {
                    following.push(username);
                    localStorage.setItem('music_following_' + currentMusicUser, JSON.stringify(following));
                    
                    const notification = {
                        id: Date.now(),
                        type: 'follow',
                        from: currentMusicUser,
                        to: username,
                        timestamp: new Date().toISOString()
                    };
                    
                    fetch('/music/notification', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(notification)
                    });
                    
                    showMessage('✅ Now following ' + username, 'success');
                    renderFollowing();
                } else {
                    showMessage('Already following ' + username, 'error');
                }
            }
            
            function createPlaylist() {
                const name = prompt('Enter playlist name:');
                if (!name) return;
                
                const newPlaylist = {
                    id: Date.now(),
                    name: name,
                    tracks: [],
                    created: new Date().toISOString()
                };
                
                userPlaylists.push(newPlaylist);
                savePlaylists();
                renderPlaylists();
                showMessage('✅ Playlist "' + name + '" created!', 'success');
            }
            
            function savePlaylists() {
                localStorage.setItem('music_playlists_' + currentMusicUser, JSON.stringify(userPlaylists));
            }
            
            function renderPlaylists() {
                const container = document.getElementById('playlistContainer');
                
                if (userPlaylists.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">📋</div>
                            <h3>No playlists yet</h3>
                            <p>Create your first playlist!</p>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = userPlaylists.map(playlist => \`
                    <div class="playlist-item">
                        <div>
                            <strong>\${playlist.name}</strong>
                            <div style="font-size: 12px; color: #666;">\${playlist.tracks?.length || 0} tracks</div>
                        </div>
                        <div>
                            <button onclick="deletePlaylist('\${playlist.id}')">Delete</button>
                        </div>
                    </div>
                \`).join('');
            }
            
            function deletePlaylist(id) {
                userPlaylists = userPlaylists.filter(p => p.id != id);
                savePlaylists();
                renderPlaylists();
                showMessage('Playlist deleted', 'success');
            }
            
            function renderFollowing() {
                const container = document.getElementById('followingContainer');
                
                if (following.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">👥</div>
                            <h3>Not following anyone</h3>
                            <p>Follow artists to see their new music</p>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = following.map(user => \`
                    <div class="playlist-item">
                        <div>
                            <strong>👤 \${user}</strong>
                        </div>
                        <div>
                            <button onclick="unfollow('\${user}')">Unfollow</button>
                        </div>
                    </div>
                \`).join('');
            }
            
            function unfollow(username) {
                following = following.filter(u => u !== username);
                localStorage.setItem('music_following_' + currentMusicUser, JSON.stringify(following));
                renderFollowing();
                showMessage('Unfollowed ' + username, 'success');
            }
            
            function loadNotifications() {
                if (!currentMusicUser) return;
                
                fetch('/music/notifications?user=' + currentMusicUser)
                    .then(res => res.json())
                    .then(data => {
                        notifications = data;
                        renderNotifications();
                    });
            }
            
            function renderNotifications() {
                const container = document.getElementById('notificationsContainer');
                
                if (!notifications || notifications.length === 0) {
                    container.innerHTML = \`
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">🔔</div>
                            <h3>No notifications</h3>
                            <p>When artists you follow upload new music, you'll see it here</p>
                        </div>
                    \`;
                    return;
                }
                
                container.innerHTML = notifications.map(n => \`
                    <div class="notification">
                        <div>
                            <strong>\${n.from}</strong> \${n.type === 'follow' ? 'started following you' : 'uploaded new music'}
                        </div>
                        <div style="font-size: 12px;">\${new Date(n.timestamp).toLocaleString()}</div>
                    </div>
                \`).join('');
            }
            
            function uploadMusic() {
                if (!currentMusicUser) {
                    showMessage('Please login to upload music', 'error');
                    return;
                }
                
                const title = document.getElementById('trackTitle').value.trim();
                const fileInput = document.getElementById('musicFile');
                
                if (!title) {
                    showMessage('Please enter a track title', 'error');
                    return;
                }
                
                if (!fileInput.files || fileInput.files.length === 0) {
                    showMessage('Please select an MP3 file', 'error');
                    return;
                }
                
                const file = fileInput.files[0];
                if (file.size > 10 * 1024 * 1024) {
                    showMessage('File too large (max 10MB)', 'error');
                    return;
                }
                
                showMessage('✅ Track uploaded! (Demo mode)', 'success');
                
                document.getElementById('trackTitle').value = '';
                document.getElementById('trackDesc').value = '';
                fileInput.value = '';
            }
            
            function deleteTrack(trackId) {
                if (confirm('Delete this track?')) {
                    fetch('/music/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trackId: trackId })
                    })
                    .then(res => res.json())
                    .then(data => {
                        if (data.success) {
                            showMessage('✅ Track deleted', 'success');
                            location.reload();
                        }
                    });
                }
            }
            
            setInterval(() => {
                fetch('/music/stats')
                    .then(res => res.json())
                    .then(data => {
                        document.getElementById('totalTracks').textContent = data.tracks;
                        document.getElementById('totalLikes').textContent = data.likes;
                        document.getElementById('totalPlays').textContent = data.plays;
                        document.getElementById('totalArtists').textContent = data.artists;
                    });
            }, 10000);
        </script>
    </body>
    </html>
    `);
});

// Music API endpoints
app.post('/music/like', express.json(), (req, res) => {
    const { trackId, username } = req.body;
    const post = musicPosts.find(p => p.id === trackId);
    
    if (post) {
        post.likes++;
        res.json({ success: true, likes: post.likes });
    } else {
        res.json({ success: false, message: 'Track not found' });
    }
});

app.post('/music/play', express.json(), (req, res) => {
    const { trackId } = req.body;
    const post = musicPosts.find(p => p.id === trackId);
    
    if (post) {
        post.plays = (post.plays || 0) + 1;
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.post('/music/delete', express.json(), (req, res) => {
    const { trackId } = req.body;
    const index = musicPosts.findIndex(p => p.id === trackId);
    
    if (index !== -1) {
        musicPosts.splice(index, 1);
        res.json({ success: true });
    } else {
        res.json({ success: false, message: 'Track not found' });
    }
});

app.post('/music/notification', express.json(), (req, res) => {
    const notification = req.body;
    musicNotifications.push(notification);
    
    if (musicNotifications.length > 50) {
        musicNotifications.shift();
    }
    
    res.json({ success: true });
});

app.get('/music/notifications', (req, res) => {
    const user = req.query.user;
    const userNotifications = musicNotifications.filter(n => n.to === user);
    res.json(userNotifications);
});

app.get('/music/stats', (req, res) => {
    res.json({
        tracks: musicPosts.length,
        likes: musicPosts.reduce((sum, p) => sum + p.likes, 0),
        plays: musicPosts.reduce((sum, p) => sum + (p.plays || 0), 0),
        artists: new Set(musicPosts.map(p => p.username)).size
    });
});

// ===== RETRO MODE (IE5 COMPATIBLE) =====
app.get('/old', (req, res) => {
    console.log('🕹️ Serving retro version');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
    <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN">
    <html>
    <head>
        <title>Skype Classic - Retro Mode</title>
        <meta charset="utf-8">
        <style>
            body { background: #c0c0c0; font-family: Verdana; font-size: 12px; margin: 20px; color: #000; }
            table { border: 2px outset #fff; background: #ece9d8; width: 100%; max-width: 700px; margin: 0 auto; }
            td { padding: 6px; border: 1px solid #808080; }
            .titlebar { background: #0a246a; color: #fff; font-weight: bold; text-align: center; }
            .statusbar { background: #d4d0c8; padding: 4px; border: 1px inset #808080; }
            .message { background: #fff; padding: 6px; margin: 4px 0; border: 1px solid #808080; }
            .online { color: #008000; font-weight: bold; }
            .offline { color: #808080; }
            button { font-family: Verdana; font-size: 11px; font-weight: bold; background: #d4d0c8; border: 2px outset #fff; padding: 4px 12px; cursor: pointer; }
            input { font-family: Verdana; font-size: 11px; border: 2px inset #d4d0c8; padding: 4px; width: 100%; }
            marquee { font-size: 11px; background: #ffd700; padding: 2px; }
        </style>
    </head>
    <body>
        <marquee behavior="scroll" direction="left" scrollamount="3">
            🎮 RETRO MODE ACTIVATED - WORKS WITH IE5, NETSCAPE 6, AND OPERA 6! 🎮
        </marquee>
        
        <table cellspacing="2" cellpadding="4">
            <tr>
                <td class="titlebar" colspan="3">Skype Classic - Retro Edition (IE5 Compatible)</td>
            </tr>
            <tr>
                <td colspan="3" class="statusbar" id="statusText">Welcome to Retro Mode!</td>
            </tr>
            <tr>
                <td width="25%" valign="top" bgcolor="#d4d0c8">
                    <b>👥 CONTACTS</b><br>
                    <hr>
                    <span class="online">● test (online)</span><br>
                    <span class="online">● alice (online)</span><br>
                    <span class="offline">○ bob (offline)</span><br>
                    <span class="online">● charlie (online)</span><br>
                    <hr>
                    <button onclick="window.location='/old/minimal'">📟 Text Only</button>
                </td>
                <td width="50%" valign="top" bgcolor="#ffffff">
                    <b>💬 MESSAGES</b><br>
                    <hr>
                    <div style="height: 200px; overflow-y: auto; background: #fff; border: 1px inset #808080; padding: 5px;">
                        <div class="message"><b>System:</b> Welcome to Retro Mode!</div>
                        <div class="message"><b>test:</b> This works in old browsers!</div>
                        <div class="message"><b>alice:</b> No modern JS needed!</div>
                    </div>
                    <hr>
                    <table width="100%">
                        <tr>
                            <td><input type="text" id="msg" placeholder="Type message..."></td>
                            <td width="80"><button onclick="alert('Demo mode - messages not sent')">Send</button></td>
                        </tr>
                    </table>
                </td>
                <td width="25%" valign="top" bgcolor="#d4d0c8">
                    <b>ℹ️ INFO</b><br>
                    <hr>
                    <b>Links:</b><br>
                    <a href="/">🏠 Main</a><br>
                    <a href="/mobile">📱 Mobile</a><br>
                    <a href="/analytics">📊 Stats</a><br>
                    <a href="/music">🎵 Music</a><br>
                    <a href="/dev">💻 Dev</a><br>
                    <hr>
                    <span style="font-size:10px;">Best viewed in 800x600</span>
                </td>
            </tr>
            <tr>
                <td colspan="3" class="statusbar" align="center">
                    <img src="data:image/gif;base64,R0lGODlhEgASAIABAIiIiP///yH5BAUAAAEALAAAAAASABIAAAM3SLrc/kAARCERhA2DZzgIgrAsC3SdKLuq7fvC8QvP9o3v+87vCw+EwqFwiCwaj8ikcslsOp/QqBQAOw==" alt="IE">
                    <img src="data:image/gif;base64,R0lGODlhEgASAIABAIiIiP///yH5BAUAAAEALAAAAAASABIAAAM2SLrc/kAARCERhA2DZzgIgrAsC3SdKLuq7fvC8QvP9o3v+87vCw+EwqFwiCwaj8ikcslsOp9QAQA7" alt="Netscape">
                </td>
            </tr>
        </table>
    </body>
    </html>
    `);
});

app.get('/old/minimal', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
    <!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 3.2 Final//EN">
    <html>
    <head>
        <title>Skype Classic - Text Mode</title>
    </head>
    <body bgcolor="#c0c0c0" text="#000000">
        <font face="Verdana" size="2">
            <center>
                <table width="600" cellpadding="5" border="1">
                    <tr>
                        <td bgcolor="#0a246a" colspan="2" align="center">
                            <font color="#ffffff" size="4"><b>SKYPE CLASSIC - TEXT MODE</b></font>
                        </td>
                    </tr>
                    <tr>
                        <td width="150" valign="top" bgcolor="#d4d0c8">
                            <b>NAVIGATION</b><br>
                            <a href="/">[Main]</a><br>
                            <a href="/mobile">[Mobile]</a><br>
                            <a href="/old">[Retro]</a><br>
                            <a href="/analytics">[Stats]</a><br>
                            <a href="/music">[Music]</a><br>
                        </td>
                        <td width="450" valign="top" bgcolor="#ffffff">
                            <b>MESSAGES</b><br>
                            <hr>
                            <pre>
[09:41] System: Welcome to text mode
[09:42] test: Works in ANY browser
[09:43] alice: Even Lynx and Netscape 1.0!
                            </pre>
                            <hr>
                            <form method="get" action="/old/send">
                                Message: <input type="text" name="message" size="40"><br>
                                <input type="submit" value="Send">
                            </form>
                        </td>
                    </tr>
                </table>
            </center>
        </font>
    </body>
    </html>
    `);
});

app.get('/old/send', (req, res) => {
    const message = req.query.message || '';
    res.send(`
    <html>
    <head><meta http-equiv="refresh" content="2;url=/old"></head>
    <body bgcolor="#c0c0c0">
        <h3>✅ Message Sent!</h3>
        <p>Your message: "${message.substring(0, 50)}"</p>
        <p><a href="/old">Return</a></p>
    </body>
    </html>
    `);
});

// ===== DEV TERMINAL =====
app.get('/dev', (req, res) => {
    console.log('💻 Serving dev terminal');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic - Dev Terminal</title>
        <meta charset="utf-8">
        <style>
            body {
                background: #000000;
                color: #c0c0c0;
                font-family: 'Courier New', Courier, monospace;
                font-size: 14px;
                margin: 0;
                padding: 20px;
                height: 100vh;
                overflow: hidden;
            }
            .terminal {
                background: #000000;
                border: 2px solid #808080;
                padding: 20px;
                height: calc(100vh - 80px);
                overflow-y: auto;
            }
            .titlebar {
                background: linear-gradient(90deg, #000080, #1084d0);
                color: #ffffff;
                padding: 5px 10px;
                font-family: 'MS Sans Serif', Arial, sans-serif;
                font-size: 12px;
                font-weight: bold;
                display: flex;
                justify-content: space-between;
                border: 2px solid;
                border-top-color: #c0c0c0;
                border-left-color: #c0c0c0;
                border-right-color: #404040;
                border-bottom-color: #404040;
            }
            .prompt { color: #ffff00; font-weight: bold; }
            .command { color: #ffffff; margin-left: 10px; }
            .output { color: #00ff00; margin: 5px 0 10px 20px; white-space: pre-wrap; }
            .input-line {
                display: flex;
                margin-top: 20px;
                position: sticky;
                bottom: 0;
                background: #000000;
                padding: 10px 0;
                border-top: 1px solid #808080;
            }
            .input-prompt {
                color: #ffff00;
                font-weight: bold;
                margin-right: 10px;
            }
            #commandInput {
                background: #000000;
                color: #ffffff;
                border: 1px solid #808080;
                font-family: 'Courier New', Courier, monospace;
                font-size: 14px;
                flex: 1;
                padding: 5px;
                outline: none;
            }
            .status-bar {
                background: #c0c0c0;
                color: #000000;
                padding: 3px 10px;
                font-family: 'MS Sans Serif', Arial, sans-serif;
                font-size: 11px;
                display: flex;
                justify-content: space-between;
                border: 2px solid;
                border-top-color: #ffffff;
                border-left-color: #ffffff;
                border-right-color: #808080;
                border-bottom-color: #808080;
                margin-top: 5px;
            }
            .ascii-header {
                color: #00ffff;
                font-size: 12px;
                line-height: 1.2;
                margin-bottom: 20px;
                white-space: pre;
            }
        </style>
    </head>
    <body>
        <div class="titlebar">
            <span>[ Skype Classic Developer Console ]</span>
            <div class="titlebar-buttons">
                <div class="xp-button" onclick="window.location='/'">X</div>
            </div>
        </div>
        
        <div class="terminal" id="terminal">
            <div class="ascii-header">
+--------------------------------------------------------------------+
|     ███████╗██╗  ██╗██╗   ██╗██████╗ ███████╗                     |
|     ██╔════╝██║ ██╔╝██║   ██║██╔══██╗██╔════╝                     |
|     ███████╗█████╔╝ ██║   ██║██████╔╝█████╗                       |
|     ╚════██║██╔═██╗ ██║   ██║██╔═══╝ ██╔══╝                       |
|     ███████║██║  ██╗╚██████╔╝██║     ███████╗                     |
|     ╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚══════╝                     |
|                         DEV TERMINAL v1.0                          |
+--------------------------------------------------------------------+
            </div>
            
            <div id="output"></div>
            
            <div class="input-line">
                <span class="input-prompt">C:\\SKYPE\\DEV></span>
                <input type="text" id="commandInput" autofocus>
            </div>
        </div>
        
        <div class="status-bar">
            <span>C: Connected to skypeclassic.ru</span>
            <span>USER: root | SERVER: ONLINE</span>
        </div>

        <script>
            const output = document.getElementById('output');
            const commandInput = document.getElementById('commandInput');
            
            let history = [];
            let historyIndex = -1;
            
            const commands = {
                help: function() {
                    return \`
Available commands:
  help     - Show this help
  ls/dir   - List files
  status   - Server status
  users    - List users
  groups   - List groups
  logs     - View logs
  clear/cls- Clear screen
  date     - Show date/time
  whoami   - Show user
  ver      - Show version
  exit     - Cannot exit\`;
                },
                ls: function() { return this.dir(); },
                dir: function() {
                    return \`
 Volume in drive C is SKYPECLASSIC
 Volume Serial Number is 1337-5KY9

 Directory of C:\\\\skypeclassic

03/16/25  09:41    <DIR>          node_modules
03/16/25  09:41    <DIR>          public
03/16/25  09:41            12,458 skypeclassic.js
03/16/25  09:41             2,145 package.json
03/16/25  09:41            54,221 package-lock.json
03/16/25  09:41    <DIR>          sounds
               3 Dir(s)   1,024,000 KB free\`;
                },
                status: function() {
                    return \`
Server Status:
  Uptime    : 3d 14h 22m
  Users     : ${users?.size || 0} online
  Groups    : ${groups?.size || 0} active
  Memory    : 156MB / 512MB
  Port      : 3000\`;
                },
                users: function() {
                    return \`
Online Users:
  test     - Online  - Chatting
  alice    - Online  - Away
  bob      - Offline - Last seen 5m ago
  charlie  - Online  - In call\`;
                },
                groups: function() {
                    return \`
Active Groups:
  Study Group    - 3 members
  Gaming Squad   - 4 members
  Music Lovers   - 2 members\`;
                },
                logs: function() {
                    return \`
[2025-03-16 09:41] User 'test' connected
[2025-03-16 09:40] Call ended: call_12345
[2025-03-16 09:38] New group created: 'Music Lovers'\`;
                },
                clear: function() { output.innerHTML = ''; return ''; },
                cls: function() { return this.clear(); },
                date: function() { return new Date().toString(); },
                whoami: function() { return 'root\\dev\\console'; },
                ver: function() { return 'Skype Classic Dev Terminal v1.0 - Windows 95 Console Mode'; },
                exit: function() { return 'Cannot exit. Resistance is futile.'; }
            };
            
            function processCommand(cmd) {
                const parts = cmd.trim().split(' ');
                const command = parts[0].toLowerCase();
                const args = parts.slice(1).join(' ');
                
                if (command === '') return '';
                
                if (commands[command]) {
                    return commands[command](args);
                } else {
                    return \`'\${command}' is not recognized as an internal or external command.\`;
                }
            }
            
            function executeCommand() {
                const cmd = commandInput.value.trim();
                if (!cmd) return;
                
                history.push(cmd);
                historyIndex = history.length;
                
                output.innerHTML += \`<div><span class="prompt">C:\\\\SKYPE\\\\DEV></span><span class="command"> \${cmd}</span></div>\`;
                
                const result = processCommand(cmd);
                if (result) {
                    output.innerHTML += \`<div class="output">\${result}</div>\`;
                }
                
                commandInput.value = '';
                document.getElementById('terminal').scrollTop = document.getElementById('terminal').scrollHeight;
            }
            
            commandInput.addEventListener('keydown', function(e) {
                if (e.key === 'Enter') {
                    executeCommand();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (historyIndex > 0) {
                        historyIndex--;
                        commandInput.value = history[historyIndex];
                    }
                } else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (historyIndex < history.length - 1) {
                        historyIndex++;
                        commandInput.value = history[historyIndex];
                    } else {
                        historyIndex = history.length;
                        commandInput.value = '';
                    }
                }
            });
            
            window.onload = function() {
                output.innerHTML = \`
<div class="output">
Microsoft Windows 95 [Version 4.00.950]
(C) Copyright Microsoft Corp 1981-1996.

Welcome to Skype Classic Developer Console
Type 'help' for available commands
</div>\`;
                commandInput.focus();
            };
        </script>
    </body>
    </html>
    `);
});

// ===== PURE FULLSCREEN VIDEO - NO CONTROLS =====
app.get('/scr', (req, res) => {
    console.log('🎬 Serving pure fullscreen video');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>screensaver</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            
            body {
                background: #000000;
                overflow: hidden;
                height: 100vh;
                width: 100vw;
            }
            
            video {
                width: 100%;
                height: 100%;
                object-fit: contain;
                background: #000;
            }
        </style>
    </head>
    <body>
        <video src="/images/scr.mp4" autoplay loop playsinline></video>
    </body>
    </html>
    `);
});

const PORT = 3000;

const getLocalIP = () => {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
};

server.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    console.log(`\n🎉 SKYPE CLASSIC SERVER RUNNING!`);
    console.log(`🟣 Local: http://localhost:${PORT}`);
    console.log(`📱 Network: http://${ip}:${PORT}`);
    console.log(`\n🔑 Default test account: test / test`);
    console.log(`\n💾 Accounts: data/users.json`);
    console.log(`💾 Messages: data/messages.json`);
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
