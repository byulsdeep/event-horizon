import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { client, databases, storage, account, teams, ADMIN_USER_ID, DATABASE_ID, COLLECTION_ID, BUCKET_ID, APP_VERSION } from './lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import './App.css';

export default function Chat() {
    // --- STATE ---
    const [user, setUser] = useState(null);
    const [myTeams, setMyTeams] = useState([]);
    const [authMode, setAuthMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

    // App
    const [currentTeam, setCurrentTeam] = useState(null);
    const [showInfo, setShowInfo] = useState(false);
    const [unreadCounts, setUnreadCounts] = useState({});

    // Chat Content
    const [messages, setMessages] = useState([]);

    // Visibility & Logic
    const [isRoomReady, setIsRoomReady] = useState(false);
    const [pendingImages, setPendingImages] = useState(0);
    const imagesLoadedCount = useRef(0);

    // Inputs
    const [msgText, setMsgText] = useState('');
    const [imgFile, setImgFile] = useState(null);
    const [blackHoleSize, setBlackHoleSize] = useState(0);

    const [showNewMsgAlert, setShowNewMsgAlert] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);

    // Refs
    const chatContainerRef = useRef(null);
    const bottomAnchorRef = useRef(null);
    const isAtBottomRef = useRef(true);
    const fileInputRef = useRef(null);
    const initRef = useRef(false);
    const longPressTimer = useRef(null);
    const textareaRef = useRef(null);

    const currentTeamRef = useRef(null);
    const myTeamsRef = useRef([]);
    const userRef = useRef(null);
    const readQueueRef = useRef([]);
    const isProcessingQueue = useRef(false);

    // Draft Logic Ref
    const lastLoadedTeamId = useRef(null);

    useEffect(() => { currentTeamRef.current = currentTeam; }, [currentTeam]);
    useEffect(() => { myTeamsRef.current = myTeams; }, [myTeams]);
    useEffect(() => { userRef.current = user; }, [user]);

    // Theme
    useEffect(() => {
        const root = document.documentElement;
        if (theme === 'system') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Init
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        checkSession();
        if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission();
    }, []);

    const checkSession = async () => {
        setIsLoading(true);
        try {
            const current = await account.get();
            setUser(current);
            await fetchTeams();
        } catch { setUser(null); }
        finally { setIsLoading(false); }
    };

    const fetchTeams = async () => {
        try {
            const response = await teams.list();
            setMyTeams(response.teams);
        } catch (e) { console.error(e); }
    };

    // Listener
    useEffect(() => {
        if (!user) return;
        const unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
            (response) => {
                const payload = response.payload;
                const eventType = response.events[0];
                const activeTeam = currentTeamRef.current;
                const knownTeams = myTeamsRef.current;
                const currentUser = userRef.current;
                const team = knownTeams.find(t => t.$id === payload.roomId);
                if (!team) return;

                if (activeTeam && payload.roomId === activeTeam.$id) {
                    if (eventType.includes('.create')) {
                        const newMsg = { ...payload, isRealtime: true };
                        setMessages(prev => [...prev, newMsg]);
                        queueMarkAsRead(payload);
                        if (document.hidden && payload.senderId !== currentUser.$id) sendNotification(payload.sender, payload.body, team.name);
                    }
                    else if (eventType.includes('.update')) setMessages(prev => prev.map(msg => msg.$id === payload.$id ? payload : msg));
                    else if (eventType.includes('.delete')) setMessages(prev => prev.filter(msg => msg.$id !== payload.$id));
                }
                else {
                    if (eventType.includes('.create') && payload.senderId !== currentUser.$id) {
                        setUnreadCounts(prev => ({ ...prev, [payload.roomId]: (prev[payload.roomId] || 0) + 1 }));
                        sendNotification(payload.sender, payload.body, team.name);
                    }
                }
            }
        );
        return () => unsubscribe();
    }, [user]);

    const queueMarkAsRead = (msg) => {
        if (msg.readBy && msg.readBy.includes(user.$id)) return;
        readQueueRef.current.push(msg);
        processReadQueue();
    };
    const processReadQueue = async () => {
        if (isProcessingQueue.current) return;
        isProcessingQueue.current = true;
        while (readQueueRef.current.length > 0) {
            const msg = readQueueRef.current.shift();
            try {
                if (!msg.readBy.includes(user.$id)) await databases.updateDocument(DATABASE_ID, COLLECTION_ID, msg.$id, { readBy: [...msg.readBy, user.$id] });
            } catch (err) { console.error(err); }
            await new Promise(r => setTimeout(r, 500));
        }
        isProcessingQueue.current = false;
    };

    // --- DRAFTS & RESIZE ---
    const adjustTextareaHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '50px';
            if (textareaRef.current.scrollHeight > 50) {
                textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
            }
        }
    };

    const calculateBlackHole = (text, file) => {
        const weight = getWeightedLength(text);
        const maxWeight = 40;
        let percentage = Math.min(100, (weight / maxWeight) * 100);
        if (file) percentage = Math.max(percentage, 50);
        if (text.length > 0) percentage = Math.max(percentage, 10);
        setBlackHoleSize(percentage);
    };

    // Single Logic Loop for Drafts to prevent Race Conditions
    useLayoutEffect(() => {
        adjustTextareaHeight();

        if (currentTeam) {
            // Case 1: Just Entered Room (Load Draft)
            if (lastLoadedTeamId.current !== currentTeam.$id) {
                const savedDrafts = JSON.parse(localStorage.getItem('horizon_drafts') || '{}');
                const draft = savedDrafts[currentTeam.$id] || '';

                // Set state without triggering save immediately
                setMsgText(draft);
                calculateBlackHole(draft, imgFile);
                lastLoadedTeamId.current = currentTeam.$id;
            }
            // Case 2: Already in Room (Save Draft)
            else {
                const savedDrafts = JSON.parse(localStorage.getItem('horizon_drafts') || '{}');
                // Optimization: Only write if different
                if (savedDrafts[currentTeam.$id] !== msgText) {
                    savedDrafts[currentTeam.$id] = msgText;
                    localStorage.setItem('horizon_drafts', JSON.stringify(savedDrafts));
                }
            }
        } else {
            // Left Room
            lastLoadedTeamId.current = null;
            setMsgText('');
            setBlackHoleSize(0);
        }
    }, [currentTeam, msgText, imgFile]);

    // --- ROOM LOGIC (FIXED BLINKING) ---
    useEffect(() => {
        if (currentTeam) {
            setMessages([]);
            setIsRoomReady(false); // <--- Hides the view immediately
            isAtBottomRef.current = true;
            setShowNewMsgAlert(false);
            setUnreadCounts(prev => ({ ...prev, [currentTeam.$id]: 0 }));
            setPendingImages(0);
            imagesLoadedCount.current = 0;
            loadMessages();
        }
    }, [currentTeam]);

    useEffect(() => {
        if (!currentTeam || messages.length === 0) return;
        messages.filter(m => m.readBy && !m.readBy.includes(user.$id)).forEach(queueMarkAsRead);

        if (!isRoomReady) {
            const imgCount = messages.filter(m => m.fileId).length;
            setPendingImages(imgCount);
            if (imgCount === 0) finalizeRoomView();
            // Fallback if images fail
            const timer = setTimeout(finalizeRoomView, 0);
            return () => clearTimeout(timer);
        }
    }, [messages, currentTeam]);

    const onImgLoad = () => {
        imagesLoadedCount.current += 1;
        if (!isRoomReady && imagesLoadedCount.current >= pendingImages) finalizeRoomView();
        if (isRoomReady && isAtBottomRef.current) scrollToBottom("auto");
    };

    const finalizeRoomView = () => {
        scrollToBottom("auto");
        // Small delay to ensure paint is done before fading in
        requestAnimationFrame(() => {
            requestAnimationFrame(() => setIsRoomReady(true));
        });
    };

    useLayoutEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (isRoomReady) {
            if (lastMsg.senderId === user?.$id || isAtBottomRef.current) { scrollToBottom("auto"); setShowNewMsgAlert(false); }
            else { setShowNewMsgAlert(true); }
        }
    }, [messages, user, isRoomReady]);

    const scrollToBottom = (behavior = "auto") => requestAnimationFrame(() => bottomAnchorRef.current?.scrollIntoView({ behavior, block: "end" }));
    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        if (isAtBottomRef.current) setShowNewMsgAlert(false);
    };

    const sendNotification = (sender, body, context) => {
        if ("Notification" in window && Notification.permission === "granted") new Notification(`Signal: ${sender} / ${context}`, { body: body || "Visual Data", icon: '/logo.svg', tag: 'chat-msg' });
    };

    const getUnreadCount = (msg) => {
        if (!msg.readBy) return 0;
        const count = (currentTeam.total || 0) - msg.readBy.length;
        return count > 0 ? count : null;
    };

    const formatTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const formatDate = (iso) => {
        const d = new Date(iso); const t = new Date();
        if (d.toDateString() === t.toDateString()) return "CURRENT CYCLE";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const week = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
        return `CYCLE: ${year}.${month}.${day} // ${week}`;
    };
    const isNewDay = (curr, prev) => !prev || new Date(curr).toDateString() !== new Date(prev).toDateString();

    // --- INPUT HANDLING ---
    const getWeightedLength = (str) => {
        let len = 0;
        for (let i = 0; i < str.length; i++) {
            len += str.charCodeAt(i) > 255 ? 2 : 1;
        }
        return len;
    };

    const handleInput = (e) => {
        const val = e.target.value;
        setMsgText(val);
        // Note: Resize and Save is handled by useLayoutEffect
        calculateBlackHole(val, imgFile);
    };

    const handleFile = (e) => {
        const file = e.target.files[0];
        setImgFile(file);
        calculateBlackHole(msgText, file);
    };

    const clearChatInputs = () => {
        setMsgText('');
        setImgFile(null);
        setBlackHoleSize(0);

        // Clear draft specifically
        const savedDrafts = JSON.parse(localStorage.getItem('horizon_drafts') || '{}');
        delete savedDrafts[currentTeam.$id];
        localStorage.setItem('horizon_drafts', JSON.stringify(savedDrafts));

        if (fileInputRef.current) fileInputRef.current.value = '';
        if (textareaRef.current) textareaRef.current.style.height = '50px';
    };

    const toggleTheme = () => { const modes = ['system', 'dark', 'light']; setTheme(modes[(modes.indexOf(theme) + 1) % modes.length]); };
    const getThemeName = () => { if (theme === 'dark') return 'VOID'; if (theme === 'light') return 'ACCRETION'; return 'SYSTEM'; };

    // Context Menu & Actions
    const handleRightClick = (e, msg) => { e.preventDefault(); setContextMenu({ msg }); };
    const handleTouchStart = (msg) => { longPressTimer.current = setTimeout(() => { setContextMenu({ msg }); }, 600); };
    const cancelLongPress = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };
    const handleCopy = () => { if (contextMenu?.msg?.body) navigator.clipboard.writeText(contextMenu.msg.body); setContextMenu(null); };
    const handleSaveImage = () => { if (contextMenu?.msg?.fileId) { const url = storage.getFileDownload(BUCKET_ID, contextMenu.msg.fileId); const a = document.createElement('a'); a.href = url; a.download = "horizon_data.png"; document.body.appendChild(a); a.click(); document.body.removeChild(a); } setContextMenu(null); };
    const handleDelete = async () => { const msg = contextMenu?.msg; if (!msg) return; if (confirm("Confirm protocol: Purge this data?")) { try { if (msg.fileId) await storage.deleteFile(BUCKET_ID, msg.fileId); await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, msg.$id); } catch { alert("Access Denied."); } } setContextMenu(null); };
    const handleAuth = async (e) => { e.preventDefault(); if (isLoading) return; setIsLoading(true); try { if (authMode === 'signup') { await account.create(ID.unique(), email, password, name); alert("Protocol Initialized. Awaiting Admin Approval."); setAuthMode('login'); } else { await account.createEmailPasswordSession(email, password); const current = await account.get(); setUser(current); await fetchTeams(); } } catch (err) { alert(err.message); } finally { setIsLoading(false); } };
    const handleLogout = async () => { await account.deleteSession('current'); setUser(null); setMyTeams([]); setCurrentTeam(null); setMessages([]); };
    const loadMessages = async () => { try { const response = await databases.listDocuments(DATABASE_ID, COLLECTION_ID, [Query.equal('roomId', currentTeam.$id), Query.limit(100)]); setMessages(response.documents); } catch (err) { console.error(err); } };
    const sendMessage = async (e) => { e.preventDefault(); if (!msgText && !imgFile) return; let fileId = null; if (imgFile) { const upload = await storage.createFile(BUCKET_ID, ID.unique(), imgFile); fileId = upload.$id; } await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), { body: msgText, sender: user.name, senderId: user.$id, fileId: fileId, roomId: currentTeam.$id, readBy: [user.$id] }, [Permission.read(Role.team(currentTeam.$id)), Permission.update(Role.team(currentTeam.$id)), Permission.delete(Role.user(user.$id))]); clearChatInputs(); };
    const getImageUrl = (fileId) => storage.getFileView(BUCKET_ID, fileId);

    // --- RENDER ---
    if (isLoading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100dvh', background: 'var(--bg-color)', color: 'var(--accent)', fontFamily: 'monospace' }}>INITIALIZING LINK...</div>;
    if (!user) return <div style={{ padding: '20px', maxWidth: '300px', margin: '50px auto', textAlign: 'center' }}><div className="black-hole-container"><div className="accretion-disk"></div><div className="event-horizon"></div></div><h1 style={{ color: 'var(--text-primary)', marginBottom: '30px', fontWeight: 200, letterSpacing: '2px' }}>EVENT HORIZON</h1><form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>{authMode === 'signup' && <input className="ios-input" type="text" placeholder="IDENTITY" value={name} onChange={e => setName(e.target.value)} required />}<input className="ios-input" type="email" placeholder="COORDINATES (EMAIL)" value={email} onChange={e => setEmail(e.target.value)} required /><input className="ios-input" type="password" placeholder="KEY (PASSWORD)" value={password} onChange={e => setPassword(e.target.value)} required /><button type="submit" className="ios-btn" style={{ marginTop: '10px' }}>{authMode === 'login' ? 'ESTABLISH LINK' : 'REGISTER SIGNAL'}</button></form><p style={{ fontSize: '11px', marginTop: '20px', cursor: 'pointer', color: 'var(--accent)', letterSpacing: '1px' }} onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>{authMode === 'login' ? 'NO SIGNAL? REGISTER' : 'RETURN TO LOGIN'}</p><div style={{ marginTop: '40px', fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer', letterSpacing: '2px' }} onClick={toggleTheme}>VISUAL: {getThemeName()}</div></div>;
    if (showInfo) return <div style={{ maxWidth: '450px', margin: '0 auto', height: '100dvh', padding: '20px', background: 'var(--bg-color)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}><div className="black-hole-container"><div className="accretion-disk"></div><div className="event-horizon"></div></div><h2 style={{ fontWeight: 200, letterSpacing: '2px' }}>EVENT HORIZON</h2><p style={{ color: 'var(--text-secondary)', fontFamily: 'monospace' }}>V{APP_VERSION}</p><div style={{ margin: '30px 0', padding: '20px', background: 'var(--chat-bg)', borderRadius: '15px', border: '1px solid var(--border)' }}><p>OPERATOR: <strong>BYUL</strong></p><p>COMMS: <a href="mailto:byulzdeep@gmail.com" style={{ color: 'var(--accent)' }}>BYULZDEEP@GMAIL.COM</a></p></div><button className="ios-btn" onClick={() => setShowInfo(false)}>DISMISS</button></div>;
    if (!currentTeam) return <div style={{ maxWidth: '450px', margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column' }}><div className="glass-header"><button className="ios-btn secondary" onClick={() => setShowInfo(true)}>DATA</button><h2 style={{ margin: 0, fontSize: '16px', letterSpacing: '1px', textTransform: 'uppercase' }}>Active Frequencies</h2><button className="ios-btn secondary" onClick={handleLogout}>SEVER</button></div><div className="scroll-container visible" style={{ flex: 1, padding: '15px' }}><div style={{ marginBottom: '20px', padding: '0 10px', color: 'var(--text-secondary)', fontSize: '10px', textTransform: 'uppercase', fontWeight: 800, letterSpacing: '1px' }}>Available Links</div>{myTeams.length === 0 ? <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>NO FREQUENCIES DETECTED.<br />AWAITING ADMIN PROTOCOL.</div> : <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', background: 'var(--chat-bg)', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>{myTeams.map((team, idx) => (<div key={team.$id} onClick={() => setCurrentTeam(team)} style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: idx !== myTeams.length - 1 ? '1px solid var(--border)' : 'none', }}><span style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '0.5px' }}>{team.name.toUpperCase()}</span>{unreadCounts[team.$id] > 0 ? <span className="badge">{unreadCounts[team.$id]}</span> : <span style={{ color: 'var(--text-secondary)' }}>›</span>}</div>))}</div>}</div></div>;

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', height: '100dvh', display: 'flex', flexDirection: 'column', background: 'var(--bg-color)' }}>
            <div className="glass-header">
                <button className="ios-btn secondary" onClick={() => { setCurrentTeam(null); }}>‹ RETREAT</button>
                <h3 style={{ margin: 0, fontSize: '14px', letterSpacing: '1px', textTransform: 'uppercase' }}>{currentTeam.name}</h3>
                <div style={{ width: '50px' }}></div>
            </div>

            <div ref={chatContainerRef} className={`scroll-container ${isRoomReady ? 'visible' : ''}`} onScroll={handleScroll} style={{ flex: 1, padding: '15px', display: 'flex', flexDirection: 'column' }}>
                {messages.map((msg, index) => {
                    const showDate = isNewDay(msg.$createdAt, messages[index - 1]?.$createdAt);
                    const readCount = getUnreadCount(msg);
                    const isMe = msg.senderId === user.$id;
                    return (
                        <div key={msg.$id} className={msg.isRealtime ? "animate-new" : ""} style={{ width: '100%' }}>
                            {showDate && <div style={{ textAlign: 'center', margin: '20px 0 10px 0', fontSize: '10px', color: 'var(--text-secondary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>{formatDate(msg.$createdAt)}</div>}
                            <div className={`msg-row ${isMe ? 'me' : 'them'}`}>
                                {isMe && <div className="meta-col me">{readCount !== null && <span className="meta-read">{readCount}</span>}<span className="meta-time">{formatTime(msg.$createdAt)}</span></div>}
                                {!isMe && <div className={`bubble them`} onContextMenu={(e) => handleRightClick(e, msg)} onTouchStart={() => handleTouchStart(msg)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}><div style={{ fontWeight: 'bold', fontSize: '10px', opacity: 0.7, marginBottom: '2px', letterSpacing: '0.5px' }}>{msg.sender.toUpperCase()}</div>{msg.fileId && <img src={getImageUrl(msg.fileId)} onLoad={onImgLoad} alt="attachment" />}{msg.body && <div>{msg.body}</div>}</div>}
                                {isMe && <div className={`bubble me`} onContextMenu={(e) => handleRightClick(e, msg)} onTouchStart={() => handleTouchStart(msg)} onTouchEnd={cancelLongPress} onTouchMove={cancelLongPress}>{msg.fileId && <img src={getImageUrl(msg.fileId)} onLoad={onImgLoad} alt="attachment" />}{msg.body && <div>{msg.body}</div>}</div>}
                                {!isMe && <div className="meta-col them">{readCount !== null && <span className="meta-read">{readCount}</span>}<span className="meta-time">{formatTime(msg.$createdAt)}</span></div>}
                            </div>
                        </div>
                    );
                })}
                <div ref={bottomAnchorRef} />
            </div>

            {showNewMsgAlert && <div onClick={() => scrollToBottom("smooth")} style={{ position: 'absolute', bottom: '90px', left: '50%', transform: 'translateX(-50%)', background: 'var(--accent)', color: 'white', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', boxShadow: 'var(--shadow)', fontSize: '11px', zIndex: 100, fontWeight: 800, letterSpacing: '1px' }}>↓ NEW TRANSMISSION</div>}

            <form onSubmit={sendMessage} style={{ padding: '10px', background: 'var(--header-bg)', backdropFilter: 'blur(20px)', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', cursor: 'pointer', padding: '0 5px', height: '44px' }}>
                    <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                </label>

                <textarea
                    ref={textareaRef}
                    className="ios-input"
                    style={{ flex: 1 }}
                    value={msgText}
                    onChange={handleInput}
                    placeholder="TRANSMIT..."
                    rows={1}
                />

                <button type="submit" className={`send-btn-container ${msgText || imgFile ? 'active' : ''}`} disabled={!msgText && !imgFile} style={{ border: 'none', height: '50px' }}>
                    <div className="tornado-wrapper" style={{ transform: `scale(${blackHoleSize / 100})` }}>
                        <div className="mini-disk"></div>
                        <div className="mini-horizon"></div>
                    </div>
                </button>
            </form>
            {imgFile && <div style={{ position: 'absolute', bottom: '70px', left: '20px', background: 'var(--bg-color)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: '10px', fontSize: '10px', color: 'var(--accent)', fontWeight: 'bold' }}>VISUAL ATTACHED</div>}

            {contextMenu && (
                <div className="modal-overlay" onClick={() => setContextMenu(null)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        {contextMenu.msg.body && <div className="modal-option" onClick={handleCopy}>CAPTURE DATA</div>}
                        {contextMenu.msg.fileId && <div className="modal-option" onClick={handleSaveImage}>ARCHIVE VISUAL</div>}
                        {(contextMenu.msg.senderId === user.$id || user.$id === ADMIN_USER_ID) && <div className="modal-option danger" onClick={handleDelete}>PURGE SIGNAL</div>}
                        <button className="modal-option cancel" onClick={() => setContextMenu(null)}>ABORT</button>
                    </div>
                </div>
            )}
        </div>
    );
}