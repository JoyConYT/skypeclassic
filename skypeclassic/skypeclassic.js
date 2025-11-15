const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

console.log('🚀 Starting Skype Classic Server...');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let users = new Map();
let messages = [];

// Serve sound files from /sounds folder
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));

// Serve the main interface
app.get('/', (req, res) => {
    console.log('📨 Serving main page to client');
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Skype Classic</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: 'Tahoma', 'Arial', sans-serif;
                font-size: 11px;
            }
            
            body {
                background: #6C00A0;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                padding: 20px;
            }
            
            .xp-window {
                width: 450px;
                background: #ECE9D8;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
                box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            
            .chat-window {
                width: 600px;
                height: 500px;
            }
            
            .xp-titlebar {
                background: linear-gradient(90deg, #0A246A, #6B8DC3);
                color: white;
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
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
                background: #ECE9D8;
                font-size: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                line-height: 1;
            }
            
            .xp-content {
                padding: 15px;
                background: #ECE9D8;
            }
            
            .xp-fieldset {
                border: 1px solid #808080;
                padding: 15px;
                margin-bottom: 15px;
                background: #FFFFFF;
                position: relative;
            }
            
            .xp-legend {
                background: #ECE9D8;
                padding: 2px 8px;
                font-size: 11px;
                font-weight: bold;
                position: absolute;
                top: -8px;
                left: 8px;
            }
            
            .xp-input {
                width: 100%;
                padding: 4px;
                border: 1px solid #808080;
                background: #FFFFFF;
                font-size: 11px;
                margin-bottom: 10px;
                height: 22px;
            }
            
            .xp-button-large {
                background: #ECE9D8;
                border: 2px solid;
                border-top-color: #FFFFFF;
                border-left-color: #FFFFFF;
                border-right-color: #808080;
                border-bottom-color: #808080;
                padding: 5px 20px;
                font-size: 11px;
                font-weight: bold;
                cursor: pointer;
                margin-right: 10px;
            }
            
            .xp-button-large:hover {
                background: #D4D0C8;
            }
            
            .xp-tabs {
                display: flex;
                margin-bottom: 15px;
            }
            
            .xp-tab {
                padding: 4px 12px;
                background: #D4D0C8;
                border: 1px solid #808080;
                border-bottom: none;
                font-size: 11px;
                cursor: pointer;
                margin-right: 2px;
            }
            
            .xp-tab.active {
                background: #ECE9D8;
                font-weight: bold;
            }
            
            .xp-status-bar {
                background: #ECE9D8;
                border-top: 1px solid #808080;
                padding: 4px 8px;
                font-size: 10px;
                color: #808080;
                height: 20px;
            }
            
            .contact-list {
                height: 250px;
                overflow-y: auto;
                background: #FFFFFF;
                border: 1px solid #808080;
                padding: 5px;
            }
            
            .contact-item {
                padding: 5px 10px;
                border-bottom: 1px solid #D4D0C8;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .contact-item:hover {
                background: #6C00A0;
                color: white;
            }
            
            .status-dot {
                width: 10px;
                height: 10px;
                border-radius: 50%;
                display: inline-block;
                border: 1px solid #808080;
            }
            
            .online { background: #00FF00; }
            .away { background: #FFFF00; }
            .busy { background: #FF0000; }
            .offline { background: #C0C0C0; }
            
            .chat-area {
                display: flex;
                flex-direction: column;
                height: 350px;
            }
            
            .messages {
                flex: 1;
                background: white;
                border: 1px solid #808080;
                padding: 10px;
                overflow-y: auto;
                margin-bottom: 10px;
            }
            
            .message {
                margin: 5px 0;
                padding: 5px;
                background: #F0F0F0;
                border-radius: 3px;
            }
            
            .message.self {
                background: #E1F5FE;
                text-align: right;
            }
            
            .message-input-area {
                display: flex;
                gap: 10px;
            }
            
            .message-input {
                flex: 1;
                padding: 5px;
                border: 1px solid #808080;
            }
            
            .send-button {
                padding: 5px 15px;
                background: #6C00A0;
                color: white;
                border: none;
                cursor: pointer;
            }
            
            .call-button {
                padding: 5px 10px;
                background: #00A300;
                color: white;
                border: none;
                cursor: pointer;
                margin-left: 5px;
            }
            
            .hidden {
                display: none;
            }
            
            .sound-control {
                position: fixed;
                top: 10px;
                right: 10px;
                background: rgba(255,255,255,0.9);
                padding: 5px;
                border-radius: 3px;
                font-size: 10px;
            }
            
            .empty-contacts {
                text-align: center;
                padding: 20px;
                color: #666;
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
                border: 2px solid #808080;
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
                background: #D4D0C8;
                border: 1px solid #808080;
                cursor: pointer;
                font-size: 10px;
            }
            
            .call-error {
                color: #FF0000;
                font-size: 10px;
                margin: 10px 0;
                text-align: center;
            }
            
            .permission-prompt {
                background: #FFF;
                border: 2px solid #808080;
                padding: 15px;
                margin: 10px 0;
                text-align: center;
            }
            
            .permission-button {
                background: #00A300;
                color: white;
                border: none;
                padding: 8px 15px;
                cursor: pointer;
                margin: 5px;
            }
        </style>
    </head>
    <body>
        <!-- Sound Control -->
        <div class="sound-control">
            <label>
                <input type="checkbox" id="soundToggle" checked> Sounds
            </label>
        </div>

        <!-- Audio Elements with Real Skype Sounds -->
        <audio id="messageSound" preload="auto">
            <source src="/sounds/messagereceived.mp3" type="audio/mpeg">
        </audio>
        <audio id="loginSound" preload="auto">
            <source src="/sounds/logon.mp3" type="audio/mpeg">
        </audio>
        <audio id="sendSound" preload="auto">
            <source src="/sounds/messagesent.mp3" type="audio/mpeg">
        </audio>
        <audio id="callSound" preload="auto" loop>
            <source src="/sounds/call_incoming.mp3" type="audio/mpeg">
        </audio>
        <audio id="dialingSound" preload="auto" loop>
            <source src="/sounds/dialing.mp3" type="audio/mpeg">
        </audio>
        <audio id="callEndSound" preload="auto">
            <source src="/sounds/call_end.mp3" type="audio/mpeg">
        </audio>
        <audio id="callAcceptSound" preload="auto">
            <source src="/sounds/call_accept.mp3" type="audio/mpeg">
        </audio>
        <audio id="callErrorSound" preload="auto">
            <source src="/sounds/call_error.mp3" type="audio/mpeg">
        </audio>

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
                
                <!-- Login Tab -->
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
                
                <!-- Register Tab -->
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
                <div style="display: flex; gap: 15px; height: 400px;">
                    <!-- Contacts Panel -->
                    <div style="width: 200px;">
                        <div class="xp-fieldset">
                            <legend class="xp-legend">Contacts</legend>
                            <div id="contactList" class="contact-list">
                                <div class="empty-contacts">
                                    No contacts yet<br>
                                    <small>Add friends to start chatting!</small>
                                </div>
                            </div>
                        </div>
                        <div style="text-align: center; margin-top: 10px;">
                            <button class="xp-button-large" onclick="showAddContact()">Add Contact</button>
                        </div>
                    </div>
                    
                    <!-- Chat Area -->
                    <div style="flex: 1;">
                        <div class="xp-fieldset">
                            <legend class="xp-legend">Chat <span id="currentChatWith"></span></legend>
                            <div class="chat-area">
                                <div id="messages" class="messages">
                                    <div class="message">Welcome to Skype Classic! Add contacts to start chatting.</div>
                                </div>
                                <div class="message-input-area">
                                    <input type="text" id="messageInput" class="message-input" placeholder="Type a message..." onkeypress="handleMessageKeypress(event)">
                                    <button class="send-button" onclick="sendMessage()">Send</button>
                                    <button class="call-button" onclick="startCall()" title="Start Voice Call">📞</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 15px;">
                    <button class="xp-button-large" onclick="changeStatus('online')">Online</button>
                    <button class="xp-button-large" onclick="changeStatus('away')">Away</button>
                    <button class="xp-button-large" onclick="changeStatus('busy')">Busy</button>
                    <button class="xp-button-large" onclick="logout()">Logout</button>
                </div>
            </div>
            
            <div class="xp-status-bar">
                <span id="chatStatus">Ready to chat...</span>
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
                    
                    <!-- Video/Audio Preview -->
                    <div class="video-container">
                        <video id="localVideo" autoplay muted class="video-preview"></video>
                        <audio id="remoteAudio" autoplay></audio>
                    </div>
                    
                    <!-- Permission Prompt -->
                    <div id="permissionPrompt" class="permission-prompt hidden">
                        <p><strong>Microphone Access Required</strong></p>
                        <p>Click "Allow Microphone" to enable voice calls</p>
                        <button class="permission-button" onclick="requestMicrophonePermission()">Allow Microphone</button>
                    </div>
                    
                    <!-- Error Message -->
                    <div id="callError" class="call-error hidden"></div>
                    
                    <!-- Audio Controls -->
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

            // WebRTC variables
            let localStream = null;
            let remoteStream = null;
            let peerConnection = null;
            let isMuted = false;
            let isDeafened = false;
            let microphonePermissionGranted = false;

            // WebRTC configuration
            const rtcConfiguration = {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            };

            // Sound functions
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

            // Manual microphone permission request
            async function requestMicrophonePermission() {
                try {
                    console.log('Requesting microphone permission...');
                    
                    // First check if we already have permission
                    const currentPermission = await navigator.permissions.query({ name: 'microphone' });
                    if (currentPermission.state === 'granted') {
                        console.log('Microphone permission already granted');
                        microphonePermissionGranted = true;
                        hidePermissionPrompt();
                        return true;
                    }
                    
                    // Try to get microphone access
                    localStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,
                            noiseSuppression: true
                        }, 
                        video: false 
                    });
                    
                    console.log('Microphone access granted!');
                    microphonePermissionGranted = true;
                    hidePermissionPrompt();
                    
                    // Show the local video preview
                    document.getElementById('localVideo').srcObject = localStream;
                    document.getElementById('audioControls').classList.remove('hidden');
                    
                    // Stop the tracks immediately since we just wanted permission
                    localStream.getTracks().forEach(track => track.stop());
                    localStream = null;
                    
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
                document.getElementById('permissionPrompt').classList.remove('hidden');
                document.getElementById('audioControls').classList.add('hidden');
            }

            function hidePermissionPrompt() {
                document.getElementById('permissionPrompt').classList.add('hidden');
                document.getElementById('audioControls').classList.remove('hidden');
            }

            // WebRTC Functions with better permission handling
            async function setupWebRTC(isCaller) {
                try {
                    console.log('Setting up WebRTC...');
                    
                    // Check if we have microphone permission
                    if (!microphonePermissionGranted) {
                        console.log('No microphone permission, requesting...');
                        showPermissionPrompt();
                        return;
                    }
                    
                    // Get user media
                    try {
                        localStream = await navigator.mediaDevices.getUserMedia({ 
                            audio: {
                                echoCancellation: true,
                                noiseSuppression: true
                            }, 
                            video: false 
                        });
                        console.log('Microphone access granted for call');
                    } catch (mediaError) {
                        console.error('Microphone access failed:', mediaError);
                        showCallError('Microphone access denied. Please check browser permissions.');
                        playCallErrorSound();
                        setTimeout(() => endCall(), 2000);
                        return;
                    }
                    
                    // Create peer connection
                    peerConnection = new RTCPeerConnection(rtcConfiguration);
                    
                    // Add local stream to connection
                    localStream.getTracks().forEach(track => {
                        peerConnection.addTrack(track, localStream);
                    });
                    
                    // Get remote stream
                    peerConnection.ontrack = (event) => {
                        console.log('Received remote stream');
                        remoteStream = event.streams[0];
                        document.getElementById('remoteAudio').srcObject = remoteStream;
                    };
                    
                    // Handle ICE candidates
                    peerConnection.onicecandidate = (event) => {
                        if (event.candidate) {
                            ws.send(JSON.stringify({
                                type: 'ice_candidate',
                                to: currentCallWith,
                                candidate: event.candidate
                            }));
                        }
                    };
                    
                    // Handle connection state changes
                    peerConnection.onconnectionstatechange = (event) => {
                        console.log('WebRTC connection state:', peerConnection.connectionState);
                        switch (peerConnection.connectionState) {
                            case 'connected':
                                console.log('WebRTC connection established!');
                                hideCallError();
                                break;
                            case 'disconnected':
                            case 'failed':
                                console.log('WebRTC connection failed');
                                showCallError('Connection failed. Please try again.');
                                playCallErrorSound();
                                setTimeout(() => endCall(), 3000);
                                break;
                        }
                    };
                    
                    // Show local video preview
                    document.getElementById('localVideo').srcObject = localStream;
                    document.getElementById('audioControls').classList.remove('hidden');
                    
                    if (isCaller) {
                        // Create offer if we're the caller
                        try {
                            const offer = await peerConnection.createOffer();
                            await peerConnection.setLocalDescription(offer);
                            
                            ws.send(JSON.stringify({
                                type: 'webrtc_offer',
                                to: currentCallWith,
                                offer: offer
                            }));
                        } catch (offerError) {
                            console.error('Error creating offer:', offerError);
                            showCallError('Failed to start call. Please try again.');
                            playCallErrorSound();
                            setTimeout(() => endCall(), 2000);
                        }
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
                    await setupWebRTC(false);
                    await peerConnection.setRemoteDescription(offer);
                    
                    const answer = await peerConnection.createAnswer();
                    await peerConnection.setLocalDescription(answer);
                    
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
                    await peerConnection.setRemoteDescription(answer);
                } catch (error) {
                    console.error('Error handling WebRTC answer:', error);
                    showCallError('Call connection failed: ' + error.message);
                    playCallErrorSound();
                }
            }

            async function handleICECandidate(candidate) {
                try {
                    if (peerConnection) {
                        await peerConnection.addIceCandidate(candidate);
                    }
                } catch (error) {
                    console.error('Error adding ICE candidate:', error);
                }
            }

            function showCallError(message) {
                const errorElement = document.getElementById('callError');
                errorElement.textContent = message;
                errorElement.classList.remove('hidden');
            }

            function hideCallError() {
                const errorElement = document.getElementById('callError');
                errorElement.classList.add('hidden');
            }

            function toggleMute() {
                if (localStream) {
                    const audioTracks = localStream.getAudioTracks();
                    audioTracks.forEach(track => {
                        track.enabled = !track.enabled;
                    });
                    isMuted = !isMuted;
                    document.getElementById('muteButton').textContent = isMuted ? 'Unmute' : 'Mute';
                }
            }

            function toggleDeafen() {
                const remoteAudio = document.getElementById('remoteAudio');
                if (remoteAudio) {
                    remoteAudio.muted = !remoteAudio.muted;
                    isDeafened = !isDeafened;
                    document.getElementById('deafenButton').textContent = isDeafened ? 'Undeafen' : 'Deafen';
                }
            }

            function cleanupWebRTC() {
                if (localStream) {
                    localStream.getTracks().forEach(track => track.stop());
                    localStream = null;
                }
                if (peerConnection) {
                    peerConnection.close();
                    peerConnection = null;
                }
                document.getElementById('localVideo').srcObject = null;
                document.getElementById('remoteAudio').srcObject = null;
                isMuted = false;
                isDeafened = false;
                document.getElementById('muteButton').textContent = 'Mute';
                document.getElementById('deafenButton').textContent = 'Deafen';
                hideCallError();
                hidePermissionPrompt();
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
                loadContacts();
            }

            function connectWebSocket() {
                const host = window.location.hostname;
                const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
                
                ws = new WebSocket('ws://' + host + ':' + port);
                
                ws.onopen = () => {
                    document.getElementById('chatStatus').textContent = 'Connected to Skype Classic';
                    
                    ws.send(JSON.stringify({
                        type: 'join',
                        username: currentUser.username,
                        userId: currentUser.id,
                        displayName: currentUser.displayName
                    }));
                };
                
                ws.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    handleWebSocketMessage(data);
                };
                
                ws.onclose = () => {
                    document.getElementById('chatStatus').textContent = 'Disconnected from server';
                };
            }

            function handleWebSocketMessage(data) {
                if (data.type === 'user_join') {
                    addSystemMessage(data.message);
                    updateContactListWithOnlineUsers(data.users);
                } else if (data.type === 'user_leave') {
                    addSystemMessage(data.message);
                    updateContactListWithOnlineUsers(data.users);
                } else if (data.type === 'new_message') {
                    if (data.data.id > messageCounter) {
                        displayMessage(data.data);
                        messageCounter = data.data.id;
                        if (data.data.from !== currentUser.username) {
                            playMessageSound();
                        }
                    }
                } else if (data.type === 'call_request') {
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
                    
                } else if (data.type === 'call_accepted') {
                    // This is received by the CALLER when callee accepts
                    stopCallSounds();
                    playCallAcceptSound();
                    document.getElementById('callWindow').classList.remove('hidden');
                    document.getElementById('callTarget').textContent = data.fromDisplay;
                    document.getElementById('callStatus').textContent = 'In call with ' + data.fromDisplay;
                    startCallTimer();
                    isInCall = true;
                    currentCallWith = data.from;
                    
                    // Start WebRTC as the caller
                    setupWebRTC(true);
                    
                } else if (data.type === 'call_declined') {
                    stopCallSounds();
                    playCallEndSound();
                    document.getElementById('callWindow').classList.add('hidden');
                    addSystemMessage(data.fromDisplay + ' declined your call');
                    isInCall = false;
                    currentCallWith = null;
                    cleanupWebRTC();
                    
                } else if (data.type === 'call_end') {
                    if (isInCall || document.getElementById('callWindow').classList.contains('hidden') === false) {
                        stopCallSounds();
                        playCallEndSound();
                        document.getElementById('callWindow').classList.add('hidden');
                        document.getElementById('incomingCallWindow').classList.add('hidden');
                        addSystemMessage('Call ended by ' + (data.fromDisplay || data.from));
                        
                        if (callTimerInterval) {
                            clearInterval(callTimerInterval);
                            callTimerInterval = null;
                        }
                        
                        isInCall = false;
                        currentCallWith = null;
                        callStartTime = null;
                        cleanupWebRTC();
                    }
                } else if (data.type === 'webrtc_offer') {
                    handleWebRTCOffer(data.offer, data.from);
                } else if (data.type === 'webrtc_answer') {
                    handleWebRTCAnswer(data.answer);
                } else if (data.type === 'ice_candidate') {
                    handleICECandidate(data.candidate);
                }
            }

            function loadContacts() {
                userContacts = JSON.parse(localStorage.getItem('userContacts_' + currentUser.username) || '[]');
                updateContactList();
            }

            function updateContactList() {
                const contactList = document.getElementById('contactList');
                contactList.innerHTML = '';
                
                if (userContacts.length === 0) {
                    contactList.innerHTML = '<div class="empty-contacts">No contacts yet<br><small>Add friends to start chatting!</small></div>';
                    return;
                }
                
                userContacts.forEach(contact => {
                    const contactItem = document.createElement('div');
                    contactItem.className = 'contact-item';
                    contactItem.innerHTML = \`
                        <span class="status-dot \${contact.status || 'offline'}"></span>
                        <span>\${contact.displayName}</span>
                    \`;
                    contactItem.onclick = () => startChatWith(contact.username, contact.displayName);
                    contactList.appendChild(contactItem);
                });
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

            function startChatWith(username, displayName) {
                currentChat = username;
                document.getElementById('currentChatWith').textContent = 'with ' + displayName;
                addSystemMessage('Started chat with ' + displayName);
            }

            function sendMessage() {
                const input = document.getElementById('messageInput');
                const message = input.value.trim();
                
                if (message && currentChat) {
                    if (ws && ws.readyState === WebSocket.OPEN) {
                        const messageId = Date.now();
                        const messageData = {
                            id: messageId,
                            from: currentUser.username,
                            fromDisplay: currentUser.displayName,
                            to: currentChat,
                            message: message,
                            timestamp: new Date().toISOString()
                        };
                        
                        ws.send(JSON.stringify({
                            type: 'message',
                            data: messageData
                        }));
                        
                        displayMessage(messageData, true);
                        messageCounter = messageId;
                        playSendSound();
                        
                        input.value = '';
                    }
                } else if (!currentChat) {
                    alert('Please select a contact to chat with first!');
                }
            }

            function displayMessage(messageData, isSelf = false) {
                const messagesDiv = document.getElementById('messages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isSelf ? 'self' : '');
                messageDiv.setAttribute('data-message-id', messageData.id);
                
                const time = new Date(messageData.timestamp).toLocaleTimeString();
                const displayName = messageData.fromDisplay || messageData.from;
                
                messageDiv.innerHTML = \`
                    <strong>\${displayName}:</strong> \${messageData.message}
                    <div style="font-size: 9px; opacity: 0.7;">\${time}</div>
                \`;
                
                if (!document.querySelector(\`[data-message-id="\${messageData.id}"]\`)) {
                    messagesDiv.appendChild(messageDiv);
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
            }

            function addSystemMessage(message) {
                const messagesDiv = document.getElementById('messages');
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message';
                messageDiv.style.textAlign = 'center';
                messageDiv.style.fontStyle = 'italic';
                messageDiv.style.opacity = '0.7';
                messageDiv.textContent = message;
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }

            function handleMessageKeypress(event) {
                if (event.key === 'Enter') {
                    sendMessage();
                }
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
                
                if (ws && ws.readyState === WebSocket.OPEN) {
                    playDialingSound();
                    currentCallWith = currentChat;
                    
                    document.getElementById('callTarget').textContent = currentChat;
                    document.getElementById('callWindow').classList.remove('hidden');
                    document.getElementById('callStatus').textContent = 'Calling ' + currentChat + '...';
                    document.getElementById('callTimer').textContent = 'Calling...';
                    
                    ws.send(JSON.stringify({
                        type: 'call_request',
                        from: currentUser.username,
                        fromDisplay: currentUser.displayName,
                        to: currentChat
                    }));
                    
                    setTimeout(() => {
                        if (document.getElementById('callWindow').classList.contains('hidden') === false && 
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
                
                document.getElementById('incomingCallWindow').classList.add('hidden');
                document.getElementById('callWindow').classList.remove('hidden');
                document.getElementById('callTarget').textContent = incomingCallFrom;
                document.getElementById('callStatus').textContent = 'In call with ' + incomingCallFrom;
                
                startCallTimer();
                isInCall = true;
                currentCallWith = incomingCallFrom;
                
                // Start WebRTC as the callee
                setupWebRTC(false);
                
                // Notify the CALLER that the call was accepted
                ws.send(JSON.stringify({
                    type: 'call_accepted',
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
                    ws.send(JSON.stringify({
                        type: 'call_declined',
                        from: currentUser.username,
                        to: incomingCallFrom
                    }));
                    
                    addSystemMessage('Call declined');
                    incomingCallFrom = null;
                }
            }

            function endCall() {
                stopCallSounds();
                playCallEndSound();
                
                document.getElementById('callWindow').classList.add('hidden');
                document.getElementById('incomingCallWindow').classList.add('hidden');
                
                if (callTimerInterval) {
                    clearInterval(callTimerInterval);
                    callTimerInterval = null;
                }
                
                if (currentCallWith) {
                    ws.send(JSON.stringify({
                        type: 'call_end',
                        from: currentUser.username,
                        fromDisplay: currentUser.displayName,
                        to: currentCallWith
                    }));
                    
                    addSystemMessage('Call ended with ' + currentCallWith);
                    currentCallWith = null;
                }
                
                if (incomingCallFrom) {
                    incomingCallFrom = null;
                }
                
                isInCall = false;
                callStartTime = null;
                cleanupWebRTC();
            }

            function startCallTimer() {
                callStartTime = new Date();
                callTimerInterval = setInterval(() => {
                    const now = new Date();
                    const diff = Math.floor((now - callStartTime) / 1000);
                    const minutes = Math.floor(diff / 60);
                    const seconds = diff % 60;
                    document.getElementById('callTimer').textContent = 
                        \`\${minutes.toString().padStart(2, '0')}:\${seconds.toString().padStart(2, '0')}\`;
                }, 1000);
            }

            function showAddContact() {
                const username = prompt('Enter username to add:');
                if (username && username.trim()) {
                    const displayName = prompt('Enter display name (optional):') || username;
                    
                    if (userContacts.find(c => c.username === username)) {
                        alert('Contact already exists!');
                        return;
                    }
                    
                    userContacts.push({
                        username: username,
                        displayName: displayName,
                        status: 'offline'
                    });
                    
                    localStorage.setItem('userContacts_' + currentUser.username, JSON.stringify(userContacts));
                    
                    updateContactList();
                    addSystemMessage('Added ' + displayName + ' to contacts');
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
                if (ws) {
                    ws.close();
                }
                document.getElementById('chatWindow').classList.add('hidden');
                document.getElementById('loginWindow').classList.remove('hidden');
                currentUser = null;
                currentChat = null;
                messageCounter = 0;
                document.getElementById('statusMessage').textContent = 'Logged out successfully';
                cleanupWebRTC();
            }

            document.getElementById('loginUsername').focus();
        </script>
    </body>
    </html>
    `);
});

// WebSocket connection handling
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
            console.log('📨 Received:', data);
            
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
                
                broadcast({
                    type: 'user_join',
                    message: data.displayName + ' joined the chat',
                    users: Array.from(users.values()).map(u => ({ 
                        username: u.username, 
                        displayName: u.displayName,
                        status: u.status 
                    }))
                });
                
            } else if (data.type === 'message') {
                const messageObj = {
                    id: data.data.id,
                    from: data.data.from,
                    fromDisplay: data.data.fromDisplay,
                    to: data.data.to,
                    message: data.data.message,
                    timestamp: data.data.timestamp
                };
                
                messages.push(messageObj);
                
                if (data.data.to) {
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
            } else if (data.type === 'call_accepted') {
                // Forward call_accepted to the original caller
                const caller = users.get(data.to);
                if (caller && caller.ws.readyState === WebSocket.OPEN) {
                    caller.ws.send(JSON.stringify({
                        type: 'call_accepted',
                        from: data.from,
                        fromDisplay: data.fromDisplay
                    }));
                }
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

const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🎉 SKYPE CLASSIC SERVER RUNNING!`);
    console.log(`🟣 Local: http://localhost:${PORT}`);
    console.log(`📱 Network: http://192.168.0.124:${PORT}`);
    console.log(`\n🔑 Test account: username: test, password: test`);
    console.log(`\n✅ FIXED: Manual microphone permission request!`);
    console.log(`\n🎤 Now shows permission prompt in call window`);
    console.log(`\n⏹️  Press Ctrl+C to stop the server\n`);
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