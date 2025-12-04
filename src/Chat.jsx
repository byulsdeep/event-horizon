import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { client, databases, storage, account, teams, ADMIN_USER_ID, DATABASE_ID, COLLECTION_ID, BUCKET_ID } from './lib/appwrite'; // <--- Added 'teams'
import { ID, Query, Permission, Role } from 'appwrite';

// --- CONFIG ---

export default function Chat() {
    // Auth & Teams
    const [user, setUser] = useState(null);
    const [myTeams, setMyTeams] = useState([]); // List of teams user belongs to
    const [authMode, setAuthMode] = useState('login');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    
    // App State
    const [currentTeam, setCurrentTeam] = useState(null); // The selected "Room"
    
    // Chat State
    const [messages, setMessages] = useState([]);
    const [msgText, setMsgText] = useState('');
    const [imgFile, setImgFile] = useState(null);
    const [showNewMsgAlert, setShowNewMsgAlert] = useState(false);

    // Refs
    const chatContainerRef = useRef(null);
    const isAtBottomRef = useRef(true);
    const fileInputRef = useRef(null); 
    const initRef = useRef(false);

    // 1. Check Session on Load
    useEffect(() => {
        if (initRef.current) return;
        initRef.current = true;
        checkSession();
    }, []);

    const checkSession = async () => {
        setIsLoading(true);
            try {
            const current = await account.get();
            setUser(current);
            await fetchTeams(); // Get the rooms they are allowed in
            } catch {
            setUser(null);
        } finally {
            setIsLoading(false);
            }
        };

    const fetchTeams = async () => {
        try {
            const response = await teams.list();
            setMyTeams(response.teams);
        } catch (e) {
            console.error("Failed to list teams", e);
        }
    };

    // 2. Realtime (Listen to the SPECIFIC Team ID)
    useEffect(() => {
        if (!user || !currentTeam) return;
        
        loadMessages();

        const unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
            (response) => {
                const payload = response.payload;
                // Only accept messages for THIS team
                if (payload.roomId !== currentTeam.$id) return;

                if (response.events.includes('databases.*.collections.*.documents.*.create')) {
                    setMessages(prev => [...prev, payload]);
                }
                if (response.events.includes('databases.*.collections.*.documents.*.delete')) {
                    setMessages(prev => prev.filter(msg => msg.$id !== payload.$id));
                }
            }
        );
        return () => unsubscribe();
    }, [user, currentTeam]); // Re-run when switching teams

    // 3. Auto-Scroll Logic
    useLayoutEffect(() => {
        if (messages.length === 0) return;
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.senderId === user?.$id || isAtBottomRef.current) {
            scrollToBottom();
            setShowNewMsgAlert(false);
        } else {
            setShowNewMsgAlert(true);
        }
    }, [messages, user]);

    // --- ACTIONS ---

    const clearChatInputs = () => {
        setMsgText('');
        setImgFile(null);
        if (fileInputRef.current) fileInputRef.current.value = ''; 
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        if (isLoading) return;
        setIsLoading(true);
        try {
            if (authMode === 'signup') {
                await account.create(ID.unique(), email, password, name);
                alert("Account created! Ask Admin to add you to a Team, then Login.");
                setAuthMode('login');
            } else {
                await account.createEmailPasswordSession(email, password);
                const current = await account.get();
                setUser(current);
                await fetchTeams();
            }
        } catch (err) {
            alert(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        await account.deleteSession('current');
        setUser(null);
        setMyTeams([]);
        setCurrentTeam(null);
        setMessages([]);
    };

    const loadMessages = async () => {
        try {
            const response = await databases.listDocuments(
                DATABASE_ID, COLLECTION_ID, 
                [
                    Query.equal('roomId', currentTeam.$id), // Filter by Team ID
                    Query.limit(100)
                ]
            );
            setMessages(response.documents);
            setTimeout(scrollToBottom, 100);
        } catch (err) {
            console.error(err);
        }
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!msgText && !imgFile) return;

        let fileId = null;
        if (imgFile) {
            const upload = await storage.createFile(BUCKET_ID, ID.unique(), imgFile);
            fileId = upload.$id;
        }
        
        await databases.createDocument(
            DATABASE_ID, COLLECTION_ID, ID.unique(), 
            {
                body: msgText,
                sender: user.name,
                senderId: user.$id,
                fileId: fileId,
                roomId: currentTeam.$id // Save Team ID as Room ID
            },
            [
                // MAGIC: Only allow THIS Team to read this message
                Permission.read(Role.team(currentTeam.$id)), 
                Permission.update(Role.user(user.$id)),   
                Permission.delete(Role.user(user.$id))
            ]
        );
        clearChatInputs(); 
    };

    const deleteMessage = async (msg) => {
        if(confirm("Delete this?")) {
            try {
                if (msg.fileId) await storage.deleteFile(BUCKET_ID, msg.fileId);
                await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, msg.$id);
            } catch {
                alert("Permission denied.");
            }
        }
    }

    const scrollToBottom = () => chatContainerRef.current?.scrollTo(0, chatContainerRef.current.scrollHeight);
    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        isAtBottomRef.current = scrollHeight - scrollTop - clientHeight < 50;
        if (isAtBottomRef.current) setShowNewMsgAlert(false);
    };
    const getImageUrl = (fileId) => storage.getFileView(BUCKET_ID, fileId); 


    // --- VIEW 1: LOADING ---
    if (isLoading && !user) return <div style={{padding:'50px', textAlign:'center'}}>Initializing...</div>;

    // --- VIEW 2: AUTH ---
    if (!user) {
        return (
            <div style={{ padding: '20px', maxWidth: '300px', margin: '50px auto', textAlign: 'center' }}>
                <h2>Event Horizon</h2>
                <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {authMode === 'signup' && <input type="text" placeholder="Display Name" value={name} onChange={e => setName(e.target.value)} required style={{padding: '10px'}}/>}
                    <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required style={{padding: '10px'}}/>
                    <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} required style={{padding: '10px'}}/>
                    <button type="submit" disabled={isLoading} style={{padding: '10px', background: '#000', color: '#fff'}}>{authMode === 'login' ? 'Login' : 'Sign Up'}</button>
                </form>
                <p style={{fontSize: '12px', marginTop: '10px', cursor: 'pointer', color: 'blue'}} onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
                    {authMode === 'login' ? 'Need an account? Sign Up' : 'Have an account? Login'}
                </p>
            </div>
        );
    }

    // --- VIEW 3: TEAM SELECT (The "Lobby") ---
    if (!currentTeam) {
        return (
            <div style={{ padding: '20px', maxWidth: '400px', margin: '50px auto', textAlign: 'center' }}>
                <h2>Welcome, {user.name}</h2>
                <p>Select a secure channel:</p>
                
                {myTeams.length === 0 ? (
                    <div style={{color: 'red', border: '1px solid red', padding: '10px', borderRadius: '5px'}}>
                        <strong>No Access Found.</strong><br/>
                        Please ask the Admin to add you to a Team.
                    </div>
                ) : (
                    <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                        {myTeams.map(team => (
                            <button 
                                key={team.$id} 
                                onClick={() => setCurrentTeam(team)}
                                style={{
                                    padding: '15px', 
                                    background: '#f0f0f0', 
                                    border: '1px solid #ccc', 
                                    borderRadius: '8px', 
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    fontWeight: 'bold'
                                }}
                            >
                                🔒 {team.name}
                            </button>
                        ))}
                    </div>
                )}

                <button onClick={handleLogout} style={{marginTop: '30px', background: 'none', border: 'none', textDecoration: 'underline'}}>Logout</button>
            </div>
        );
    }

    // --- VIEW 4: CHAT ROOM ---
    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>{currentTeam.name}</h3>
                <button onClick={() => {setCurrentTeam(null); setMessages([]);}} style={{marginRight: '10px'}}>← Lobby</button>
            </div>
            
            <div ref={chatContainerRef} onScroll={handleScroll} style={{ border: '1px solid #ccc', height: '75vh', overflowY: 'scroll', marginBottom: '10px', padding: '10px', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#fff' }}>
                {messages.map((msg) => (
                    <div key={msg.$id} style={{ 
                        alignSelf: msg.senderId === user.$id ? 'flex-end' : 'flex-start',
                        background: msg.senderId === user.$id ? '#dcf8c6' : '#f0f0f0',
                        padding: '8px 12px', borderRadius: '10px', maxWidth: '75%', wordWrap: 'break-word'
                    }}>
                        <div style={{ fontWeight: 'bold', fontSize: '11px', color: '#555', marginBottom: '2px' }}>{msg.sender}</div>
                        {msg.fileId && <img src={getImageUrl(msg.fileId)} alt="attachment" style={{ maxWidth: '100%', borderRadius: '6px', marginTop: '5px' }} />}
                        {msg.body && <div style={{marginTop: '2px'}}>{msg.body}</div>}
                        
                        {(msg.senderId === user.$id || user.$id === ADMIN_USER_ID) && (
                            <div style={{textAlign: 'right', marginTop: '5px'}}>
                             <span onClick={() => deleteMessage(msg)} style={{ color: '#aaa', cursor: 'pointer', fontSize: '10px' }}>✖</span>
                        </div>
                        )}
                    </div>
                ))}
            </div>

            {showNewMsgAlert && <div onClick={scrollToBottom} style={{position: 'absolute', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: '#007bff', color: 'white', padding: '8px 15px', borderRadius: '20px', cursor: 'pointer', boxShadow: '0 2px 5px rgba(0,0,0,0.2)', fontSize: '14px', zIndex: 100}}>↓ New Message</div>}

            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '5px' }}>
                <input type="text" value={msgText} onChange={e => setMsgText(e.target.value)} placeholder={`Message ${currentTeam.name}...`} style={{flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc'}}/>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eee', padding: '0 10px', borderRadius: '5px', cursor: 'pointer' }}>
                    📎 <input ref={fileInputRef} type="file" accept="image/*" onChange={e => setImgFile(e.target.files[0])} style={{ display: 'none' }} />
                </label>
                <button type="submit" style={{ padding: '10px 20px', background: '#007bff', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}>Send</button>
            </form>
            {imgFile && <div style={{ fontSize: '12px', color: 'green', marginTop: '5px' }}>Image selected: {imgFile.name}</div>}            
        </div>
    );
}