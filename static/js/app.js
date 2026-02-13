/**
 * MeshCore Web - Main JavaScript Application
 */

class MeshCoreApp {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.contacts = {};
        this.channels = [];
        this.currentContact = null;
        this.currentChannel = null;
        this.messages = {}; // key -> messages[]
        this.pendingMessages = {};
        this.lastMessageTimes = {}; // key -> timestamp of last message
        
        // Sorting and filtering
        this.sortMode = localStorage.getItem('contactSortMode') || 'latestMessage';
        this.filterMode = localStorage.getItem('contactFilterMode') || 'all';
        this.favourites = new Set(JSON.parse(localStorage.getItem('favourites') || '[]'));
        
        this.init();
    }
    
    init() {
        this.setupTheme();
        this.setupNavigation();
        this.setupConnectionModal();
        this.setupSettingsModal();
        this.setupRemoteManagementModal();
        this.setupMessageInput();
        this.setupEventListeners();
        this.setupSortingFiltering();
        this.loadBleDeviceHistory();
        this.connectWebSocket();
    }
    
    // ============== Theme ==============
    
    setupTheme() {
        const saved = localStorage.getItem('theme') || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        this.updateThemeIcon();
        
        document.getElementById('themeToggle').addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('theme', next);
            this.updateThemeIcon();
        });
    }
    
    updateThemeIcon() {
        const theme = document.documentElement.getAttribute('data-theme');
        document.getElementById('themeToggle').textContent = theme === 'dark' ? '🌙' : '☀️';
    }
    
    // ============== Navigation ==============
    
    setupNavigation() {
        const tabs = document.querySelectorAll('.nav-tab');
        const panels = document.querySelectorAll('.panel');
        
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));
                
                tab.classList.add('active');
                document.getElementById(`${tabName}Panel`).classList.add('active');
                
                // Load data for the panel
                this.loadPanelData(tabName);
            });
        });
    }
    
    loadPanelData(panelName) {
        if (!this.connected) return;
        
        switch (panelName) {
            case 'contacts':
                this.loadContacts();
                break;
            case 'channels':
                this.loadChannels();
                break;
            case 'device':
                this.loadDeviceInfo();
                break;
            case 'stats':
                this.loadStats();
                break;
        }
    }
    
    // ============== Connection Modal ==============
    
    setupConnectionModal() {
        const modal = document.getElementById('connectionModal');
        const status = document.getElementById('connectionStatus');
        const typeSelect = document.getElementById('connectionType');
        
        // Open modal on status click
        status.addEventListener('click', () => {
            if (this.connected) {
                this.disconnect();
            } else {
                modal.classList.add('active');
                this.refreshSerialPorts();
            }
        });
        
        // Close modal
        document.getElementById('closeConnectionModal').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        document.getElementById('cancelConnect').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        // Switch connection type
        typeSelect.addEventListener('change', () => {
            const type = typeSelect.value;
            document.getElementById('serialOptions').classList.toggle('hidden', type !== 'serial');
            document.getElementById('tcpOptions').classList.toggle('hidden', type !== 'tcp');
            document.getElementById('bleOptions').classList.toggle('hidden', type !== 'ble');
        });
        
        // Refresh ports button
        document.getElementById('refreshPorts').addEventListener('click', () => {
            this.refreshSerialPorts();
        });
        
        // Connect button
        document.getElementById('doConnect').addEventListener('click', () => {
            this.connect();
        });
    }
    
    // ============== Settings Modal ==============
    
    setupSettingsModal() {
        const modal = document.getElementById('settingsModal');
        const settingsBtn = document.getElementById('settingsBtn');
        
        // Open modal on settings button click
        settingsBtn.addEventListener('click', () => {
            // Load current settings
            const theme = document.documentElement.getAttribute('data-theme');
            document.getElementById('settingsTheme').value = theme;
            document.getElementById('settingsNotifications').checked = 
                localStorage.getItem('notifications') !== 'false';
            document.getElementById('settingsSounds').checked = 
                localStorage.getItem('sounds') === 'true';
            
            modal.classList.add('active');
        });
        
        // Close modal
        document.getElementById('closeSettingsModal').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        document.getElementById('closeSettingsBtn').addEventListener('click', () => {
            modal.classList.remove('active');
        });
        
        // Theme change
        document.getElementById('settingsTheme').addEventListener('change', (e) => {
            const theme = e.target.value;
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('theme', theme);
            this.updateThemeIcon();
        });
        
        // Notification settings
        document.getElementById('settingsNotifications').addEventListener('change', (e) => {
            localStorage.setItem('notifications', e.target.checked);
        });
        
        document.getElementById('settingsSounds').addEventListener('change', (e) => {
            localStorage.setItem('sounds', e.target.checked);
        });
    }
    
    // ============== Remote Management Modal ==============
    
    setupRemoteManagementModal() {
        const modal = document.getElementById('remoteManagementModal');
        
        // Close modal
        document.getElementById('closeRemoteManagement').addEventListener('click', () => {
            modal.classList.remove('active');
            this.currentRemoteContact = null;
        });
        
        document.getElementById('closeRemoteManagementBtn').addEventListener('click', () => {
            modal.classList.remove('active');
            this.currentRemoteContact = null;
        });
        
        // Remote actions
        document.getElementById('remoteReboot').addEventListener('click', () => {
            this.sendRemoteCommand('reboot');
        });
        
        document.getElementById('remoteAdvert').addEventListener('click', () => {
            this.sendRemoteCommand('advert');
        });
        
        document.getElementById('remoteResetPath').addEventListener('click', () => {
            this.resetContactPath();
        });
        
        document.getElementById('refreshRemoteTelemetry').addEventListener('click', () => {
            this.loadRemoteTelemetry();
        });
    }
    
    openRemoteManagement(key) {
        const contact = this.contacts[key];
        if (!contact) return;
        
        this.currentRemoteContact = key;
        
        const type = contact.type || 0;
        const typeName = type === 2 ? 'Repeater' : type === 3 ? 'Room' : 'Device';
        const name = contact.adv_name || key.substring(0, 16) + '...';
        
        document.getElementById('remoteManagementTitle').textContent = 
            `${type === 2 ? '📡' : '🏠'} ${typeName}: ${name}`;
        
        // Display device info
        const infoGrid = document.getElementById('remoteInfoGrid');
        const pathLen = contact.out_path_len;
        const path = pathLen >= 0 ? `${pathLen} hop${pathLen !== 1 ? 's' : ''}` : 'Unknown';
        
        infoGrid.innerHTML = `
            <span class="info-label">Name</span>
            <span class="info-value">${this.escapeHtml(name)}</span>
            <span class="info-label">Type</span>
            <span class="info-value">${typeName}</span>
            <span class="info-label">Path</span>
            <span class="info-value">${path}</span>
            <span class="info-label">Last Seen</span>
            <span class="info-value">${this.timeAgo(contact.last_advert)}</span>
            <span class="info-label">Public Key</span>
            <span class="info-value" style="word-break: break-all; font-size: 11px;">${key}</span>
        `;
        
        // Reset telemetry display
        document.getElementById('remoteBattery').textContent = '--';
        document.getElementById('remoteTemp').textContent = '--';
        document.getElementById('remoteHumidity').textContent = '--';
        
        document.getElementById('remoteManagementModal').classList.add('active');
        
        // Auto-load telemetry
        this.loadRemoteTelemetry();
    }
    
    async sendRemoteCommand(command) {
        if (!this.currentRemoteContact) return;
        
        try {
            const response = await fetch('/api/remote/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target: this.currentRemoteContact,
                    command: command
                })
            });
            
            if (response.ok) {
                this.showToast(`Command '${command}' sent successfully`, 'success');
            } else {
                const data = await response.json();
                throw new Error(data.detail || 'Command failed');
            }
        } catch (error) {
            this.showToast('Command failed: ' + error.message, 'error');
        }
    }
    
    async resetContactPath() {
        if (!this.currentRemoteContact) return;
        
        try {
            const response = await fetch('/api/contacts/reset-path', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    public_key: this.currentRemoteContact
                })
            });
            
            if (response.ok) {
                this.showToast('Path reset requested', 'success');
                this.loadContacts();
            } else {
                const data = await response.json();
                throw new Error(data.detail || 'Reset failed');
            }
        } catch (error) {
            this.showToast('Reset failed: ' + error.message, 'error');
        }
    }
    
    async loadRemoteTelemetry() {
        if (!this.currentRemoteContact) return;
        
        try {
            const response = await fetch(`/api/contacts/${this.currentRemoteContact}/telemetry`);
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.battery !== undefined) {
                    document.getElementById('remoteBattery').textContent = 
                        data.battery >= 0 ? `${data.battery}%` : 'N/A';
                }
                if (data.temperature !== undefined) {
                    document.getElementById('remoteTemp').textContent = 
                        `${data.temperature}°C`;
                }
                if (data.humidity !== undefined) {
                    document.getElementById('remoteHumidity').textContent = 
                        `${data.humidity}%`;
                }
            }
        } catch (error) {
            console.error('Failed to load telemetry:', error);
        }
    }
    
    async refreshSerialPorts() {
        try {
            const response = await fetch('/api/serial/ports');
            const data = await response.json();
            
            const select = document.getElementById('serialPort');
            select.innerHTML = '<option value="">Select port...</option>';
            
            data.ports.forEach(port => {
                const option = document.createElement('option');
                option.value = port.device;
                option.textContent = `${port.device} - ${port.description}`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('Failed to refresh ports:', error);
        }
    }
    
    async connect() {
        const type = document.getElementById('connectionType').value;
        let params = { type };
        
        if (type === 'serial') {
            params.port = document.getElementById('serialPort').value;
            params.baudrate = parseInt(document.getElementById('serialBaudrate').value);
            
            if (!params.port) {
                this.showToast('Please select a port', 'error');
                return;
            }
        } else if (type === 'tcp') {
            params.host = document.getElementById('tcpHost').value;
            params.tcp_port = parseInt(document.getElementById('tcpPort').value);
            params.password = document.getElementById('tcpPassword').value || null;
            
            if (!params.host) {
                this.showToast('Please enter a host', 'error');
                return;
            }
        } else if (type === 'ble') {
            params.device_name = document.getElementById('bleDeviceName').value;
            params.pin = document.getElementById('blePin').value || null;
            
            if (!params.device_name) {
                this.showToast('Please enter a device name', 'error');
                return;
            }
        }
        
        try {
            this.updateConnectionStatus('connecting');
            
            const response = await fetch('/api/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.connected = true;
                this.selfInfo = data.self_info;
                this.updateConnectionStatus('connected');
                document.getElementById('connectionModal').classList.remove('active');
                this.showToast('Connected successfully!', 'success');
                
                // Save BLE device to history on successful connection
                if (type === 'ble' && params.device_name) {
                    this.saveBleDevice(params.device_name);
                }
                
                this.loadContacts();
            } else {
                throw new Error(data.detail || 'Connection failed');
            }
        } catch (error) {
            this.updateConnectionStatus('disconnected');
            this.showToast(error.message, 'error');
        }
    }
    
    async disconnect() {
        try {
            await fetch('/api/disconnect', { method: 'POST' });
            this.connected = false;
            this.contacts = {};
            this.currentContact = null;
            this.updateConnectionStatus('disconnected');
            this.updateContactsList();
            this.showToast('Disconnected', 'info');
        } catch (error) {
            this.showToast('Disconnect failed: ' + error.message, 'error');
        }
    }
    
    updateConnectionStatus(status) {
        const statusEl = document.getElementById('connectionStatus');
        const dot = statusEl.querySelector('.status-dot');
        const text = statusEl.querySelector('.status-text');
        
        dot.className = 'status-dot ' + status;
        
        switch (status) {
            case 'connected':
                text.textContent = 'Connected';
                break;
            case 'connecting':
                text.textContent = 'Connecting...';
                break;
            default:
                text.textContent = 'Disconnected';
        }
    }
    
    // ============== WebSocket ==============
    
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket connected');
        };
        
        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleWebSocketMessage(message);
            } catch (error) {
                console.error('WebSocket message parse error:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('WebSocket disconnected, reconnecting...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
        };
    }
    
    handleWebSocketMessage(message) {
        const { type, payload } = message;
        
        switch (type) {
            case 'status':
                this.connected = payload.connected;
                this.selfInfo = payload.self_info;
                this.updateConnectionStatus(payload.connected ? 'connected' : 'disconnected');
                if (payload.connected) {
                    this.loadContacts();
                }
                break;
            
            case 'connected':
                this.connected = true;
                this.selfInfo = payload.self_info;
                this.updateConnectionStatus('connected');
                break;
            
            case 'disconnected':
                this.connected = false;
                this.updateConnectionStatus('disconnected');
                break;
            
            case 'contact_message':
            case 'channel_message':
                this.handleIncomingMessage(payload, type === 'channel_message');
                break;
            
            case 'ack':
                this.handleAck(payload);
                break;
            
            case 'contacts_updated':
                this.loadContacts();
                break;
            
            case 'advertisement':
                // Handle new advertisement
                break;
        }
    }
    
    // ============== Contacts ==============
    
    async loadContacts() {
        if (!this.connected) return;
        
        try {
            const response = await fetch('/api/contacts');
            const data = await response.json();
            
            this.contacts = {};
            data.contacts.forEach(contact => {
                this.contacts[contact.public_key] = contact;
            });
            
            this.updateContactsList();
            this.updateContactsTable();
        } catch (error) {
            console.error('Failed to load contacts:', error);
        }
    }
    
    updateContactsList() {
        const container = document.getElementById('contactsList');
        
        if (Object.keys(this.contacts).length === 0) {
            container.innerHTML = '<p class="empty-state">No contacts yet</p>';
            return;
        }
        
        // Get contacts as array and apply sorting/filtering
        let contactsArray = Object.entries(this.contacts);
        
        // Apply filter
        contactsArray = this.applyContactFilter(contactsArray);
        
        // Apply sort
        contactsArray = this.applyContactSort(contactsArray);
        
        if (contactsArray.length === 0) {
            container.innerHTML = '<p class="empty-state">No matching contacts</p>';
            return;
        }
        
        container.innerHTML = '';
        
        contactsArray.forEach(([key, contact]) => {
            const div = document.createElement('div');
            div.className = 'contact-item';
            if (this.currentContact === key) {
                div.classList.add('active');
            }
            
            const type = contact.type || 0;
            const avatar = type === 2 ? '📡' : type === 3 ? '🏠' : '👤';
            const typeName = type === 2 ? 'Repeater' : type === 3 ? 'Room' : '';
            const name = contact.adv_name || key.substring(0, 8) + '...';
            const pathLen = contact.out_path_len;
            const signal = pathLen >= 0 ? (pathLen === 0 ? '🟢' : pathLen <= 2 ? '🟡' : '🟠') : '⚪';
            const isFavourite = this.favourites.has(key);
            
            // Show last message time if sorting by latest message
            let statusText = typeName || this.timeAgo(contact.last_advert);
            if (this.sortMode === 'latestMessage' && this.lastMessageTimes[key]) {
                statusText = `Last msg: ${this.timeAgo(this.lastMessageTimes[key])}`;
            }
            
            div.innerHTML = `
                <button class="fav-btn ${isFavourite ? 'active' : ''}" onclick="event.stopPropagation(); app.toggleFavourite('${key}')" title="Toggle favourite">
                    ${isFavourite ? '★' : '☆'}
                </button>
                <span class="contact-avatar">${avatar}</span>
                <div class="contact-info">
                    <div class="contact-name">${this.escapeHtml(name)}</div>
                    <div class="contact-status">${statusText}</div>
                </div>
                <span class="contact-signal">${signal}</span>
            `;
            
            div.addEventListener('click', () => this.selectContact(key));
            container.appendChild(div);
        });
    }
    
    applyContactFilter(contactsArray) {
        switch (this.filterMode) {
            case 'favourites':
                return contactsArray.filter(([key]) => this.favourites.has(key));
            case 'companions':
                return contactsArray.filter(([, c]) => (c.type || 0) === 1 || (c.type || 0) === 0);
            case 'repeaters':
                return contactsArray.filter(([, c]) => c.type === 2);
            case 'rooms':
                return contactsArray.filter(([, c]) => c.type === 3);
            default:
                return contactsArray;
        }
    }
    
    applyContactSort(contactsArray) {
        switch (this.sortMode) {
            case 'latestMessage':
                return contactsArray.sort(([keyA], [keyB]) => {
                    const timeA = this.lastMessageTimes[keyA] || 0;
                    const timeB = this.lastMessageTimes[keyB] || 0;
                    return timeB - timeA;
                });
            case 'latestHeard':
                return contactsArray.sort(([, a], [, b]) => {
                    return (b.last_advert || 0) - (a.last_advert || 0);
                });
            case 'alphabetical':
                return contactsArray.sort(([, a], [, b]) => {
                    const nameA = (a.adv_name || '').toLowerCase();
                    const nameB = (b.adv_name || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });
            default:
                return contactsArray;
        }
    }
    
    toggleFavourite(key) {
        if (this.favourites.has(key)) {
            this.favourites.delete(key);
        } else {
            this.favourites.add(key);
        }
        localStorage.setItem('favourites', JSON.stringify([...this.favourites]));
        this.updateContactsList();
    }
    
    setupSortingFiltering() {
        const sortSelect = document.getElementById('contactSort');
        const filterSelect = document.getElementById('contactFilter');
        
        // Set initial values
        sortSelect.value = this.sortMode;
        filterSelect.value = this.filterMode;
        
        sortSelect.addEventListener('change', (e) => {
            this.sortMode = e.target.value;
            localStorage.setItem('contactSortMode', this.sortMode);
            this.updateContactsList();
        });
        
        filterSelect.addEventListener('change', (e) => {
            this.filterMode = e.target.value;
            localStorage.setItem('contactFilterMode', this.filterMode);
            this.updateContactsList();
        });
    }
    
    updateContactsTable() {
        const tbody = document.getElementById('contactsTableBody');
        
        if (Object.keys(this.contacts).length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No contacts</td></tr>';
            return;
        }
        
        tbody.innerHTML = '';
        
        Object.entries(this.contacts).forEach(([key, contact]) => {
            const tr = document.createElement('tr');
            
            const type = contact.type || 0;
            const typeName = type === 2 ? 'Repeater' : type === 3 ? 'Room' : 'Companion';
            const name = contact.adv_name || key.substring(0, 16) + '...';
            const pathLen = contact.out_path_len;
            const path = pathLen >= 0 ? `${pathLen} hop${pathLen !== 1 ? 's' : ''}` : 'Unknown';
            const lastSeen = this.timeAgo(contact.last_advert);
            
            // Different action buttons based on type
            const isRepeater = type === 2;
            const isRoom = type === 3;
            let actionBtn;
            
            if (isRepeater) {
                // Repeaters only have manage
                actionBtn = `<button class="btn" onclick="app.openRemoteManagement('${key}');">
                       ⚙️ Manage
                   </button>`;
            } else if (isRoom) {
                // Rooms have both message and manage
                actionBtn = `<button class="btn" onclick="app.selectContact('${key}'); document.querySelector('[data-tab=messages]').click();">
                       💬 Chat
                   </button>
                   <button class="btn" onclick="app.openRemoteManagement('${key}');">
                       ⚙️
                   </button>`;
            } else {
                // Companions only have message
                actionBtn = `<button class="btn" onclick="app.selectContact('${key}'); document.querySelector('[data-tab=messages]').click();">
                       💬 Message
                   </button>`;
            }
            
            tr.innerHTML = `
                <td>${this.escapeHtml(name)}</td>
                <td>${typeName}</td>
                <td>${path}</td>
                <td>${lastSeen}</td>
                <td>${actionBtn}</td>
            `;
            
            tbody.appendChild(tr);
        });
    }
    
    selectContact(key) {
        const contact = this.contacts[key];
        
        // Repeaters (type 2) only have management, not chat
        const type = contact?.type || 0;
        if (type === 2) {
            // Repeater - open remote management only
            this.openRemoteManagement(key);
            return;
        }
        
        this.currentContact = key;
        this.currentChannel = null;
        
        const name = contact?.adv_name || key.substring(0, 16) + '...';
        
        // For rooms (type 3), show manage button in header
        const manageBtn = type === 3 
            ? `<button class="btn btn-sm" onclick="app.openRemoteManagement('${key}')" title="Manage Room">⚙️</button>`
            : '';
        
        document.getElementById('chatHeader').innerHTML = `
            <span class="chat-title">${this.escapeHtml(name)}</span>
            ${manageBtn}
        `;
        
        // Enable input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        
        // Update contact list selection
        this.updateContactsList();
        
        // Load messages for this contact
        this.displayMessages(key);
    }
    
    // ============== Messages ==============
    
    setupMessageInput() {
        const input = document.getElementById('messageInput');
        const btn = document.getElementById('sendBtn');
        
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        btn.addEventListener('click', () => this.sendMessage());
    }
    
    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || (!this.currentContact && this.currentChannel === null)) return;
        
        const retry = document.getElementById('retryCheck').checked;
        
        try {
            const params = {
                text,
                signed: true,  // Always sign messages
                retries: retry ? 3 : 0
            };
            
            if (this.currentChannel !== null) {
                params.channel_idx = this.currentChannel;
                params.recipient = '';
            } else {
                params.recipient = this.currentContact;
            }
            
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });
            
            const data = await response.json();
            
            if (response.ok) {
                // Add outgoing message to display
                const key = this.currentChannel !== null ? `channel_${this.currentChannel}` : this.currentContact;
                this.addMessage(key, {
                    text,
                    sender: 'You',
                    timestamp: Date.now() / 1000,
                    outgoing: true,
                    status: 'sent',  // Message was sent successfully
                    expectedAck: data.expected_ack
                });
                
                if (data.expected_ack) {
                    this.pendingMessages[data.expected_ack] = key;
                }
                
                input.value = '';
            } else {
                throw new Error(data.detail || 'Send failed');
            }
        } catch (error) {
            this.showToast('Failed to send: ' + error.message, 'error');
        }
    }
    
    handleIncomingMessage(payload, isChannel) {
        const senderKey = payload.pubkey_prefix || payload.sender_key || '';
        const contact = Object.entries(this.contacts).find(([k]) => k.startsWith(senderKey));
        const senderName = contact ? contact[1].adv_name : senderKey.substring(0, 8) + '...';
        
        let key;
        if (isChannel) {
            key = `channel_${payload.channel_idx}`;
        } else {
            key = contact ? contact[0] : senderKey;
        }
        
        const messageTimestamp = payload.sender_timestamp || Date.now() / 1000;
        
        this.addMessage(key, {
            text: payload.text || '',
            sender: senderName,
            timestamp: messageTimestamp,
            outgoing: false,
            path: payload.path || payload.in_path || '',
            pathLen: (payload.path_len ?? payload.in_path_len ?? -1) === 255 ? -1 : (payload.path_len ?? payload.in_path_len ?? -1),
            isSigned: payload.txt_type === 2
        });
        
        // Track last message time for sorting
        if (!isChannel && key) {
            this.lastMessageTimes[key] = messageTimestamp;
            // Re-sort contact list if sorting by latest message
            if (this.sortMode === 'latestMessage') {
                this.updateContactsList();
            }
        }
        
        // Show notification if not viewing this contact
        if (key !== this.currentContact && key !== `channel_${this.currentChannel}`) {
            this.showToast(`New message from ${senderName}`, 'info');
        }
    }
    
    handleAck(payload) {
        const ackPrefix = payload.ack_prefix || '';
        
        // Find matching pending message
        for (const [expected, key] of Object.entries(this.pendingMessages)) {
            if (expected.startsWith(ackPrefix) || ackPrefix.startsWith(expected.substring(0, ackPrefix.length))) {
                // Update message status
                if (this.messages[key]) {
                    const msg = this.messages[key].find(m => m.expectedAck === expected);
                    if (msg) {
                        msg.status = 'acked';
                        this.displayMessages(key);
                    }
                }
                delete this.pendingMessages[expected];
                break;
            }
        }
    }
    
    addMessage(key, message) {
        if (!this.messages[key]) {
            this.messages[key] = [];
        }
        this.messages[key].push(message);
        
        // If viewing this contact/channel, update display
        if (key === this.currentContact || key === `channel_${this.currentChannel}`) {
            this.displayMessages(key);
        }
    }
    
    displayMessages(key) {
        const container = document.getElementById('messagesContainer');
        const messages = this.messages[key] || [];
        
        container.innerHTML = '';
        
        messages.forEach(msg => {
            const div = document.createElement('div');
            div.className = `message ${msg.outgoing ? 'outgoing' : 'incoming'}`;
            
            let statusHtml = '';
            if (msg.outgoing) {
                let statusIcon, statusText;
                switch (msg.status) {
                    case 'acked':
                        statusIcon = '✓✓';
                        statusText = 'Delivered';
                        break;
                    case 'sent':
                        statusIcon = '✓';
                        statusText = 'Sent';
                        break;
                    case 'failed':
                        statusIcon = '✗';
                        statusText = 'Failed';
                        break;
                    default:
                        statusIcon = '⏳';
                        statusText = 'Sending...';
                }
                statusHtml = `<div class="message-status">${statusIcon} ${statusText}</div>`;
            } else {
                // Show hops and signed status for incoming messages
                const pathLen = msg.pathLen;
                let hopsText = '';
                if (pathLen !== undefined && pathLen >= 0) {
                    if (pathLen === 0) {
                        hopsText = 'Direct';
                    } else {
                        hopsText = `${pathLen} hop${pathLen !== 1 ? 's' : ''}`;
                    }
                } else {
                    hopsText = 'Unknown path';
                }
                let signedText = msg.isSigned ? '<span class="signed-label">🔏 Signed</span>' : '<span class="signed-label">Unsigned</span>';
                statusHtml = `<div class="message-hops">📡 ${hopsText} ${signedText}</div>`;
            }
            
            div.innerHTML = `
                <div class="message-header">
                    <span class="message-sender">${this.escapeHtml(msg.sender)}</span>
                    <span class="message-time">${this.formatTime(msg.timestamp)}</span>
                </div>
                <div class="message-text">${this.escapeHtml(msg.text)}</div>
                ${statusHtml}
            `;
            
            container.appendChild(div);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }
    
    // ============== Channels ==============
    
    async loadChannels() {
        if (!this.connected) return;
        
        try {
            const response = await fetch('/api/channels');
            const data = await response.json();
            
            this.channels = data.channels;
            this.updateChannelsGrid();
        } catch (error) {
            console.error('Failed to load channels:', error);
        }
    }
    
    updateChannelsGrid() {
        const container = document.getElementById('channelsGrid');
        container.innerHTML = '';
        
        this.channels.forEach(channel => {
            const name = channel.channel_name || `Channel ${channel.channel_idx}`;
            const hasSecret = channel.channel_secret && channel.channel_secret !== '00000000000000000000000000000000';
            
            const div = document.createElement('div');
            div.className = `channel-card ${hasSecret ? 'active' : ''}`;
            
            div.innerHTML = `
                <div class="channel-header">
                    <span class="channel-name">${this.escapeHtml(name)}</span>
                    <span class="channel-idx">#${channel.channel_idx}</span>
                </div>
                <div class="channel-secret">
                    ${hasSecret ? 'Secret: ' + channel.channel_secret.substring(0, 8) + '...' : 'No secret set'}
                </div>
                <div class="channel-actions">
                    ${hasSecret ? `<button class="btn btn-sm" onclick="app.selectChannel(${channel.channel_idx})">💬 Open Chat</button>` : ''}
                </div>
            `;
            
            // Make the whole card clickable if it has a secret
            if (hasSecret) {
                div.style.cursor = 'pointer';
                div.addEventListener('click', (e) => {
                    // Don't trigger if clicking the button
                    if (e.target.tagName !== 'BUTTON') {
                        this.selectChannel(channel.channel_idx);
                    }
                });
            }
            
            container.appendChild(div);
        });
    }
    
    selectChannel(channelIdx) {
        const channel = this.channels.find(c => c.channel_idx === channelIdx);
        if (!channel) return;
        
        const name = channel.channel_name || `Channel ${channelIdx}`;
        
        this.currentChannel = channelIdx;
        this.currentContact = null;
        
        document.getElementById('chatHeader').innerHTML = `
            <span class="chat-title">📻 ${this.escapeHtml(name)}</span>
            <span class="channel-badge">#${channelIdx}</span>
        `;
        
        // Enable input
        document.getElementById('messageInput').disabled = false;
        document.getElementById('sendBtn').disabled = false;
        
        // Switch to messages tab
        document.querySelector('[data-tab=messages]').click();
        
        // Update contact list to show no selection
        this.updateContactsList();
        
        // Display channel messages
        this.displayMessages(`channel_${channelIdx}`);
    }
    
    // ============== Device ==============
    
    async loadDeviceInfo() {
        if (!this.connected) return;
        
        try {
            const response = await fetch('/api/device');
            const data = await response.json();
            
            const container = document.getElementById('deviceInfo');
            const info = data.self_info || {};
            
            container.innerHTML = `
                <span class="info-label">Name</span>
                <span class="info-value">${this.escapeHtml(info.adv_name || info.name || 'Unknown')}</span>
                
                <span class="info-label">Public Key</span>
                <span class="info-value" style="word-break: break-all; font-size: 12px;">${info.public_key || 'Unknown'}</span>
                
                <span class="info-label">Location</span>
                <span class="info-value">${info.adv_lat || 0}, ${info.adv_lon || 0}</span>
                
                <span class="info-label">Firmware</span>
                <span class="info-value">${info.fw_ver || 'Unknown'}</span>
            `;
            
            // Update clock display
            this.updateClockDisplay(data.time);
            
            // Fill in settings form
            document.getElementById('deviceName').value = info.adv_name || info.name || '';
            document.getElementById('deviceLat').value = info.adv_lat || '';
            document.getElementById('deviceLon').value = info.adv_lon || '';
            
            if (data.radio) {
                document.getElementById('deviceTxPower').value = data.radio.tx_power || '';
            }
        } catch (error) {
            console.error('Failed to load device info:', error);
        }
    }
    
    updateClockDisplay(deviceTimestamp) {
        const deviceTimeEl = document.getElementById('deviceTime');
        const localTimeEl = document.getElementById('localTime');
        const timeDiffEl = document.getElementById('timeDiff');
        
        const now = Math.floor(Date.now() / 1000);
        const localDate = new Date();
        
        localTimeEl.textContent = localDate.toLocaleString();
        
        if (deviceTimestamp && deviceTimestamp > 0) {
            const deviceDate = new Date(deviceTimestamp * 1000);
            deviceTimeEl.textContent = deviceDate.toLocaleString();
            
            const diff = now - deviceTimestamp;
            const absDiff = Math.abs(diff);
            
            let diffText;
            let diffClass = '';
            
            if (absDiff < 5) {
                diffText = 'In sync ✓';
                diffClass = 'success';
            } else if (absDiff < 60) {
                diffText = `${absDiff} seconds ${diff > 0 ? 'behind' : 'ahead'}`;
                diffClass = 'warning';
            } else if (absDiff < 3600) {
                diffText = `${Math.floor(absDiff / 60)} minutes ${diff > 0 ? 'behind' : 'ahead'}`;
                diffClass = 'error';
            } else {
                diffText = `${Math.floor(absDiff / 3600)} hours ${diff > 0 ? 'behind' : 'ahead'}`;
                diffClass = 'error';
            }
            
            timeDiffEl.textContent = diffText;
            timeDiffEl.className = `clock-value ${diffClass}`;
        } else {
            deviceTimeEl.textContent = 'Not set';
            timeDiffEl.textContent = 'Clock not synced';
            timeDiffEl.className = 'clock-value error';
        }
    }
    
    async syncDeviceTime() {
        if (!this.connected) {
            this.showToast('Not connected', 'error');
            return;
        }
        
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            
            const response = await fetch('/api/device/time', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timestamp })
            });
            
            if (response.ok) {
                this.showToast('Device time synchronized!', 'success');
                // Refresh device info to show updated time
                await this.loadDeviceInfo();
            } else {
                const data = await response.json();
                throw new Error(data.detail || 'Failed to sync time');
            }
        } catch (error) {
            this.showToast('Failed to sync time: ' + error.message, 'error');
        }
    }
    
    // ============== Stats ==============
    
    async loadStats() {
        if (!this.connected) return;
        
        try {
            const response = await fetch('/api/stats');
            const data = await response.json();
            
            if (data.link) {
                document.getElementById('statTxPackets').textContent = data.link.tx_packets || 0;
                document.getElementById('statRxPackets').textContent = data.link.rx_packets || 0;
                document.getElementById('statTxBytes').textContent = this.formatBytes(data.link.tx_bytes || 0);
                document.getElementById('statRxBytes').textContent = this.formatBytes(data.link.rx_bytes || 0);
                document.getElementById('statUptime').textContent = this.formatDuration(data.link.uptime || 0);
            }
            
            if (data.battery) {
                const pct = data.battery.percentage;
                document.getElementById('statBattery').textContent = pct >= 0 ? `${pct}%` : 'N/A';
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }
    
    // ============== Event Listeners ==============
    
    setupEventListeners() {
        document.getElementById('refreshContacts').addEventListener('click', () => this.loadContacts());
        document.getElementById('refreshChannels').addEventListener('click', () => this.loadChannels());
        document.getElementById('refreshDevice').addEventListener('click', () => this.loadDeviceInfo());
        document.getElementById('refreshStats').addEventListener('click', () => this.loadStats());
        
        // Sync time button
        document.getElementById('syncTimeBtn').addEventListener('click', () => this.syncDeviceTime());
        
        document.getElementById('deviceSettingsForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveDeviceSettings();
        });
        
        // Contact search
        document.getElementById('contactSearch').addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const items = document.querySelectorAll('.contact-item');
            
            items.forEach(item => {
                const name = item.querySelector('.contact-name').textContent.toLowerCase();
                item.style.display = name.includes(query) ? '' : 'none';
            });
        });
    }
    
    async saveDeviceSettings() {
        const settings = {
            name: document.getElementById('deviceName').value || null,
            lat: parseFloat(document.getElementById('deviceLat').value) || null,
            lon: parseFloat(document.getElementById('deviceLon').value) || null,
            tx_power: parseInt(document.getElementById('deviceTxPower').value) || null
        };
        
        // Remove null values
        Object.keys(settings).forEach(key => {
            if (settings[key] === null) delete settings[key];
        });
        
        if (settings.lat !== undefined && settings.lon === undefined) {
            settings.lon = 0;
        }
        if (settings.lon !== undefined && settings.lat === undefined) {
            settings.lat = 0;
        }
        
        try {
            const response = await fetch('/api/device/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            
            if (response.ok) {
                this.showToast('Settings saved!', 'success');
                this.loadDeviceInfo();
            } else {
                const data = await response.json();
                throw new Error(data.detail || 'Save failed');
            }
        } catch (error) {
            this.showToast('Failed to save: ' + error.message, 'error');
        }
    }
    
    // ============== Utilities ==============
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 4000);
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    timeAgo(timestamp) {
        if (!timestamp) return 'Never';
        
        const now = Date.now() / 1000;
        const diff = now - timestamp;
        
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    }
    
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }
    
    formatDuration(seconds) {
        if (!seconds) return '--';
        
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }
    
    // ============== BLE Device History ==============
    
    loadBleDeviceHistory() {
        const devices = JSON.parse(localStorage.getItem('bleDevices') || '[]');
        const datalist = document.getElementById('bleDeviceHistory');
        if (datalist) {
            datalist.innerHTML = '';
            devices.forEach(device => {
                const option = document.createElement('option');
                option.value = device;
                datalist.appendChild(option);
            });
        }
    }
    
    saveBleDevice(deviceName) {
        if (!deviceName || !deviceName.trim()) return;
        
        deviceName = deviceName.trim();
        let devices = JSON.parse(localStorage.getItem('bleDevices') || '[]');
        
        // Remove if exists (to move to front)
        devices = devices.filter(d => d !== deviceName);
        
        // Add to front
        devices.unshift(deviceName);
        
        // Keep only last 10
        devices = devices.slice(0, 10);
        
        localStorage.setItem('bleDevices', JSON.stringify(devices));
        this.loadBleDeviceHistory();
    }
}

// Initialize app
const app = new MeshCoreApp();









































