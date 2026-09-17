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

// Socket.IO server for VoIP calls
const ioserver = io(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Fix emoji rendering
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    next();
});

// Create data directory for persistent contact storage
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('📁 Created data directory for contacts');
}

let users = new Map();
let chatMessages = new Map();
let groups = new Map();
let activeCalls = new Map();
let userCallStatus = new Map();

// Serve static files
app.use("/sounds", express.static(path.join(__dirname, "sounds")));
app.use("/images", express.static(path.join(__dirname, "public/images")));

// ==================== DESKTOP MAIN PAGE ====================
// Serve the main interface
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
        
        /* New Chat Layout */
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
        
        .status-online-small { color: #4CAF50; }
        .status-offline-small { color: #999; }
        
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
        
        .send-button, .call-button, .image-button {
            padding: 8px 15px;
            background: var(--titlebar-start);
            color: var(--text-light);
            border: none;
            cursor: pointer;
            border-radius: 4px;
        }
        
        .send-button:hover, .call-button:hover, .image-button:hover {
            background: var(--titlebar-end);
        }
        
        .call-button {
            background: #00A300;
        }
        
        .image-button {
            background: #6C00A0;
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
    </style>
</head>
<body style="background: var(--bg-primary) var(--bg-image); background-size: cover; background-position: center; background-repeat: no-repeat; background-attachment: fixed;">
    <!-- Theme Switcher -->
    <div class="theme-switcher">
        <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
    </div>
    
    <!-- Global Update Banner -->
    <div class="global-banner">
        <marquee behavior="scroll" direction="left" scrollamount="6">
            🎉 UPDATE 1.3: THE MULTIMEDIA DRIVE UPDATE HAS COME OUT! 🎉 CHECK OUT /ANALYTICS FOR MORE INFO! 📊 NEW FEATURES: MUSIC SHARING • RETRO MODE • DEV TERMINAL • MOBILE SYNC • GROUP CHATS • IMAGE SHARING • DARK THEME • AND MORE! 🚀
        </marquee>
    </div>
    
    <!-- Sound Control -->
    <div class="sound-control">
        <label>
            <input type="checkbox" id="soundToggle" checked> Sounds
        </label>
    </div>

    <!-- Audio Elements -->
    <audio id="logoutSound" preload="auto"><source src="/sounds/logoff.mp3" type="audio/mpeg"></audio>
    <audio id="messageSound" preload="auto"><source src="/sounds/messagereceived.mp3" type="audio/mpeg"></audio>
    <audio id="loginSound" preload="auto"><source src="/sounds/logon.mp3" type="audio/mpeg"></audio>
    <audio id="sendSound" preload="auto"><source src="/sounds/messagesent.mp3" type="audio/mpeg"></audio>
    <audio id="callSound" preload="auto" loop><source src="/sounds/call_incoming.mp3" type="audio/mpeg"></audio>
    <audio id="dialingSound" preload="auto" loop><source src="/sounds/dialing.mp3" type="audio/mpeg"></audio>
    <audio id="callEndSound" preload="auto"><source src="/sounds/call_end.mp3" type="audio/mpeg"></audio>
    <audio id="callAcceptSound" preload="auto"><source src="/sounds/call_accept.mp3" type="audio/mpeg"></audio>
    <audio id="callErrorSound" preload="auto"><source src="/sounds/call_error.mp3" type="audio/mpeg"></audio>

    <!-- Login Window -->
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

    <!-- Main Chat Window -->
    <div id="chatWindow" class="xp-window chat-window hidden">
        <div class="xp-titlebar">
            <span>📞 Skype Classic - <span id="currentUser">User</span></span>
            <div class="xp-titlebar-controls">
                <div class="xp-button">_</div>
                <div class="xp-button">□</div>
                <div class="xp-button" onclick="logout()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div class="chat-layout">
                <!-- Contacts Panel -->
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
                
                <!-- Chat Panel -->
                <div class="chat-panel">
                    <div class="xp-fieldset" style="height: 100%; display: flex; flex-direction: column;">
                        <legend class="xp-legend">Chat <span id="currentChatWith"></span></legend>
                        <div id="chatArea" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                            <!-- Dynamic chat containers will be added here -->
                        </div>
                    </div>
                </div>
            </div>
            <div class="xp-status-bar">
                <span id="chatStatus">Ready to chat...</span>
            </div>
        </div>
    </div>

    <!-- Incoming Call Window -->
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

    <!-- Active Call Window -->
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

    <!-- Group Creation Window -->
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

    <!-- Analytics Popup -->
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
    
    <!-- Image Modal -->
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
        
        // WebRTC variables
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let isMuted = false;
        let isDeafened = false;
        let microphonePermissionGranted = false;
        let connectionInProgress = false;

        const rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        // ===== THEME MANAGEMENT =====
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

        // ===== MESSAGE STORAGE FUNCTIONS =====

        function syncMessagesToServer() {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (!currentUser) return;
            
            // Sync each chat's messages
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
                // Sync local messages to server
                syncMessagesToServer();
            } else {
                chatMessages = {};
                // Request message history from server
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Request history for each contact
                    userContacts.forEach(contact => {
                        ws.send(JSON.stringify({
                            type: 'get_message_history',
                            chatId: contact.username
                        }));
                    });
                }
            }
        }
        
        function addMessageToChat(contact, messageData) {
            if (!chatMessages[contact]) {
                chatMessages[contact] = [];
            }
            
            // Check if message already exists
            const exists = chatMessages[contact].some(m => m.id === messageData.id);
            if (!exists) {
                chatMessages[contact].push(messageData);
                saveMessagesToLocalStorage();
                syncMessagesToServer();
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

        // ===== CONTACT MANAGEMENT =====
        function loadContacts() {
            // First load from localStorage as backup
            const savedContacts = localStorage.getItem('userContacts_' + currentUser.username);
            if (savedContacts) {
                userContacts = JSON.parse(savedContacts);
                updateContactList();
            }
            
            // Then request from server to get latest
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
            
            // Create contact tabs
            userContacts.forEach(contact => {
                const contactTab = document.createElement('div');
                contactTab.className = 'contact-tab' + (currentChat === contact.username ? ' active' : '');
                contactTab.setAttribute('data-contact', contact.username);
                contactTab.innerHTML = \`
                    <div class="contact-avatar-small">\${contact.displayName.charAt(0).toUpperCase()}</div>
                    <div class="contact-info-small">
                        <div class="contact-name-small">\${contact.displayName}</div>
                        <div class="contact-status-small status-\${contact.status === 'online' ? 'online-small' : 'offline-small'}">
                            <span>●</span> \${contact.status === 'online' ? 'Online' : 'Offline'}
                        </div>
                    </div>
                \`;
                contactTab.onclick = () => switchChat(contact.username, contact.displayName);
                contactsPanel.appendChild(contactTab);
                
                // Create chat container for this contact if it doesn't exist
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
                        </div>
                    \`;
                    chatArea.appendChild(chatContainer);
                    
                    // Setup image input for this contact
                    document.getElementById('imageInput_' + contact.username).addEventListener('change', (e) => {
                        handleImageUpload(e, contact.username);
                    });
                }
                
                // Load messages for this contact
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
            
            // Hide all chat containers and show the selected one
            document.querySelectorAll('.chat-container').forEach(container => {
                container.classList.remove('active');
            });
            const activeContainer = document.getElementById('chatContainer_' + username);
            if (activeContainer) {
                activeContainer.classList.add('active');
            }
            
            // Update active contact tab styling
            document.querySelectorAll('.contact-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.getAttribute('data-contact') === username) {
                    tab.classList.add('active');
                }
            });
            
            // Render messages for this contact
            renderMessagesForChat(username);
            
            // Focus the input
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
                    contact.status = onlineUser.status;
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
            // This is a global system message, we can show it in a temporary toast or just log
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

        // ===== LOGIN FUNCTIONS =====
        function login() {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const status = document.getElementById('statusMessage');
            
            if (username && password) {
                const accounts = JSON.parse(localStorage.getItem('skypeAccounts') || '{}');
                
                if (accounts[username] && accounts[username].password === password) {
                    currentUser = { 
                        username: username, 
                        id: Date.now(),
                        displayName: accounts[username].displayName || username
                    };
                    status.textContent = 'Login successful!';
                    playLoginSound();
                    showChatWindow();
                    connectWebSocket();
                } else if (username === 'test' && password === 'test') {
                    currentUser = { username: 'test', id: 1, displayName: 'Test User' };
                    status.textContent = 'Login successful!';
                    playLoginSound();
                    showChatWindow();
                    connectWebSocket();
                } else {
                    status.textContent = 'Account not found! Please register first.';
                }
            } else {
                status.textContent = 'Please enter username and password';
            }
        }
        
        function register() {
            const username = document.getElementById('regUsername').value;
            const password = document.getElementById('regPassword').value;
            const email = document.getElementById('regEmail').value;
            const displayName = document.getElementById('regDisplayName').value || username;
            const status = document.getElementById('statusMessage');
            
            if (username && password) {
                const accounts = JSON.parse(localStorage.getItem('skypeAccounts') || '{}');
                
                if (accounts[username]) {
                    status.textContent = 'Username already exists!';
                    return;
                }
                
                accounts[username] = {
                    password: password,
                    email: email,
                    displayName: displayName,
                    created: new Date().toISOString()
                };
                
                localStorage.setItem('skypeAccounts', JSON.stringify(accounts));
                
                status.textContent = 'Account created! Please login.';
                showTab('login');
                
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
                document.getElementById('regEmail').value = '';
                document.getElementById('regDisplayName').value = '';
            } else {
                status.textContent = 'Please fill in username and password';
            }
        }
        
        function showChatWindow() {
            document.getElementById('loginWindow').classList.add('hidden');
            document.getElementById('chatWindow').classList.remove('hidden');
            document.getElementById('currentUser').textContent = currentUser.displayName;
            
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
                    contacts: savedContacts
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
                        // Merge server messages with local messages
                        data.messages.forEach(msg => {
                            if (!chatMessages[chatId].find(m => m.id === msg.id)) {
                                chatMessages[chatId].push(msg);
                            }
                        });
                        saveMessagesToLocalStorage();
                        if (currentChat === chatId) {
                            renderMessagesForChat(chatId);
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
                    // Store the call ID or just use the from username as identifier
                    window.currentCallId = data.callId || 'call_' + Date.now();
                    break;
                    
                case 'call_accepted':
                    console.log('📞 Call accepted by:', data.from);
                    stopCallSounds();
                    playCallAcceptSound();
                    document.getElementById('callWindow').classList.remove('hidden');
                    document.getElementById('callTarget').textContent = data.fromDisplay || data.from;
                    document.getElementById('callStatus').textContent = 'In call with ' + (data.fromDisplay || data.from);
                    startCallTimer();
                    isInCall = true;
                    currentCallWith = data.from;
                    // Start WebRTC as caller
                    setupWebRTC(true);
                    break;
                    
                case 'call_declined':
                    console.log('📞 Call declined by:', data.from);
                    stopCallSounds();
                    playCallEndSound();
                    document.getElementById('callWindow').classList.add('hidden');
                    document.getElementById('incomingCallWindow').classList.add('hidden');
                    addSystemMessage((data.fromDisplay || data.from) + ' declined your call');
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
                        }
                        if (data.messages.length > 0) {
                            const sortedMessages = [...data.messages].sort((a, b) => a.id - b.id);
                            messageCounter = Math.max(messageCounter, sortedMessages[sortedMessages.length - 1].id);
                        }
                    }
                    break;
                    
                case 'call_end':
                    console.log('📞 Call ended by:', data.from);
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
                        addSystemMessage('Call ended by ' + (data.fromDisplay || data.from));
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
                    if (data.success) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'get_contacts',
                                username: currentUser.username
                            }));
                        }
                    }
                    break;
                    
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
            }
        }
        
        function changeStatus(status) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'status_change',
                    status: status
                }));
                document.getElementById('chatStatus').textContent = 'Status: ' + status;
            }
        }
        
        function logout() {
            playLogoutSound();
            if (ws) {
                ws.close();
            }
            document.getElementById('chatWindow').classList.add('hidden');
            document.getElementById('loginWindow').classList.remove('hidden');
            currentUser = null;
            currentChat = null;
            messageCounter = 0;
            chatMessages = {};
            document.getElementById('statusMessage').textContent = 'Logged out successfully';
            cleanupWebRTC();
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
        
        // ===== SOUND FUNCTIONS =====
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
            
            // Request permission first if not granted
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
                
                // Create a unique call ID
                const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                window.currentCallId = callId;
                
                document.getElementById('callTarget').textContent = currentChat;
                document.getElementById('callWindow').classList.remove('hidden');
                document.getElementById('callStatus').textContent = 'Calling ' + currentChat + '...';
                document.getElementById('callTimer').textContent = 'Calling...';
                
                // Send call request with callId
                ws.send(JSON.stringify({
                    type: 'call_request',
                    callId: callId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentChat
                }));
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    if (document.getElementById('callWindow') && 
                        document.getElementById('callWindow').classList.contains('hidden') === false && 
                        document.getElementById('callStatus').textContent.includes('Calling')) {
                        addSystemMessage('Call timed out - no answer from ' + currentChat);
                        endCall();
                    }
                }, 30000);
            }
        }
        
        function acceptIncomingCall() {
            console.log('ANSWER button clicked!');
            stopCallSounds();
            playCallAcceptSound();
            
            // Request permission first if not granted
            if (!microphonePermissionGranted) {
                requestMicrophonePermission().then(() => {
                    if (microphonePermissionGranted) {
                        acceptIncomingCall();
                    }
                });
                return;
            }
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            document.getElementById('callWindow').classList.remove('hidden');
            document.getElementById('callTarget').textContent = incomingCallFrom;
            document.getElementById('callStatus').textContent = 'In call with ' + incomingCallFrom;
            
            startCallTimer();
            isInCall = true;
            currentCallWith = incomingCallFrom;
            
            // Start WebRTC as callee
            setupWebRTC(false);
            
            // Send acceptance with callId
            ws.send(JSON.stringify({
                type: 'call_accepted',
                callId: window.currentCallId,
                from: currentUser.username,
                fromDisplay: currentUser.displayName,
                to: incomingCallFrom
            }));
            
            incomingCallFrom = null;
        }
        
        function declineIncomingCall() {
            console.log('DECLINE button clicked!');
            stopCallSounds();
            playCallEndSound();
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            
            if (incomingCallFrom) {
                // Send decline signal to the caller
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'call_declined',
                        callId: window.currentCallId,
                        from: currentUser.username,
                        to: incomingCallFrom
                    }));
                }
                addSystemMessage('Call declined');
                incomingCallFrom = null;
            }
            
            // Clean up any pending WebRTC setup
            cleanupWebRTC();
        }
        
        function endCall() {
            console.log('END CALL button clicked!');
            stopCallSounds();
            playCallEndSound();
            
            // Hide call windows
            const callWindow = document.getElementById('callWindow');
            const incomingCallWindow = document.getElementById('incomingCallWindow');
            if (callWindow) callWindow.classList.add('hidden');
            if (incomingCallWindow) incomingCallWindow.classList.add('hidden');
            
            // Stop timer
            if (callTimerInterval) {
                clearInterval(callTimerInterval);
                callTimerInterval = null;
            }
            
            // Notify the other person if we're in a call
            if (currentCallWith && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'call_end',
                    callId: window.currentCallId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentCallWith
                }));
                addSystemMessage('Call ended with ' + currentCallWith);
            }
            
            // Clean up WebRTC
            cleanupWebRTC();
            
            // Reset call state
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
        
        // ===== WEBRTC FUNCTIONS =====
        async function requestMicrophonePermission() {
            try {
                console.log('Requesting microphone permission...');
                
                // Try to get both audio and video
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true,
                    video: true
                });
                
                console.log('Microphone and camera access granted!');
                microphonePermissionGranted = true;
                
                // Stop all tracks immediately - we just wanted permission
                stream.getTracks().forEach(track => track.stop());
                
                hidePermissionPrompt();
                return true;
                
            } catch (error) {
                console.error('Microphone permission denied:', error);
                showCallError('Microphone access denied. Please allow microphone access in your browser settings.');
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
                console.log('Setting up WebRTC as', isCaller ? 'caller' : 'callee');
                
                if (!microphonePermissionGranted) {
                    console.log('No microphone permission, requesting...');
                    showPermissionPrompt();
                    await requestMicrophonePermission();
                }
                
                // Get user media with specific constraints
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000,
                        channelCount: 1
                    },
                    video: false  // Audio only for now
                });
                console.log('Local stream obtained');
                
                // Show local audio indicator (optional)
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(e => console.log('Local video play error:', e));
                }
                
                // Create peer connection with more STUN servers
                const config = {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:stun.stunprotocol.org:3478' }
                    ],
                    iceCandidatePoolSize: 10
                };
                
                peerConnection = new RTCPeerConnection(config);
                console.log('Peer connection created');
                
                // Add local stream tracks
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                    console.log('Added track:', track.kind);
                });
                
                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    console.log('Received remote track:', event.track.kind);
                    const remoteAudio = document.getElementById('remoteAudio');
                    if (remoteAudio && event.streams[0]) {
                        remoteAudio.srcObject = event.streams[0];
                        remoteAudio.play().catch(e => console.log('Remote audio play error:', e));
                        console.log('Remote stream attached');
                    }
                };
                
                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('Sending ICE candidate:', event.candidate.type);
                        ws.send(JSON.stringify({
                            type: 'ice_candidate',
                            to: currentCallWith,
                            candidate: event.candidate
                        }));
                    } else {
                        console.log('ICE gathering complete');
                    }
                };
                
                // Handle ICE connection state
                peerConnection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state:', peerConnection.iceConnectionState);
                    switch (peerConnection.iceConnectionState) {
                        case 'connected':
                        case 'completed':
                            console.log('ICE connection established!');
                            hideCallError();
                            break;
                        case 'failed':
                            console.log('ICE connection failed');
                            showCallError('Connection failed. Please try again.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 3000);
                            break;
                        case 'disconnected':
                            console.log('ICE connection disconnected');
                            break;
                    }
                };
                
                // Handle connection state
                peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', peerConnection.connectionState);
                    switch (peerConnection.connectionState) {
                        case 'connected':
                            console.log('WebRTC connection established!');
                            break;
                        case 'failed':
                            console.log('WebRTC connection failed');
                            showCallError('Connection failed. Please try again.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 3000);
                            break;
                    }
                };
                
                // Show audio controls
                const controls = document.getElementById('audioControls');
                if (controls) controls.classList.remove('hidden');
                
                if (isCaller) {
                    // Create offer
                    console.log('Creating offer...');
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: false
                    });
                    await peerConnection.setLocalDescription(offer);
                    console.log('Local description set (offer)');
                    
                    ws.send(JSON.stringify({
                        type: 'webrtc_offer',
                        to: currentCallWith,
                        offer: offer
                    }));
                }
                
            } catch (error) {
                console.error('Error setting up WebRTC:', error);
                showCallError('Call setup failed: ' + error.message);
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCOffer(offer, from) {
            try {
                console.log('Handling WebRTC offer from:', from);
                
                // Setup WebRTC first (this will get local stream)
                await setupWebRTC(false);
                
                // Set remote description
                await peerConnection.setRemoteDescription(offer);
                console.log('Remote description set (offer)');
                
                // Create answer
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Local description set (answer)');
                
                ws.send(JSON.stringify({
                    type: 'webrtc_answer',
                    to: from,
                    answer: answer
                }));
                
            } catch (error) {
                console.error('Error handling WebRTC offer:', error);
                showCallError('Failed to accept call: ' + error.message);
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCAnswer(answer) {
            try {
                console.log('Handling WebRTC answer');
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.setRemoteDescription(answer);
                    console.log('Remote description set (answer)');
                } else {
                    console.log('Peer connection not ready for answer');
                }
            } catch (error) {
                console.error('Error handling WebRTC answer:', error);
                showCallError('Call connection failed: ' + error.message);
                playCallErrorSound();
            }
        }
        
        async function handleICECandidate(candidate) {
            try {
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(candidate);
                    console.log('ICE candidate added');
                } else {
                    console.log('Peer connection not ready for ICE candidate');
                    // Store candidate for later
                    setTimeout(() => {
                        if (peerConnection && peerConnection.remoteDescription) {
                            peerConnection.addIceCandidate(candidate).catch(e => console.log('Failed to add stored candidate:', e));
                        }
                    }, 1000);
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
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
            console.log('Cleaning up WebRTC');
            
            // Stop and close local stream
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Stopped track:', track.kind);
                });
                localStream = null;
            }
            
            // Close peer connection
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            
            // Clear video/audio elements
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
            
            // Reset UI states
            isMuted = false;
            isDeafened = false;
            
            const muteBtn = document.getElementById('muteButton');
            if (muteBtn) muteBtn.textContent = 'Mute';
            
            const deafenBtn = document.getElementById('deafenButton');
            if (deafenBtn) deafenBtn.textContent = 'Deafen';
            
            // Hide error and permission prompts
            hideCallError();
            hidePermissionPrompt();
            
            // Reset call window UI
            const callStatus = document.getElementById('callStatus');
            if (callStatus) callStatus.textContent = 'Call ended';
            
            const callTimer = document.getElementById('callTimer');
            if (callTimer) callTimer.textContent = '00:00';
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            loadTheme();
            document.getElementById('loginUsername').focus();
            
            // Close modal on background click
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
                const user = {
                    id: data.userId,
                    username: currentUser,
                    displayName: data.displayName,
                    ws: ws,
                    status: 'online'
                };
                users.set(currentUser, user);
                
                // Save desktop contacts to server
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
                        status: u.status 
                    }))
                });

                // Send chat history
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
                // Get message history for a specific chat
                const chatId = data.chatId;
                const history = chatMessages.get(chatId) || [];
                ws.send(JSON.stringify({
                    type: 'message_history',
                    chatId: chatId,
                    messages: history.slice(-100) // Last 100 messages
                }));
                
            } else if (data.type === 'sync_messages') {
                // Sync messages from client to server
                const { chatId, messages } = data;
                if (!chatMessages.has(chatId)) {
                    chatMessages.set(chatId, []);
                }
                const existingMessages = chatMessages.get(chatId);
                
                // Merge messages (avoid duplicates by id)
                messages.forEach(msg => {
                    if (!existingMessages.find(m => m.id === msg.id)) {
                        existingMessages.push(msg);
                    }
                });
                
                // Keep only last 1000 messages
                if (existingMessages.length > 1000) {
                    chatMessages.set(chatId, existingMessages.slice(-1000));
                } else {
                    chatMessages.set(chatId, existingMessages);
                }
                
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
                
                const chatId = data.data.to || 'public';
                if (!chatMessages.has(chatId)) {
                    chatMessages.set(chatId, []);
                }
                
                const chatMsgArray = chatMessages.get(chatId);
                chatMsgArray.push(messageObj);
                
                if (chatMsgArray.length > 1000) {
                    chatMsgArray.splice(0, chatMsgArray.length - 1000);
                }
                
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
                    users.get(currentUser).status = data.status;
                    
                    broadcast({
                        type: 'user_join',
                        message: currentUser + ' is now ' + data.status,
                        users: Array.from(users.values()).map(u => ({ 
                            username: u.username, 
                            displayName: u.displayName,
                            status: u.status 
                        }))
                    });
                }
                
            } else if (data.type === 'call_request') {
                const targetUser = users.get(data.to);
                if (targetUser && targetUser.ws.readyState === WebSocket.OPEN) {
                    targetUser.ws.send(JSON.stringify({
                        type: 'call_request',
                        from: data.from,
                        fromDisplay: data.fromDisplay,
                        to: data.to
                    }));
                }
                
            } else if (data.type === 'image_share') {
                console.log("🖼️ Relaying image from", data.from, "to", data.to);
                
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
                const caller = users.get(data.to);
                if (caller && caller.ws.readyState === WebSocket.OPEN) {
                    caller.ws.send(JSON.stringify({
                        type: 'call_accepted',
                        from: data.from,
                        fromDisplay: data.fromDisplay
                    }));
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
                        
                        // Add reverse contact
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
                    status: u.status 
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
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic Mobile</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                -webkit-tap-highlight-color: transparent;
            }
            
            :root {
                --bg-primary: #6C00A0;
                --bg-gradient: linear-gradient(135deg, #6C00A0, #0A246A);
                --header-gradient: linear-gradient(90deg, #0A246A, #6C00A0);
                --window-bg: #ffffff;
                --contact-bg: #ffffff;
                --contact-border: #f0f0f0;
                --text-primary: #333333;
                --text-secondary: #666666;
                --text-light: #ffffff;
                --button-primary: #6C00A0;
                --button-secondary: #0A246A;
                --bubble-other: #ffffff;
                --bubble-self: linear-gradient(135deg, #6C00A0, #0A246A);
                --input-bg: #f8f9fa;
                --input-border: #dddddd;
                --tab-bg: #4B0082;
                --tab-inactive: rgba(255,255,255,0.7);
                --tab-active: #ffffff;
                --empty-state: #999999;
                --toast-bg: rgba(0,0,0,0.8);
                --toast-error: rgba(198,40,40,0.9);
                --modal-bg: rgba(0,0,0,0.9);
                --status-online: #4CAF50;
                --status-offline: #999999;
            }
            
            .dark-theme {
                --bg-primary: #1a1a1a;
                --bg-gradient: linear-gradient(135deg, #2d2d2d, #1a1a1a);
                --header-gradient: linear-gradient(90deg, #2b2b2b, #4a4a4a);
                --window-bg: #2d2d2d;
                --contact-bg: #3d3d3d;
                --contact-border: #4a4a4a;
                --text-primary: #e0e0e0;
                --text-secondary: #b0b0b0;
                --text-light: #ffffff;
                --button-primary: #4a4a4a;
                --button-secondary: #2b2b2b;
                --bubble-other: #3d3d3d;
                --bubble-self: linear-gradient(135deg, #4a4a4a, #2b2b2b);
                --input-bg: #3d3d3d;
                --input-border: #4a4a4a;
                --tab-bg: #2b2b2b;
                --tab-inactive: rgba(255,255,255,0.5);
                --tab-active: #ffffff;
                --empty-state: #888888;
                --toast-bg: rgba(255,255,255,0.1);
                --toast-error: rgba(198,40,40,0.8);
                --modal-bg: rgba(0,0,0,0.95);
                --status-online: #4CAF50;
                --status-offline: #666666;
            }
            
            body {
                background: var(--bg-gradient);
                height: 100vh;
                overflow: hidden;
                color: var(--text-primary);
                transition: background 0.5s ease, color 0.3s ease;
            }
            
            .auth-box, .auth-header, .auth-form, .auth-input, .auth-button, .auth-footer,
            .mobile-header, .mobile-tabs, .mobile-tab, .tab-content, .contacts-header,
            .search-box, .contact-list, .mobile-contact, .contact-avatar, .contact-info,
            .contact-name, .contact-status, .chat-messages, .message, .message-bubble,
            .message-sender, .message-time, .chat-input-container, .chat-input,
            .send-button, .image-button, .add-contact-btn, .create-group-btn, .empty-state,
            .logout-btn, .chat-header, .back-btn, .modal, .toast, .theme-switcher, .theme-btn {
                transition: background-color 0.4s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
            }
            
            .auth-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--bg-gradient);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 1000;
                padding: 20px;
            }
            
            .auth-box {
                background: var(--window-bg);
                border-radius: 20px;
                width: 100%;
                max-width: 400px;
                overflow: hidden;
                box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }
            
            .auth-header {
                background: var(--header-gradient);
                color: var(--text-light);
                padding: 30px 25px;
                text-align: center;
            }
            
            .auth-header h2 {
                font-size: 28px;
                margin-bottom: 8px;
                font-weight: 600;
            }
            
            .auth-header p {
                font-size: 14px;
                opacity: 0.9;
            }
            
            .auth-form {
                padding: 25px;
                background: var(--window-bg);
            }
            
            .auth-input {
                width: 100%;
                padding: 16px;
                margin-bottom: 16px;
                border: 2px solid var(--input-border);
                border-radius: 12px;
                font-size: 16px;
                background: var(--input-bg);
                color: var(--text-primary);
                transition: all 0.2s;
            }
            
            .auth-input:focus {
                border-color: var(--button-primary);
                background: var(--window-bg);
                outline: none;
                box-shadow: 0 0 0 3px rgba(108, 0, 160, 0.1);
            }
            
            .auth-button {
                width: 100%;
                padding: 16px;
                background: var(--button-primary);
                color: var(--text-light);
                border: none;
                border-radius: 12px;
                font-size: 18px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
                margin-top: 8px;
            }
            
            .auth-button:active {
                transform: scale(0.98);
                opacity: 0.9;
            }
            
            .auth-footer {
                text-align: center;
                padding: 20px;
                color: var(--text-secondary);
                font-size: 14px;
                border-top: 1px solid var(--input-border);
                background: var(--window-bg);
            }
            
            .auth-footer a {
                color: var(--button-primary);
                text-decoration: none;
                font-weight: 600;
            }
            
            .auth-error {
                background: #ffebee;
                color: #c62828;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-size: 14px;
                text-align: center;
                display: none;
            }
            
            .auth-error.show {
                display: block;
            }
            
            .theme-switcher {
                position: fixed;
                top: 15px;
                left: 15px;
                z-index: 10000;
                background: var(--window-bg);
                border-radius: 30px;
                padding: 5px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                border: 1px solid var(--input-border);
            }
            
            .theme-btn {
                background: var(--button-primary);
                color: var(--text-light);
                border: none;
                padding: 8px 16px;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .theme-btn:active {
                transform: scale(0.95);
            }
            
            #mobileApp {
                height: 100vh;
                display: flex;
                flex-direction: column;
                background: var(--window-bg);
            }
            
            .mobile-header {
                background: var(--header-gradient);
                color: var(--text-light);
                padding: 18px 15px;
                font-weight: bold;
                font-size: 18px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                position: relative;
                z-index: 10;
            }
            
            .mobile-header-content {
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            
            .mobile-header-title {
                font-size: 18px;
                font-weight: 600;
            }
            
            .mobile-header-user {
                background: rgba(255,255,255,0.2);
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 14px;
            }
            
            .mobile-tabs {
                display: flex;
                background: var(--tab-bg);
                border-bottom: 1px solid var(--input-border);
            }
            
            .mobile-tab {
                flex: 1;
                padding: 16px;
                text-align: center;
                background: none;
                border: none;
                color: var(--tab-inactive);
                font-size: 15px;
                font-weight: 500;
                cursor: pointer;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
            }
            
            .mobile-tab.active {
                color: var(--tab-active);
                border-bottom-color: var(--tab-active);
                background: rgba(255,255,255,0.1);
            }
            
            .tab-content {
                display: none;
                flex: 1;
                overflow-y: auto;
                background: var(--window-bg);
            }
            
            .tab-content.active {
                display: block;
            }
            
            .contacts-header {
                background: var(--header-gradient);
                color: var(--text-light);
                padding: 15px;
            }
            
            .contacts-header h3 {
                margin-bottom: 10px;
                font-size: 16px;
            }
            
            .search-box {
                width: 100%;
                padding: 12px 15px;
                border: none;
                border-radius: 25px;
                font-size: 14px;
                background: rgba(255,255,255,0.9);
                color: var(--text-primary);
            }
            
            .search-box::placeholder {
                color: var(--text-secondary);
            }
            
            .contact-list {
                padding: 0;
                background: var(--window-bg);
            }
            
            .mobile-contact {
                display: flex;
                align-items: center;
                padding: 16px;
                background: var(--contact-bg);
                border-bottom: 1px solid var(--contact-border);
                cursor: pointer;
            }
            
            .mobile-contact:active {
                background: var(--input-bg);
            }
            
            .contact-avatar {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: var(--header-gradient);
                color: var(--text-light);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 20px;
                margin-right: 15px;
                flex-shrink: 0;
            }
            
            .contact-info {
                flex: 1;
                min-width: 0;
            }
            
            .contact-name {
                font-weight: 600;
                font-size: 16px;
                margin-bottom: 4px;
                color: var(--text-primary);
            }
            
            .contact-status {
                font-size: 13px;
                display: flex;
                align-items: center;
                color: var(--text-secondary);
            }
            
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                margin-right: 6px;
            }
            
            .online .status-dot {
                background: var(--status-online);
                box-shadow: 0 0 8px var(--status-online);
            }
            
            .offline .status-dot {
                background: var(--status-offline);
            }
            
            .chat-messages {
                height: calc(100vh - 180px);
                overflow-y: auto;
                padding: 15px;
                background: var(--window-bg);
            }
            
            .message {
                margin-bottom: 16px;
                clear: both;
            }
            
            .message-other {
                float: left;
                max-width: 80%;
            }
            
            .message-self {
                float: right;
                max-width: 80%;
            }
            
            .message-bubble {
                padding: 12px 16px;
                border-radius: 18px;
                font-size: 15px;
                line-height: 1.4;
                word-wrap: break-word;
                max-width: 100%;
            }
            
            .message-other .message-bubble {
                background: var(--bubble-other);
                color: var(--text-primary);
                border-bottom-left-radius: 5px;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            
            .message-self .message-bubble {
                background: var(--bubble-self);
                color: var(--text-light);
                border-bottom-right-radius: 5px;
            }
            
            .message-image {
                max-width: 200px;
                max-height: 200px;
                border-radius: 10px;
                margin: 5px 0;
                border: 2px solid var(--button-primary);
                cursor: pointer;
            }
            
            .message-sender {
                font-size: 12px;
                font-weight: 600;
                margin-bottom: 4px;
                color: var(--text-secondary);
                padding: 0 5px;
            }
            
            .message-time {
                font-size: 11px;
                color: var(--text-secondary);
                margin-top: 4px;
                text-align: right;
                padding: 0 5px;
            }
            
            .chat-input-container {
                background: var(--window-bg);
                border-top: 1px solid var(--input-border);
                padding: 12px 15px;
                display: flex;
                align-items: center;
                gap: 10px;
                position: sticky;
                bottom: 0;
            }
            
            .chat-input {
                flex: 1;
                padding: 12px 16px;
                border: 1px solid var(--input-border);
                border-radius: 25px;
                font-size: 16px;
                outline: none;
                background: var(--input-bg);
                color: var(--text-primary);
            }
            
            .chat-input:focus {
                border-color: var(--button-primary);
                background: var(--window-bg);
            }
            
            .chat-input::placeholder {
                color: var(--text-secondary);
            }
            
            .send-button, .image-button {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: var(--button-primary);
                color: var(--text-light);
                border: none;
                font-size: 20px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }
            
            .image-button {
                background: var(--button-secondary);
                font-size: 18px;
            }
            
            .send-button:active, .image-button:active {
                transform: scale(0.95);
            }
            
            .add-contact-btn, .create-group-btn {
                background: var(--window-bg);
                color: var(--button-primary);
                border: 2px solid var(--button-primary);
                padding: 12px 20px;
                margin: 15px;
                border-radius: 12px;
                font-size: 16px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            
            .add-contact-btn:active, .create-group-btn:active {
                transform: scale(0.98);
                background: var(--input-bg);
            }
            
            .empty-state {
                text-align: center;
                padding: 60px 20px;
                color: var(--empty-state);
            }
            
            .empty-icon {
                font-size: 60px;
                margin-bottom: 20px;
                opacity: 0.5;
            }
            
            .empty-title {
                font-size: 18px;
                margin-bottom: 10px;
                color: var(--text-primary);
            }
            
            .empty-text {
                font-size: 14px;
                color: var(--text-secondary);
            }
            
            .hidden {
                display: none !important;
            }
            
            .logout-btn {
                background: none;
                border: 1px solid rgba(255,255,255,0.3);
                color: var(--text-light);
                padding: 6px 12px;
                border-radius: 20px;
                font-size: 13px;
                cursor: pointer;
            }
            
            .chat-header {
                background: var(--tab-bg);
                color: var(--text-light);
                padding: 12px 15px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .back-btn {
                background: none;
                border: none;
                color: var(--text-light);
                font-size: 24px;
                cursor: pointer;
                padding: 0 5px;
            }
            
            .modal {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: var(--modal-bg);
                z-index: 10001;
                justify-content: center;
                align-items: center;
            }
            
            .modal.active {
                display: flex;
            }
            
            .modal-content {
                max-width: 90%;
                max-height: 90%;
                border-radius: 10px;
            }
            
            .modal-close {
                position: absolute;
                top: 20px;
                right: 30px;
                color: var(--text-light);
                font-size: 40px;
                cursor: pointer;
                font-weight: bold;
            }
            
            .toast {
                position: fixed;
                bottom: 30px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--toast-bg);
                color: var(--text-light);
                padding: 12px 24px;
                border-radius: 25px;
                font-size: 14px;
                z-index: 10002;
                display: none;
                backdrop-filter: blur(5px);
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            
            @keyframes fadeIn {
                from { opacity: 0; transform: translateX(-50%) translateY(20px); }
                to { opacity: 1; transform: translateX(-50%) translateY(0); }
            }
            
            .toast.show {
                display: block;
                animation: fadeIn 0.3s;
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
                opacity: 0.7;
                z-index: 9999;
            }
        </style>
    </head>
    <body>
        <div class="theme-switcher">
            <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
        </div>
        
        <div id="imageModal" class="modal" onclick="closeModal()">
            <span class="modal-close">&times;</span>
            <img class="modal-content" id="modalImage">
        </div>
        
        <div id="toast" class="toast"></div>
        
        <div id="authOverlay" class="auth-overlay">
            <div class="auth-box">
                <div class="auth-header">
                    <h2>Skype Classic</h2>
                    <p>Mobile Edition</p>
                </div>
                <div class="auth-form">
                    <div id="authErrorMessage" class="auth-error"></div>
                    <input type="text" id="mobileUsername" class="auth-input" placeholder="Username" value="test" autocomplete="off">
                    <input type="password" id="mobilePassword" class="auth-input" placeholder="Password" value="test" autocomplete="off">
                    <button class="auth-button" id="mobileLoginBtn">Sign In</button>
                </div>
                <div class="auth-footer">
                    <a href="/?desktop=true">Desktop Version</a> • Demo: test/test
                </div>
            </div>
        </div>
        
        <div id="mobileApp" class="hidden">
            <div class="mobile-header">
                <div class="mobile-header-content">
                    <span class="mobile-header-title">Skype Classic</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="mobile-header-user" id="currentUserDisplay">User</span>
                        <button class="logout-btn" onclick="mobileLogout()">Logout</button>
                    </div>
                </div>
            </div>
            
            <div class="mobile-tabs">
                <button class="mobile-tab active" onclick="switchTab('contacts', event)">👥 Contacts</button>
                <button class="mobile-tab" onclick="switchTab('chat', event)">💬 Chat</button>
            </div>
            
            <div id="contactsTab" class="tab-content active">
                <div class="contacts-header">
                    <h3>👥 Contacts</h3>
                    <input type="text" id="contactSearch" class="search-box" placeholder="🔍 Search contacts..." oninput="searchContacts()">
                </div>
                <button class="add-contact-btn" onclick="addContact()">
                    <span style="font-size: 24px;">+</span> Add Friend
                </button>
                <div class="contact-list" id="mobileContactList">
                    <div class="empty-state">
                        <div class="empty-icon">👤</div>
                        <div class="empty-title">No contacts yet</div>
                        <div class="empty-text">Tap "Add Friend" to get started</div>
                    </div>
                </div>
            </div>
            
            <div id="chatTab" class="tab-content">
                <div id="chatHeader" class="chat-header hidden">
                    <button class="back-btn" onclick="leaveChat()">←</button>
                    <span id="chatHeaderTitle">Chat</span>
                </div>
                <div class="chat-messages" id="mobileMessages">
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <div class="empty-title">No chat selected</div>
                        <div class="empty-text">Select a contact to start messaging</div>
                    </div>
                </div>
                <div class="chat-input-container hidden" id="chatInputContainer">
                    <input type="text" id="mobileMessageInput" class="chat-input" placeholder="Type a message..." onkeypress="if(event.key === 'Enter') sendMobileMessage()">
                    <button class="image-button" onclick="selectImage()" title="Send Image">📷</button>
                    <button class="send-button" onclick="sendMobileMessage()">➤</button>
                </div>
            </div>
        </div>
        
        <input type="file" id="imageInput" accept="image/*" style="display: none;">

        <script>
            let mobileUser = null;
            let mobileWs = null;
            let currentChat = null;
            let contacts = [];
            let reconnectAttempts = 0;
            const MAX_RECONNECT = 5;
            let connectionInProgress = false;

            function toggleTheme() {
                const body = document.body;
                const button = document.getElementById('themeToggle');
                
                body.style.transition = 'background 0.5s ease, color 0.3s ease';
                
                if (body.classList.contains('dark-theme')) {
                    body.classList.remove('dark-theme');
                    button.innerHTML = '🌙 Dark';
                    localStorage.setItem('mobileTheme', 'light');
                    showToast('Light theme activated');
                } else {
                    body.classList.add('dark-theme');
                    button.innerHTML = '☀️ Light';
                    localStorage.setItem('mobileTheme', 'dark');
                    showToast('Dark theme activated');
                }
            }
            
            function loadTheme() {
                const savedTheme = localStorage.getItem('mobileTheme');
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

            function syncMessagesToServer() {
                if (!ws || ws.readyState !== WebSocket.OPEN) return;
                if (!currentUser) return;
            
                // Sync each chat's messages
            	Object.keys(chatMessages).forEach(chatId => {
                    const messages = chatMessages[chatId];
                    if (messages && messages.length > 0) {
                        ws.send(JSON.stringify({
                            type: 'sync_messages',
                            chatId: chatId,
                            messages: messages
                        }));
                    }
                });
            }
            
            function getAccounts() {
                try {
                    return JSON.parse(localStorage.getItem('skypeAccounts') || '{}');
                } catch (e) {
                    return {};
                }
            }
            
            function showToast(message, isError = false) {
                const toast = document.getElementById('toast');
                toast.textContent = message;
                toast.style.background = isError ? 'var(--toast-error)' : 'var(--toast-bg)';
                toast.classList.add('show');
                
                setTimeout(() => {
                    toast.classList.remove('show');
                }, 3000);
            }
            
            function mobileLogin() {
                const username = document.getElementById('mobileUsername').value.trim();
                const password = document.getElementById('mobilePassword').value.trim();
                const errorDiv = document.getElementById('authErrorMessage');
                
                errorDiv.classList.remove('show');
                
                if (!username || !password) {
                    errorDiv.textContent = 'Please enter username and password';
                    errorDiv.classList.add('show');
                    return;
                }
                
                const accounts = getAccounts();
                
                if ((accounts[username] && accounts[username].password === password) || 
                    (username === 'test' && password === 'test')) {
                    
                    mobileUser = {
                        username: username,
                        displayName: accounts[username]?.displayName || 
                                   (username === 'test' ? 'Test User' : username)
                    };
                    
                    document.getElementById('authOverlay').style.display = 'none';
                    document.getElementById('mobileApp').classList.remove('hidden');
                    document.getElementById('currentUserDisplay').textContent = mobileUser.displayName;
                    
                    connectionInProgress = false;
                    connectWebSocket();
                    
                    showToast('Login successful!');
                    
                } else {
                    errorDiv.textContent = 'Invalid username or password';
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
                        showToast('Connected to server');
                        
                        mobileWs.send(JSON.stringify({
                            type: 'join',
                            username: mobileUser.username,
                            userId: Date.now(),
                            displayName: mobileUser.displayName,
                            status: 'online'
                        }));
                        
                        setTimeout(() => {
                            if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                                mobileWs.send(JSON.stringify({
                                    type: 'get_contacts',
                                    username: mobileUser.username
                                }));
                            }
                        }, 500);
                    };
                    
                    mobileWs.onmessage = function(event) {
                        try {
                            const data = JSON.parse(event.data);
                            handleMessage(data);
                        } catch (e) {
                            console.error('Error parsing message:', e);
                        }
                    };
                    
                    mobileWs.onerror = function(error) {
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
                switch(data.type) {
                    case 'contact_list':
                        if (data.contacts) {
                            contacts = data.contacts;
                            renderContacts();
                        }
                        break;
                        
                    case 'contact_add_result':
                        if (data.success) {
                            showToast('✅ Contact added!');
                            if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                                mobileWs.send(JSON.stringify({
                                    type: 'get_contacts',
                                    username: mobileUser.username
                                }));
                            }
                        } else {
                            showToast('❌ ' + (data.message || 'Failed to add contact'), true);
                        }
                        break;
                        
                    case 'contact_added':
                        if (data.contact) {
                            showToast('👤 ' + (data.contact.displayName || 'Someone') + ' added you!');
                            if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                                mobileWs.send(JSON.stringify({
                                    type: 'get_contacts',
                                    username: mobileUser.username
                                }));
                            }
                        }
                        break;
                        
                    case 'new_message':
                        if (data.data) {
                            if (data.data.from === currentChat || data.data.to === currentChat) {
                                displayMessage(data.data, data.data.from === mobileUser.username);
                            } else {
                                showToast('📨 New message from ' + (data.data.fromDisplay || data.data.from));
                            }
                        }
                        break;
                        
                    case 'image_receive':
                        if (data.from === currentChat || data.to === currentChat) {
                            displayImage(data);
                        } else {
                            showToast('📷 Image from ' + (data.fromDisplay || data.from));
                        }
                        break;
                        
                    case 'chat_history':
                        if (data.messages) {
                            document.getElementById('mobileMessages').innerHTML = '';
                            data.messages.forEach(msg => {
                                if (msg.imageData) {
                                    displayImage(msg, msg.from === mobileUser.username);
                                } else {
                                    displayMessage(msg, msg.from === mobileUser.username);
                                }
                            });
                        }
                        break;
                        
                    case 'user_join':
                    case 'user_leave':
                        if (data.users) {
                            updateContactStatuses(data.users);
                        }
                        break;
                }
            }
            
            function updateContactStatuses(onlineUsers) {
                contacts.forEach(contact => {
                    const online = onlineUsers.find(u => u.username === contact.username);
                    contact.status = online ? (online.status || 'online') : 'offline';
                });
                renderContacts();
            }
            
            function renderContacts() {
                const list = document.getElementById('mobileContactList');
                
                if (contacts.length === 0) {
                    list.innerHTML = \`
                        <div class="empty-state">
                            <div class="empty-icon">👤</div>
                            <div class="empty-title">No contacts yet</div>
                            <div class="empty-text">Tap "Add Friend" to get started</div>
                        </div>
                    \`;
                    return;
                }
                
                list.innerHTML = contacts.map(contact => \`
                    <div class="mobile-contact" onclick="selectContact('\${contact.username}', '\${contact.displayName}')">
                        <div class="contact-avatar">\${contact.displayName.charAt(0).toUpperCase()}</div>
                        <div class="contact-info">
                            <div class="contact-name">\${contact.displayName}</div>
                            <div class="contact-status \${contact.status === 'online' ? 'online' : 'offline'}">
                                <span class="status-dot"></span>
                                \${contact.status === 'online' ? 'Online' : 'Offline'}
                            </div>
                        </div>
                    </div>
                \`).join('');
            }
            
            function searchContacts() {
                const searchTerm = document.getElementById('contactSearch').value.toLowerCase();
                const contactElements = document.querySelectorAll('.mobile-contact');
                
                contactElements.forEach(contact => {
                    const name = contact.querySelector('.contact-name').textContent.toLowerCase();
                    contact.style.display = name.includes(searchTerm) ? 'flex' : 'none';
                });
            }
            
            function addContact() {
                if (!mobileUser) {
                    showToast('Please login first', true);
                    return;
                }
                
                if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) {
                    showToast('Connecting to server...', true);
                    connectWebSocket();
                    return;
                }
                
                const username = prompt('Enter username to add:');
                if (!username || !username.trim()) return;
                
                if (username === mobileUser.username) {
                    showToast("You can't add yourself!", true);
                    return;
                }
                
                if (contacts.find(c => c.username === username)) {
                    showToast('Contact already exists!', true);
                    return;
                }
                
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
                
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('chatHeaderTitle').textContent = displayName;
                document.getElementById('chatInputContainer').classList.remove('hidden');
                document.getElementById('mobileMessages').innerHTML = '';
                
                switchTab('chat');
                
                if (mobileWs && mobileWs.readyState === WebSocket.OPEN) {
                    mobileWs.send(JSON.stringify({
                        type: 'get_history',
                        with: username
                    }));
                }
                
                setTimeout(() => {
                    document.getElementById('mobileMessageInput').focus();
                }, 300);
            }
            
            function leaveChat() {
                currentChat = null;
                document.getElementById('chatHeader').classList.add('hidden');
                document.getElementById('chatInputContainer').classList.add('hidden');
                document.getElementById('mobileMessages').innerHTML = \`
                    <div class="empty-state">
                        <div class="empty-icon">💬</div>
                        <div class="empty-title">No chat selected</div>
                        <div class="empty-text">Select a contact to start messaging</div>
                    </div>
                \`;
                switchTab('contacts');
            }
            
            function selectImage() {
                if (!currentChat) {
                    showToast('Select a chat first!', true);
                    return;
                }
                
                if (!mobileWs || mobileWs.readyState !== WebSocket.OPEN) {
                    showToast('Not connected to server', true);
                    return;
                }
                
                document.getElementById('imageInput').click();
            }
            
            document.getElementById('imageInput').addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (!file) return;
                
                if (!file.type.startsWith('image/')) {
                    showToast('Please select an image file', true);
                    return;
                }
                
                if (file.size > 5 * 1024 * 1024) {
                    showToast('Image too large! Max 5MB', true);
                    return;
                }
                
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
            
            function sendMobileMessage() {
                const input = document.getElementById('mobileMessageInput');
                const message = input.value.trim();
                
                if (!message || !currentChat || !mobileWs) return;
                
                if (mobileWs.readyState !== WebSocket.OPEN) {
                    showToast('Not connected to server', true);
                    return;
                }
                
                const messageData = {
                    id: Date.now(),
                    from: mobileUser.username,
                    fromDisplay: mobileUser.displayName,
                    to: currentChat,
                    message: message,
                    timestamp: new Date().toISOString()
                };
                
                mobileWs.send(JSON.stringify({
                    type: 'message',
                    data: messageData
                }));
                
                displayMessage(messageData, true);
                input.value = '';
            }
            
            function displayMessage(data, isSelf = false) {
                const messagesDiv = document.getElementById('mobileMessages');
                
                const emptyState = messagesDiv.querySelector('.empty-state');
                if (emptyState) emptyState.remove();
                
                const time = new Date(data.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${isSelf ? 'message-self' : 'message-other'}\`;
                
                messageDiv.innerHTML = \`
                    <div class="message-sender">\${data.fromDisplay || data.from}</div>
                    <div class="message-bubble">\${data.message}</div>
                    <div class="message-time">\${time}</div>
                \`;
                
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            
            function displayImage(data, isSelf = false) {
                const messagesDiv = document.getElementById('mobileMessages');
                
                const emptyState = messagesDiv.querySelector('.empty-state');
                if (emptyState) emptyState.remove();
                
                const time = new Date(data.timestamp).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
                const messageDiv = document.createElement('div');
                messageDiv.className = \`message \${isSelf ? 'message-self' : 'message-other'}\`;
                
                messageDiv.innerHTML = \`
                    <div class="message-sender">\${data.fromDisplay || data.from}</div>
                    <div class="message-bubble" style="background: none; padding: 5px;">
                        <img src="\${data.imageData}" class="message-image" onclick="openModal('\${data.imageData}')">
                    </div>
                    <div class="message-time">\${time}</div>
                \`;
                
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            
            function openModal(imageSrc) {
                document.getElementById('modalImage').src = imageSrc;
                document.getElementById('imageModal').classList.add('active');
            }
            
            function closeModal() {
                document.getElementById('imageModal').classList.remove('active');
            }
            
            function switchTab(tabName, event) {
                document.querySelectorAll('.mobile-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                event.target.classList.add('active');
                
                document.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                document.getElementById(tabName + 'Tab').classList.add('active');
            }
            
            function mobileLogout() {
                if (mobileWs) {
                    mobileWs.close();
                }
                
                mobileUser = null;
                currentChat = null;
                contacts = [];
                connectionInProgress = false;
                
                document.getElementById('mobileApp').classList.add('hidden');
                document.getElementById('authOverlay').style.display = 'flex';
                document.getElementById('mobileUsername').value = 'test';
                document.getElementById('mobilePassword').value = 'test';
                document.getElementById('authErrorMessage').classList.remove('show');
                showToast('Logged out');
            }
            
            document.addEventListener('DOMContentLoaded', function() {
                loadTheme();
                
                const loginBtn = document.getElementById('mobileLoginBtn');
                if (loginBtn) {
                    loginBtn.addEventListener('click', mobileLogin);
                }
                
                document.getElementById('mobilePassword').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') mobileLogin();
                });
                
                document.getElementById('imageModal').addEventListener('click', function(e) {
                    if (e.target === this) closeModal();
                });
            });
        </script>
        
        <div class="footer-note">
            Fan project. Not affiliated with Microsoft.
        </div>
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
            
            /* Profile specific styles */
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
        <!-- Theme Switcher -->
        <div class="theme-switcher">
            <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
        </div>
        
        <!-- Global Update Banner -->
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
                <!-- Profile Header -->
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
                
                <!-- Tagline -->
                <div class="tagline">
                    "I'm a student who loves programming and building digital projects. I'm self-learning Python and C++, and I'm always exploring AI tools. Also, goofing around is present in my daily schedule."
                </div>
                
                <!-- About Me -->
                <div class="xp-fieldset">
                    <div class="xp-legend">👋 About Me</div>
                    <p style="line-height: 1.7; font-size: 12px;">
                        I'm a student at HSE Lyceum in Moscow. I'm passionate about programming and building 
                        digital projects. I'm self-learning Python and C++, and I'm also developing my skills 
                        with AI tools. I'm looking for opportunities to apply my skills in practice, grow in 
                        interesting projects, and gain my first experience in the IT field.
                    </p>
                </div>
                
                <!-- Skills -->
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
                
                <!-- Languages -->
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
                
                <!-- Projects -->
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
                
                <!-- Achievements -->
                <div class="xp-fieldset">
                    <div class="xp-legend">🏆 Achievements & Extracurriculars</div>
                    <ul style="margin-left: 20px; line-height: 1.8; font-size: 12px;">
                        <li>✅ Developed and launched my own web project (skypeclassic messenger)</li>
                        <li>✅ Successfully balance school with fun programming, which has developed my development and AI skills</li>
                        <li>✅ Built a full messenger with voice calls, groups, and image sharing</li>
                    </ul>
                </div>
                
                <!-- Education -->
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
                
                <!-- Contact -->
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
                
                <!-- Navigation -->
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

// ===== ANALYTICS PAGE =====
app.get('/analytics', (req, res) => {
    console.log('📊 Serving analytics page');
    
    const onlineUsers = Array.from(users.values()).filter(u => u.status === 'online').length;
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
            * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Tahoma', 'Arial', sans-serif; }
            body { 
            	background: url('/images/bbg.jpg');
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
                width: 600px; 
                background: #ECE9D8; 
                border: 2px solid; 
                border-top-color: #FFFFFF; 
                border-left-color: #FFFFFF; 
                border-right-color: #000000; 
                border-bottom-color: #000000; 
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
            .xp-content { padding: 20px; }
            .stat-box { 
                background: white; 
                border: 2px solid; 
                border-top-color: #FFFFFF; 
                border-left-color: #FFFFFF; 
                border-right-color: #808080; 
                border-bottom-color: #808080;
                padding: 15px; 
                margin: 15px 0; 
            }
            .stat-title { 
                font-weight: bold; 
                color: #0A246A; 
                margin-bottom: 5px; 
                font-size: 14px;
            }
            .stat-value { 
                font-size: 32px; 
                color: #6C00A0; 
                font-weight: bold;
            }
            .ascii-art { 
                font-family: monospace; 
                background: black; 
                color: #00ff00; 
                padding: 15px; 
                margin: 15px 0; 
                font-size: 14px;
                line-height: 1.4;
            }
            .nav-links {
                text-align: center;
                margin-top: 20px;
                padding-top: 15px;
                border-top: 1px solid #808080;
            }
            .nav-links a {
                color: #FFFFFF;
                margin: 0 10px;
                text-decoration: none;
                font-weight: bold;
            }
            .nav-links a:hover {
                text-decoration: underline;
            }
            .xp-button {
                background: #ECE9D8;
                color: black;
                width: 22px;
                height: 20px;
                text-align: center;
                line-height: 20px;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
                cursor: pointer;
            }
        </style>
    </head>
    <body>
        <div class="global-banner">
            <marquee behavior="scroll" direction="left" scrollamount="6" style="color: #0A246A; font-weight: bold; font-size: 14px; font-family: 'Tahoma', 'Arial', sans-serif; text-shadow: 1px 1px 0 #FFFFFF;">
                🎉 UPDATE 1.3: THE MULTIMEDIA DRIVE UPDATE HAS COME OUT! 🎉 CHECK OUT /ANALYTICS FOR MORE INFO! 📊 NEW FEATURES: MUSIC SHARING • RETRO MODE • DEV TERMINAL • MOBILE SYNC • GROUP CHATS • IMAGE SHARING • AND MORE! 🚀
            </marquee>
        </div>
        
        <div class="xp-window">
            <div class="xp-titlebar">
                <span>📊 Skype Classic Analytics</span>
                <div style="display: flex; gap: 2px;">
                    <div class="xp-button" onclick="window.location='/'">_</div>
                    <div class="xp-button" onclick="window.location='/'">×</div>
                </div>
            </div>
            <div class="xp-content">
                <h2 style="color: #0A246A; margin-bottom: 20px; text-align: center;">📈 Usage Statistics</h2>
                
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
                
                <div class="stat-box">
                    <div class="stat-title">📊 Activity Graph (Last 24h)</div>
                    <div class="ascii-art">
                        ${'█'.repeat(Math.min(30, messagesToday))} ${messagesToday} messages<br>
                        ${'█'.repeat(Math.min(30, onlineUsers))} ${onlineUsers} users online<br>
                        ${'█'.repeat(Math.min(30, totalGroups))} ${totalGroups} active groups
                    </div>
                </div>

                 <!-- ===== WHAT'S NEW BANNER ===== -->
                 <div style="margin: 30px 0 20px 0; padding: 15px; background: linear-gradient(135deg, #6C00A0, #0A246A); color: white; border-radius: 10px; border: 2px solid gold; box-shadow: 0 5px 15px rgba(0,0,0,0.2);">
                     <div style="text-align: center; margin-bottom: 20px;">
                         <img src="/images/mmdpatch.png" 
                              alt="What's New in Skype Classic" 
                              style="width: 457px; height: 26px; border-radius: 4px; border: 1px solid white; display: block; margin: 0 auto;">
                     </div>
                     
                     <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 15px;">
                         <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-bottom: 15px;">
                             
                             <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 6px;">
                                 <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                     <span>📱</span> Mobile Version
                                 </div>
                                 <div style="font-size: 13px; line-height: 1.4;">
                                     • Access at <strong>/mobile</strong><br>
                                     • Add friends & search<br>
                                     • Full sync with desktop
                                 </div>
                             </div>
                             
                             <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 6px;">
                                 <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                     <span>🎶</span> Music Sharing
                                 </div>
                                 <div style="font-size: 13px; line-height: 1.4;">
                                     • Access at <strong>/music</strong><br>
                                     • Share your own music<br>
                                     • Like other's creations
                                 </div>
                             </div>

                             <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 6px;">
                                 <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                     <span>💻</span> Retro Version
                                 </div>
                                 <div style="font-size: 13px; line-height: 1.4;">
                                     • Access at <strong>/old</strong><br>
                                     • Works on super old pcs and browsers<br>
                                     • More of a showcase rather than a functional version
                                 </div>
                             </div>
                             
                             <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 6px;">
                                 <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                     <span>✨</span> New Features
                                 </div>
                                 <div style="font-size: 13px; line-height: 1.4;">
                                     • Better performance<br>
                                     • Dark mode<br
                                 </div>
                             </div>
                             
                         </div>
                         
                         <div style="background: rgba(255,255,255,0.15); padding: 12px; border-radius: 6px;">
                             <div style="font-size: 16px; font-weight: bold; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
                                 <span>🚀</span> Coming Soon
                             </div>
                             <div style="font-size: 13px; line-height: 1.4; display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                                 <div>
                                     <strong>📸 Mobile Images</strong><br>
                                     Send photos from phone (in testing right now)
                                 </div>
                                 <div>
                                     <strong>👤 User Profiles</strong><br>
                                     Custom avatars
                                 </div>
                                 <div>
                                     <strong>☎️ VoIP Calling</strong><br>
                                     Voice/Video calling (in testing right now)
                                 </div>
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
                
                <div style="text-align: center; margin-top: 20px; color: #666; font-size: 11px;">
                    Last updated: ${new Date().toLocaleTimeString()}<br>
                    <small>skypeclassic.ru - Your Classic Chat Experience</small>
                </div>
            </div>
        </div>
        
        <script>
            setTimeout(() => location.reload(), 60000);
        </script>
        
        <div style="position: fixed; bottom: 5px; right: 5px; font-size: 9px; color: #666; background: rgba(255,255,255,0.7); padding: 2px 5px; border-radius: 3px;">
            Fan project. Not affiliated with Microsoft.
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
                🎉 UPDATE 1.3: THE MULTIMEDIA DRIVE UPDATE HAS COME OUT! 🎉 CHECK OUT /ANALYTICS FOR MORE INFO! 📊
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
                <!-- Login Section -->
                <div id="loginSection" class="login-section" ${currentUser ? 'style="display:none;"' : ''}>
                    <h3 style="color: #0A246A; margin-bottom: 15px;">🔐 Login to Music Sharing</h3>
                    <input type="text" id="musicUsername" class="login-input" placeholder="Username" value="test">
                    <input type="password" id="musicPassword" class="login-input" placeholder="Password" value="test">
                    <button class="login-btn" onclick="musicLogin()">Login</button>
                    <p style="margin-top: 10px; color: #666; font-size: 12px;">Demo: test/test or use your Skype Classic account</p>
                </div>
                
                <!-- User Info -->
                <div id="userInfo" class="user-info" ${currentUser ? '' : 'style="display:none;"'}>
                    <div>
                        <span style="font-size: 18px;">👋 Welcome, <span id="displayName">${userDisplay || 'Guest'}</span>!</span>
                        <span style="margin-left: 20px; color: #A0C0FF;">⭐ Music Creator</span>
                    </div>
                    <div>
                        <button class="logout-btn" onclick="musicLogout()" style="background: none; border: 1px solid white; color: white; padding: 5px 15px; cursor: pointer;">Logout</button>
                    </div>
                </div>
                
                <!-- Stats Bar -->
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
                
                <!-- Message Display -->
                <div id="messageBox" class="message"></div>
                
                <!-- Main Tabs -->
                <div class="tabs">
                    <div class="tab active" onclick="switchTab('discover')">🎵 Discover</div>
                    <div class="tab" onclick="switchTab('upload')">📤 Upload</div>
                    <div class="tab" onclick="switchTab('playlists')">📋 My Playlists</div>
                    <div class="tab" onclick="switchTab('following')">👥 Following</div>
                    <div class="tab" onclick="switchTab('notifications')">🔔 Notifications</div>
                </div>
                
                <!-- Discover Tab -->
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
                
                <!-- Upload Tab -->
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
                
                <!-- Playlists Tab -->
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
                
                <!-- Following Tab -->
                <div id="followingTab" class="tab-content">
                    <div id="followingContainer">
                        <div class="empty-state" style="text-align: center; padding: 40px;">
                            <div style="font-size: 48px;">👥</div>
                            <h3>Not following anyone</h3>
                            <p>Follow artists to see their new music</p>
                        </div>
                    </div>
                </div>
                
                <!-- Notifications Tab -->
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
            
            function musicLogin() {
                const username = document.getElementById('musicUsername').value.trim();
                const password = document.getElementById('musicPassword').value.trim();
                
                if (username && password) {
                    currentMusicUser = username;
                    userDisplayName = username === 'test' ? 'Test User' : username;
                    
                    document.getElementById('loginSection').style.display = 'none';
                    document.getElementById('userInfo').style.display = 'block';
                    document.getElementById('displayName').textContent = userDisplayName;
                    
                    loadUserData();
                    showMessage('✅ Login successful! Welcome to Music Sharing!', 'success');
                    
                    window.history.pushState({}, '', '/music?username=' + username + '&display=' + userDisplayName);
                } else {
                    showMessage('❌ Please enter username and password', 'error');
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
                const desc = document.getElementById('trackDesc').value.trim();
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

// Standalone App version for EXE (pure XP window, no outer background/banner)
app.get('/app', (req, res) => {
    console.log("📱 Serving standalone app version for EXE");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
<!DOCTYPE html>
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
            --text-secondary: #666666;
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
            --text-secondary: #b0b0b0;
        }
        
        body {
            background: var(--bg-primary);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
            margin: 0;
            color: var(--text-primary);
        }
        
        /* Custom titlebar for EXE window dragging */
        .app-titlebar {
            background: linear-gradient(90deg, var(--titlebar-start), var(--titlebar-end));
            color: var(--text-light);
            padding: 6px 12px;
            font-size: 12px;
            font-weight: bold;
            display: flex;
            justify-content: space-between;
            align-items: center;
            user-select: none;
            -webkit-app-region: drag;
            cursor: default;
        }
        
        .app-titlebar-buttons {
            display: flex;
            gap: 4px;
            -webkit-app-region: no-drag;
        }
        
        .window-btn {
            width: 24px;
            height: 20px;
            border: 1px solid;
            border-top-color: var(--border-light);
            border-left-color: var(--border-light);
            border-right-color: var(--border-dark);
            border-bottom-color: var(--border-dark);
            background: var(--button-bg);
            font-size: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--text-primary);
        }
        
        .window-btn:hover {
            background: var(--contact-hover);
            color: var(--text-light);
        }
        
        .close-btn:hover {
            background: #E81123;
            color: white;
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
        
        .status-online-small { color: #4CAF50; }
        .status-offline-small { color: #999; }
        
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
        
        .send-button, .call-button, .image-button {
            padding: 8px 15px;
            background: var(--titlebar-start);
            color: var(--text-light);
            border: none;
            cursor: pointer;
            border-radius: 4px;
        }
        
        .send-button:hover, .call-button:hover, .image-button:hover {
            background: var(--titlebar-end);
        }
        
        .call-button {
            background: #00A300;
        }
        
        .image-button {
            background: #6C00A0;
        }
        
        .hidden {
            display: none;
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
        
        .sound-control {
            position: absolute;
            top: 30px;
            right: 10px;
            background: var(--window-bg);
            padding: 5px;
            border-radius: 3px;
            font-size: 10px;
            z-index: 9998;
            border: 1px solid var(--border-dark);
            color: var(--text-primary);
        }
        
        .theme-switcher {
            position: absolute;
            top: 30px;
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
    </style>
</head>
<body>
    <!-- Custom Titlebar for EXE -->
    <div class="app-titlebar">
        <span>📞 Skype Classic</span>
        <div class="app-titlebar-buttons">
            <button class="window-btn" onclick="minimizeWindow()">─</button>
            <button class="window-btn" onclick="maximizeWindow()">□</button>
            <button class="window-btn close-btn" onclick="closeWindow()">×</button>
        </div>
    </div>
    
    <!-- Theme Switcher -->
    <div class="theme-switcher">
        <button id="themeToggle" class="theme-btn" onclick="toggleTheme()">🌙 Dark</button>
    </div>
    
    <!-- Sound Control -->
    <div class="sound-control">
        <label>
            <input type="checkbox" id="soundToggle" checked> Sounds
        </label>
    </div>

    <!-- Audio Elements -->
    <audio id="logoutSound" preload="auto"><source src="/sounds/logoff.mp3" type="audio/mpeg"></audio>
    <audio id="messageSound" preload="auto"><source src="/sounds/messagereceived.mp3" type="audio/mpeg"></audio>
    <audio id="loginSound" preload="auto"><source src="/sounds/logon.mp3" type="audio/mpeg"></audio>
    <audio id="sendSound" preload="auto"><source src="/sounds/messagesent.mp3" type="audio/mpeg"></audio>
    <audio id="callSound" preload="auto" loop><source src="/sounds/call_incoming.mp3" type="audio/mpeg"></audio>
    <audio id="dialingSound" preload="auto" loop><source src="/sounds/dialing.mp3" type="audio/mpeg"></audio>
    <audio id="callEndSound" preload="auto"><source src="/sounds/call_end.mp3" type="audio/mpeg"></audio>
    <audio id="callAcceptSound" preload="auto"><source src="/sounds/call_accept.mp3" type="audio/mpeg"></audio>
    <audio id="callErrorSound" preload="auto"><source src="/sounds/call_error.mp3" type="audio/mpeg"></audio>

    <!-- Login Window -->
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

    <!-- Main Chat Window -->
    <div id="chatWindow" class="xp-window chat-window hidden">
        <div class="xp-titlebar">
            <span>📞 Skype Classic - <span id="currentUser">User</span></span>
            <div class="xp-titlebar-controls">
                <div class="xp-button">_</div>
                <div class="xp-button">□</div>
                <div class="xp-button" onclick="logout()">×</div>
            </div>
        </div>
        <div class="xp-content">
            <div class="chat-layout">
                <!-- Contacts Panel -->
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
                
                <!-- Chat Panel -->
                <div class="chat-panel">
                    <div class="xp-fieldset" style="height: 100%; display: flex; flex-direction: column;">
                        <legend class="xp-legend">Chat <span id="currentChatWith"></span></legend>
                        <div id="chatArea" style="flex: 1; display: flex; flex-direction: column; min-height: 0;">
                            <!-- Dynamic chat containers will be added here -->
                        </div>
                    </div>
                </div>
            </div>
            <div class="xp-status-bar">
                <span id="chatStatus">Ready to chat...</span>
            </div>
        </div>
    </div>

    <!-- Incoming Call Window -->
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

    <!-- Active Call Window -->
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

    <!-- Group Creation Window -->
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

    <!-- Analytics Popup -->
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
    
    <!-- Image Modal -->
    <div id="imageModal" onclick="closeImageModal()">
        <span class="modal-close">&times;</span>
        <img id="modalImage">
    </div>

    <script>
        // ===== EXE WINDOW CONTROLS =====
        function minimizeWindow() {
            if (window.electronAPI) {
                window.electronAPI.minimize();
            }
        }
        
        function maximizeWindow() {
            if (window.electronAPI) {
                window.electronAPI.maximize();
            }
        }
        
        function closeWindow() {
            if (window.electronAPI) {
                window.electronAPI.close();
            }
        }
        
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
        
        // WebRTC variables
        let localStream = null;
        let remoteStream = null;
        let peerConnection = null;
        let isMuted = false;
        let isDeafened = false;
        let microphonePermissionGranted = false;
        let connectionInProgress = false;

        const rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };

        // ===== THEME MANAGEMENT =====
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

        // ===== MESSAGE STORAGE FUNCTIONS =====

        function syncMessagesToServer() {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            if (!currentUser) return;
            
            // Sync each chat's messages
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
                // Sync local messages to server
                syncMessagesToServer();
            } else {
                chatMessages = {};
                // Request message history from server
                if (ws && ws.readyState === WebSocket.OPEN) {
                    // Request history for each contact
                    userContacts.forEach(contact => {
                        ws.send(JSON.stringify({
                            type: 'get_message_history',
                            chatId: contact.username
                        }));
                    });
                }
            }
        }
        
        function addMessageToChat(contact, messageData) {
            if (!chatMessages[contact]) {
                chatMessages[contact] = [];
            }
            
            // Check if message already exists
            const exists = chatMessages[contact].some(m => m.id === messageData.id);
            if (!exists) {
                chatMessages[contact].push(messageData);
                saveMessagesToLocalStorage();
                syncMessagesToServer();
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

        // ===== CONTACT MANAGEMENT =====
        function loadContacts() {
            // First load from localStorage as backup
            const savedContacts = localStorage.getItem('userContacts_' + currentUser.username);
            if (savedContacts) {
                userContacts = JSON.parse(savedContacts);
                updateContactList();
            }
            
            // Then request from server to get latest
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
            
            // Create contact tabs
            userContacts.forEach(contact => {
                const contactTab = document.createElement('div');
                contactTab.className = 'contact-tab' + (currentChat === contact.username ? ' active' : '');
                contactTab.setAttribute('data-contact', contact.username);
                contactTab.innerHTML = \`
                    <div class="contact-avatar-small">\${contact.displayName.charAt(0).toUpperCase()}</div>
                    <div class="contact-info-small">
                        <div class="contact-name-small">\${contact.displayName}</div>
                        <div class="contact-status-small status-\${contact.status === 'online' ? 'online-small' : 'offline-small'}">
                            <span>●</span> \${contact.status === 'online' ? 'Online' : 'Offline'}
                        </div>
                    </div>
                \`;
                contactTab.onclick = () => switchChat(contact.username, contact.displayName);
                contactsPanel.appendChild(contactTab);
                
                // Create chat container for this contact if it doesn't exist
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
                        </div>
                    \`;
                    chatArea.appendChild(chatContainer);
                    
                    // Setup image input for this contact
                    document.getElementById('imageInput_' + contact.username).addEventListener('change', (e) => {
                        handleImageUpload(e, contact.username);
                    });
                }
                
                // Load messages for this contact
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
            
            // Hide all chat containers and show the selected one
            document.querySelectorAll('.chat-container').forEach(container => {
                container.classList.remove('active');
            });
            const activeContainer = document.getElementById('chatContainer_' + username);
            if (activeContainer) {
                activeContainer.classList.add('active');
            }
            
            // Update active contact tab styling
            document.querySelectorAll('.contact-tab').forEach(tab => {
                tab.classList.remove('active');
                if (tab.getAttribute('data-contact') === username) {
                    tab.classList.add('active');
                }
            });
            
            // Render messages for this contact
            renderMessagesForChat(username);
            
            // Focus the input
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
                    contact.status = onlineUser.status;
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
            // This is a global system message, we can show it in a temporary toast or just log
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

        // ===== LOGIN FUNCTIONS =====
        function login() {
            const username = document.getElementById('loginUsername').value;
            const password = document.getElementById('loginPassword').value;
            const status = document.getElementById('statusMessage');
            
            if (username && password) {
                const accounts = JSON.parse(localStorage.getItem('skypeAccounts') || '{}');
                
                if (accounts[username] && accounts[username].password === password) {
                    currentUser = { 
                        username: username, 
                        id: Date.now(),
                        displayName: accounts[username].displayName || username
                    };
                    status.textContent = 'Login successful!';
                    playLoginSound();
                    showChatWindow();
                    connectWebSocket();
                } else if (username === 'test' && password === 'test') {
                    currentUser = { username: 'test', id: 1, displayName: 'Test User' };
                    status.textContent = 'Login successful!';
                    playLoginSound();
                    showChatWindow();
                    connectWebSocket();
                } else {
                    status.textContent = 'Account not found! Please register first.';
                }
            } else {
                status.textContent = 'Please enter username and password';
            }
        }
        
        function register() {
            const username = document.getElementById('regUsername').value;
            const password = document.getElementById('regPassword').value;
            const email = document.getElementById('regEmail').value;
            const displayName = document.getElementById('regDisplayName').value || username;
            const status = document.getElementById('statusMessage');
            
            if (username && password) {
                const accounts = JSON.parse(localStorage.getItem('skypeAccounts') || '{}');
                
                if (accounts[username]) {
                    status.textContent = 'Username already exists!';
                    return;
                }
                
                accounts[username] = {
                    password: password,
                    email: email,
                    displayName: displayName,
                    created: new Date().toISOString()
                };
                
                localStorage.setItem('skypeAccounts', JSON.stringify(accounts));
                
                status.textContent = 'Account created! Please login.';
                showTab('login');
                
                document.getElementById('regUsername').value = '';
                document.getElementById('regPassword').value = '';
                document.getElementById('regEmail').value = '';
                document.getElementById('regDisplayName').value = '';
            } else {
                status.textContent = 'Please fill in username and password';
            }
        }
        
        function showChatWindow() {
            document.getElementById('loginWindow').classList.add('hidden');
            document.getElementById('chatWindow').classList.remove('hidden');
            document.getElementById('currentUser').textContent = currentUser.displayName;
            
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
                    contacts: savedContacts
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
                        // Merge server messages with local messages
                        data.messages.forEach(msg => {
                            if (!chatMessages[chatId].find(m => m.id === msg.id)) {
                                chatMessages[chatId].push(msg);
                            }
                        });
                        saveMessagesToLocalStorage();
                        if (currentChat === chatId) {
                            renderMessagesForChat(chatId);
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
                    // Store the call ID or just use the from username as identifier
                    window.currentCallId = data.callId || 'call_' + Date.now();
                    break;
                    
                case 'call_accepted':
                    console.log('📞 Call accepted by:', data.from);
                    stopCallSounds();
                    playCallAcceptSound();
                    document.getElementById('callWindow').classList.remove('hidden');
                    document.getElementById('callTarget').textContent = data.fromDisplay || data.from;
                    document.getElementById('callStatus').textContent = 'In call with ' + (data.fromDisplay || data.from);
                    startCallTimer();
                    isInCall = true;
                    currentCallWith = data.from;
                    // Start WebRTC as caller
                    setupWebRTC(true);
                    break;
                    
                case 'call_declined':
                    console.log('📞 Call declined by:', data.from);
                    stopCallSounds();
                    playCallEndSound();
                    document.getElementById('callWindow').classList.add('hidden');
                    document.getElementById('incomingCallWindow').classList.add('hidden');
                    addSystemMessage((data.fromDisplay || data.from) + ' declined your call');
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
                        }
                        if (data.messages.length > 0) {
                            const sortedMessages = [...data.messages].sort((a, b) => a.id - b.id);
                            messageCounter = Math.max(messageCounter, sortedMessages[sortedMessages.length - 1].id);
                        }
                    }
                    break;
                    
                case 'call_end':
                    console.log('📞 Call ended by:', data.from);
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
                        addSystemMessage('Call ended by ' + (data.fromDisplay || data.from));
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
                    if (data.success) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                type: 'get_contacts',
                                username: currentUser.username
                            }));
                        }
                    }
                    break;
                    
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
            }
        }
        
        function changeStatus(status) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'status_change',
                    status: status
                }));
                document.getElementById('chatStatus').textContent = 'Status: ' + status;
            }
        }
        
        function logout() {
            playLogoutSound();
            if (ws) {
                ws.close();
            }
            document.getElementById('chatWindow').classList.add('hidden');
            document.getElementById('loginWindow').classList.remove('hidden');
            currentUser = null;
            currentChat = null;
            messageCounter = 0;
            chatMessages = {};
            document.getElementById('statusMessage').textContent = 'Logged out successfully';
            cleanupWebRTC();
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
        
        // ===== SOUND FUNCTIONS =====
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
            
            // Request permission first if not granted
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
                
                // Create a unique call ID
                const callId = 'call_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                window.currentCallId = callId;
                
                document.getElementById('callTarget').textContent = currentChat;
                document.getElementById('callWindow').classList.remove('hidden');
                document.getElementById('callStatus').textContent = 'Calling ' + currentChat + '...';
                document.getElementById('callTimer').textContent = 'Calling...';
                
                // Send call request with callId
                ws.send(JSON.stringify({
                    type: 'call_request',
                    callId: callId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentChat
                }));
                
                // Timeout after 30 seconds
                setTimeout(() => {
                    if (document.getElementById('callWindow') && 
                        document.getElementById('callWindow').classList.contains('hidden') === false && 
                        document.getElementById('callStatus').textContent.includes('Calling')) {
                        addSystemMessage('Call timed out - no answer from ' + currentChat);
                        endCall();
                    }
                }, 30000);
            }
        }
        
        function acceptIncomingCall() {
            console.log('ANSWER button clicked!');
            stopCallSounds();
            playCallAcceptSound();
            
            // Request permission first if not granted
            if (!microphonePermissionGranted) {
                requestMicrophonePermission().then(() => {
                    if (microphonePermissionGranted) {
                        acceptIncomingCall();
                    }
                });
                return;
            }
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            document.getElementById('callWindow').classList.remove('hidden');
            document.getElementById('callTarget').textContent = incomingCallFrom;
            document.getElementById('callStatus').textContent = 'In call with ' + incomingCallFrom;
            
            startCallTimer();
            isInCall = true;
            currentCallWith = incomingCallFrom;
            
            // Start WebRTC as callee
            setupWebRTC(false);
            
            // Send acceptance with callId
            ws.send(JSON.stringify({
                type: 'call_accepted',
                callId: window.currentCallId,
                from: currentUser.username,
                fromDisplay: currentUser.displayName,
                to: incomingCallFrom
            }));
            
            incomingCallFrom = null;
        }
        
        function declineIncomingCall() {
            console.log('DECLINE button clicked!');
            stopCallSounds();
            playCallEndSound();
            
            document.getElementById('incomingCallWindow').classList.add('hidden');
            
            if (incomingCallFrom) {
                // Send decline signal to the caller
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'call_declined',
                        callId: window.currentCallId,
                        from: currentUser.username,
                        to: incomingCallFrom
                    }));
                }
                addSystemMessage('Call declined');
                incomingCallFrom = null;
            }
            
            // Clean up any pending WebRTC setup
            cleanupWebRTC();
        }
        
        function endCall() {
            console.log('END CALL button clicked!');
            stopCallSounds();
            playCallEndSound();
            
            // Hide call windows
            const callWindow = document.getElementById('callWindow');
            const incomingCallWindow = document.getElementById('incomingCallWindow');
            if (callWindow) callWindow.classList.add('hidden');
            if (incomingCallWindow) incomingCallWindow.classList.add('hidden');
            
            // Stop timer
            if (callTimerInterval) {
                clearInterval(callTimerInterval);
                callTimerInterval = null;
            }
            
            // Notify the other person if we're in a call
            if (currentCallWith && ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'call_end',
                    callId: window.currentCallId,
                    from: currentUser.username,
                    fromDisplay: currentUser.displayName,
                    to: currentCallWith
                }));
                addSystemMessage('Call ended with ' + currentCallWith);
            }
            
            // Clean up WebRTC
            cleanupWebRTC();
            
            // Reset call state
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
        
        // ===== WEBRTC FUNCTIONS =====
        async function requestMicrophonePermission() {
            try {
                console.log('Requesting microphone permission...');
                
                // Try to get both audio and video
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    audio: true,
                    video: true
                });
                
                console.log('Microphone and camera access granted!');
                microphonePermissionGranted = true;
                
                // Stop all tracks immediately - we just wanted permission
                stream.getTracks().forEach(track => track.stop());
                
                hidePermissionPrompt();
                return true;
                
            } catch (error) {
                console.error('Microphone permission denied:', error);
                showCallError('Microphone access denied. Please allow microphone access in your browser settings.');
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
                console.log('Setting up WebRTC as', isCaller ? 'caller' : 'callee');
                
                if (!microphonePermissionGranted) {
                    console.log('No microphone permission, requesting...');
                    showPermissionPrompt();
                    await requestMicrophonePermission();
                }
                
                // Get user media with specific constraints
                localStream = await navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        sampleRate: 48000,
                        channelCount: 1
                    },
                    video: false  // Audio only for now
                });
                console.log('Local stream obtained');
                
                // Show local audio indicator (optional)
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.muted = true;
                    localVideo.play().catch(e => console.log('Local video play error:', e));
                }
                
                // Create peer connection with more STUN servers
                const config = {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                        { urls: 'stun:stun2.l.google.com:19302' },
                        { urls: 'stun:stun3.l.google.com:19302' },
                        { urls: 'stun:stun4.l.google.com:19302' },
                        { urls: 'stun:stun.stunprotocol.org:3478' }
                    ],
                    iceCandidatePoolSize: 10
                };
                
                peerConnection = new RTCPeerConnection(config);
                console.log('Peer connection created');
                
                // Add local stream tracks
                localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, localStream);
                    console.log('Added track:', track.kind);
                });
                
                // Handle remote stream
                peerConnection.ontrack = (event) => {
                    console.log('Received remote track:', event.track.kind);
                    const remoteAudio = document.getElementById('remoteAudio');
                    if (remoteAudio && event.streams[0]) {
                        remoteAudio.srcObject = event.streams[0];
                        remoteAudio.play().catch(e => console.log('Remote audio play error:', e));
                        console.log('Remote stream attached');
                    }
                };
                
                // Handle ICE candidates
                peerConnection.onicecandidate = (event) => {
                    if (event.candidate) {
                        console.log('Sending ICE candidate:', event.candidate.type);
                        ws.send(JSON.stringify({
                            type: 'ice_candidate',
                            to: currentCallWith,
                            candidate: event.candidate
                        }));
                    } else {
                        console.log('ICE gathering complete');
                    }
                };
                
                // Handle ICE connection state
                peerConnection.oniceconnectionstatechange = () => {
                    console.log('ICE connection state:', peerConnection.iceConnectionState);
                    switch (peerConnection.iceConnectionState) {
                        case 'connected':
                        case 'completed':
                            console.log('ICE connection established!');
                            hideCallError();
                            break;
                        case 'failed':
                            console.log('ICE connection failed');
                            showCallError('Connection failed. Please try again.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 3000);
                            break;
                        case 'disconnected':
                            console.log('ICE connection disconnected');
                            break;
                    }
                };
                
                // Handle connection state
                peerConnection.onconnectionstatechange = () => {
                    console.log('Connection state:', peerConnection.connectionState);
                    switch (peerConnection.connectionState) {
                        case 'connected':
                            console.log('WebRTC connection established!');
                            break;
                        case 'failed':
                            console.log('WebRTC connection failed');
                            showCallError('Connection failed. Please try again.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 3000);
                            break;
                    }
                };
                
                // Show audio controls
                const controls = document.getElementById('audioControls');
                if (controls) controls.classList.remove('hidden');
                
                if (isCaller) {
                    // Create offer
                    console.log('Creating offer...');
                    const offer = await peerConnection.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: false
                    });
                    await peerConnection.setLocalDescription(offer);
                    console.log('Local description set (offer)');
                    
                    ws.send(JSON.stringify({
                        type: 'webrtc_offer',
                        to: currentCallWith,
                        offer: offer
                    }));
                }
                
            } catch (error) {
                console.error('Error setting up WebRTC:', error);
                showCallError('Call setup failed: ' + error.message);
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCOffer(offer, from) {
            try {
                console.log('Handling WebRTC offer from:', from);
                
                // Setup WebRTC first (this will get local stream)
                await setupWebRTC(false);
                
                // Set remote description
                await peerConnection.setRemoteDescription(offer);
                console.log('Remote description set (offer)');
                
                // Create answer
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                console.log('Local description set (answer)');
                
                ws.send(JSON.stringify({
                    type: 'webrtc_answer',
                    to: from,
                    answer: answer
                }));
                
            } catch (error) {
                console.error('Error handling WebRTC offer:', error);
                showCallError('Failed to accept call: ' + error.message);
                playCallErrorSound();
                setTimeout(() => endCall(), 2000);
            }
        }
        
        async function handleWebRTCAnswer(answer) {
            try {
                console.log('Handling WebRTC answer');
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.setRemoteDescription(answer);
                    console.log('Remote description set (answer)');
                } else {
                    console.log('Peer connection not ready for answer');
                }
            } catch (error) {
                console.error('Error handling WebRTC answer:', error);
                showCallError('Call connection failed: ' + error.message);
                playCallErrorSound();
            }
        }
        
        async function handleICECandidate(candidate) {
            try {
                if (peerConnection && peerConnection.remoteDescription) {
                    await peerConnection.addIceCandidate(candidate);
                    console.log('ICE candidate added');
                } else {
                    console.log('Peer connection not ready for ICE candidate');
                    // Store candidate for later
                    setTimeout(() => {
                        if (peerConnection && peerConnection.remoteDescription) {
                            peerConnection.addIceCandidate(candidate).catch(e => console.log('Failed to add stored candidate:', e));
                        }
                    }, 1000);
                }
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
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
            console.log('Cleaning up WebRTC');
            
            // Stop and close local stream
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    track.stop();
                    console.log('Stopped track:', track.kind);
                });
                localStream = null;
            }
            
            // Close peer connection
            if (peerConnection) {
                peerConnection.close();
                peerConnection = null;
            }
            
            // Clear video/audio elements
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
            
            // Reset UI states
            isMuted = false;
            isDeafened = false;
            
            const muteBtn = document.getElementById('muteButton');
            if (muteBtn) muteBtn.textContent = 'Mute';
            
            const deafenBtn = document.getElementById('deafenButton');
            if (deafenBtn) deafenBtn.textContent = 'Deafen';
            
            // Hide error and permission prompts
            hideCallError();
            hidePermissionPrompt();
            
            // Reset call window UI
            const callStatus = document.getElementById('callStatus');
            if (callStatus) callStatus.textContent = 'Call ended';
            
            const callTimer = document.getElementById('callTimer');
            if (callTimer) callTimer.textContent = '00:00';
        }

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            loadTheme();
            document.getElementById('loginUsername').focus();
            
            // Close modal on background click
            document.getElementById('imageModal').addEventListener('click', function(e) {
                if (e.target === this) {
                    closeImageModal();
                }
            });
        });
    </script>
</body>
</html>
    `);
});

const PORT = 3000;

// find the first non-internal IPv4 address
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
    console.log(`\n🔑 Test account: username: test, password: test`);
    console.log(`\n✅ FIXED: Manual microphone permission request!`);
    console.log(`\n🎤 Now shows permission prompt in call window`);
    console.log(`\n⏹️ Press Ctrl+C to stop the server\n`);
});

// Keep alive
setInterval(() => {
    // Keep process alive
}, 1000);

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
