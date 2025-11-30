import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { client, databases, storage, account, DATABASE_ID, COLLECTION_ID, BUCKET_ID } from './lib/appwrite';
import { ID, Query } from 'appwrite';

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [msgText, setMsgText] = useState('');
    const [imgFile, setImgFile] = useState(null);
    const [username, setUsername] = useState(localStorage.getItem('chat_username') || ''); // <--- CHECK STORAGE
    const [tempName, setTempName] = useState('');
    const [showNewMsgAlert, setShowNewMsgAlert] = useState(false);

    // Refs for scrolling logic
    const chatContainerRef = useRef(null);
    const isAtBottomRef = useRef(true); // Tracks if user was at bottom before update

    useEffect(() => {
        // 1. Ensure we have an anonymous session (needed to talk to DB)
        const initSession = async () => {
            try {
                await account.get();
            } catch {
                await account.createAnonymousSession();
            }
        };
        initSession();

        // 2. Load initial messages
        fetchMessages();

        // 3. Realtime Subscription (WebSocket)
        const unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
            (response) => {
                // When a new message arrives, add it to the list
                if (response.events.includes('databases.*.collections.*.documents.*.create')) {
                    setMessages(prev => [...prev, response.payload]);
                }
                // Handle Deletes (Optional bonus)
                if (response.events.includes('databases.*.collections.*.documents.*.delete')) {
                    setMessages(prev => prev.filter(msg => msg.$id !== response.payload.$id));
                }
            }
        );

        return () => unsubscribe();
    }, []);

    // 4. Smart Scroll Logic (Runs whenever messages change)
    useLayoutEffect(() => {
        if (messages.length === 0) return;

        const lastMsg = messages[messages.length - 1];
        const isMyMessage = lastMsg.sender === username;

        // If I sent it, OR I was already at the bottom -> Scroll to bottom
        if (isMyMessage || isAtBottomRef.current) {
            scrollToBottom();
            setShowNewMsgAlert(false);
        } else {
            // Otherwise, I am reading history -> Show alert button
            setShowNewMsgAlert(true);
        }
    }, [messages, username]);

    const fetchMessages = async () => {
        try {
            const response = await databases.listDocuments(
                DATABASE_ID,
                COLLECTION_ID,
                [Query.limit(100)] // You can add Query.orderDesc('$createdAt')
            );
            setMessages(response.documents);
            // Initial load should scroll to bottom
            setTimeout(scrollToBottom, 100);
        } catch (error) {
            console.error("Error fetching messages:", error);
        }
    };

    // Helper: Scroll to bottom
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };

    // Helper: Track if user scrolls up
    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        
        // Define "at bottom" as being within 50px of the end
        const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
        isAtBottomRef.current = isNearBottom;

        if (isNearBottom) {
            setShowNewMsgAlert(false);
        }
    };

    const handleLogin = (e) => {
        e.preventDefault();
        if (!tempName.trim()) return;
        localStorage.setItem('chat_username', tempName); // <--- SAVE TO BROWSER
        setUsername(tempName);
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!msgText && !imgFile) return;

        let fileId = null;
        if (imgFile) {
            const upload = await storage.createFile(BUCKET_ID, ID.unique(), imgFile);
            fileId = upload.$id;
        }

        // Send Message with USERNAME instead of ID
        await databases.createDocument(
            DATABASE_ID,
            COLLECTION_ID,
            ID.unique(),
            {
                body: msgText,
                sender: username,
                fileId: fileId
            }
        );

        setMsgText('');
        setImgFile(null);
    };

    const deleteMessage = async (msg) => {
        if(confirm("Delete this?")) {
            try {
                // 1. If there is an image, delete it from Storage first
                if (msg.fileId) {
                    await storage.deleteFile(BUCKET_ID, msg.fileId);
                }
                // 2. Delete the message document from Database
                await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, msg.$id);
            } catch (err) {
                 console.error(err);
                alert("Cannot delete: Check permissions in Appwrite Console");
            }
        }
    }

    const getImageUrl = (fileId) => storage.getFileView(BUCKET_ID, fileId); 
        // return storage.getFilePreview(BUCKET_ID, fileId); 
        // {"message":"Image transformations are blocked on your current plan. Please upgrade to a higher plan. ","code":403,"type":"storage_image_transformations_blocked","version":"1.8.0"}


    // --- SCREEN 1: LOGIN (If no name found) ---
    if (!username) {
        return (
            <div style={{ padding: '20px', textAlign: 'center', marginTop: '50px' }}>
                <h2>Who goes there?</h2>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px', margin: '0 auto' }}>
                    <input 
                        type="text" 
                        placeholder="Enter your codename" 
                        value={tempName}
                        onChange={e => setTempName(e.target.value)}
                        style={{ padding: '10px', fontSize: '16px' }}
                    />
                    <button type="submit" style={{ padding: '10px', cursor: 'pointer' }}>Enter Chat</button>
                </form>
            </div>
        );
    }

    // --- SCREEN 2: CHAT (If name exists) ---
    return (
        <div style={{ 
            padding: '20px',
            maxWidth: '600px',
            margin: '0 auto',
            fontFamily: 'sans-serif',
            position: 'relative'
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <h2>Event Horizon</h2>
                <button onClick={() => {localStorage.removeItem('chat_username'); setUsername('');}} style={{ fontSize: '12px' }}>
                    Logout ({username})
                </button>
            </div>
            
            {/* CHAT CONTAINER */}
            <div
                ref={chatContainerRef}
                onScroll={handleScroll}
                style={{ 
                    border: '1px solid #ccc', 
                    height: '80vh', 
                    overflowY: 'scroll', 
                    marginBottom: '10px', 
                    padding: '10px',
                    borderRadius: '8px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    background: '#fff'
                }}
            >
                {messages.map((msg) => (
                    <div key={msg.$id} style={{ 
                        alignSelf: msg.sender === username ? 'flex-end' : 'flex-start',
                        background: msg.sender === username ? '#dcf8c6' : '#f0f0f0',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        maxWidth: '75%',
                        wordWrap: 'break-word'
                    }}>
                        <div style={{
                            fontWeight: 'bold',
                            fontSize: '11px',
                            color: '#555',
                            marginBottom: '2px'
                        }}>
                            {msg.sender}
                        </div>
                        
                        {msg.fileId && (
                            <img 
                                src={getImageUrl(msg.fileId)} 
                                alt="attachment" 
                                style={{
                                    maxWidth: '100%',
                                    borderRadius: '6px',
                                    // maxHeight: '200px',
                                    marginTop: '5px'
                                }} 
                            />
                        )}
                        
                        {msg.body && <div style={{ marginTop: '2px' }}>{msg.body}</div>}
                        
                        <div style={{ textAlign: 'right', marginTop: '5px' }}>

                             <span onClick={() => deleteMessage(msg)} style={{ color: '#aaa', cursor: 'pointer', fontSize: '10px' }}>✖</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* FLOATING "NEW MESSAGE" BUTTON */}
            {showNewMsgAlert && (
                <div 
                    onClick={scrollToBottom}
                    style={{
                        position: 'absolute',
                        bottom: '80px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: '#007bff',
                        color: 'white',
                        padding: '8px 15px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
                        fontSize: '14px',
                        zIndex: 100
                    }}
                >
                    ↓ New Message
                </div>
            )}

            {/* INPUT AREA */}
            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '5px' }}>
                <input 
                    type="text" 
                    value={msgText} 
                    onChange={e => setMsgText(e.target.value)} 
                    placeholder="Type a message..." 
                    style={{
                        flex: 1,
                        padding: '10px',
                        borderRadius: '5px',
                        border: '1px solid #ccc'
                    }}
                />
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#eee', padding: '0 10px', borderRadius: '5px', cursor: 'pointer' }}>
                    📎
                    <input 
                        type="file" 
                        accept="image/*"
                        onChange={e => setImgFile(e.target.files[0])}
                        style={{ display: 'none' }}
                    />
                </label>
                <button
                    type="submit"
                    style={{
                        padding: '10px 20px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '5px',
                        cursor: 'pointer'
                    }}
                >Send</button>
            </form>

            {imgFile && <div style={{ fontSize: '12px', color: 'green', marginTop: '5px' }}>Image selected: {imgFile.name}</div>}            
        </div>
    );
}