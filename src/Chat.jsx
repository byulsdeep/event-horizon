import { useEffect, useState } from 'react';
import { client, databases, storage, account, DATABASE_ID, COLLECTION_ID, BUCKET_ID } from './lib/appwrite';
import { ID, Query } from 'appwrite';

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [msgText, setMsgText] = useState('');
    const [imgFile, setImgFile] = useState(null);
    const [username, setUsername] = useState(localStorage.getItem('chat_username') || ''); // <--- CHECK STORAGE
    const [tempName, setTempName] = useState('');

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

    const fetchMessages = async () => {
        try {
            const response = await databases.listDocuments(
                DATABASE_ID,
                COLLECTION_ID,
                [Query.limit(100)] // You can add Query.orderDesc('$createdAt')
            );
            setMessages(response.documents);
        } catch (error) {
            console.error("Error fetching messages:", error);
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

    const deleteMessage = async (id) => {
        if(confirm("Delete this?")) {
            await databases.deleteDocument(DATABASE_ID, COLLECTION_ID, id);
        }
    }

    const getImageUrl = (fileId) => {
        // return storage.getFilePreview(BUCKET_ID, fileId); 
        // {"message":"Image transformations are blocked on your current plan. Please upgrade to a higher plan. ","code":403,"type":"storage_image_transformations_blocked","version":"1.8.0"}
        return storage.getFileView(BUCKET_ID, fileId); 
    };

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
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', fontFamily: 'sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2>Event Horizon</h2>
                <button onClick={() => {localStorage.removeItem('chat_username'); setUsername('');}} style={{fontSize: '12px'}}>
                    Logout ({username})
                </button>
            </div>
            
            <div style={{ 
                border: '1px solid #ccc', 
                height: '60vh', 
                overflowY: 'scroll', 
                marginBottom: '10px', 
                padding: '10px',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px'
            }}>
                {messages.map((msg) => (
                    <div key={msg.$id} style={{ 
                        alignSelf: msg.sender === username ? 'flex-end' : 'flex-start',
                        background: msg.sender === username ? '#dcf8c6' : '#f0f0f0',
                        padding: '8px 12px',
                        borderRadius: '10px',
                        maxWidth: '70%'
                    }}>
                        <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#555', marginBottom: '2px' }}>
                            {msg.sender}
                        </div>
                        
                        {msg.fileId && (
                            <div style={{ marginBottom: '5px' }}>
                                <img 
                                    src={getImageUrl(msg.fileId)} 
                                    alt="attachment" 
                                    style={{ maxWidth: '100%', borderRadius: '8px', maxHeight: '200px' }} 
                                />
                            </div>
                        )}
                        
                        {msg.body && <div>{msg.body}</div>}
                        
                        <div style={{textAlign: 'right', marginTop: '5px'}}>
                             <small onClick={() => deleteMessage(msg.$id)} style={{ color: '#aaa', cursor: 'pointer', fontSize: '10px' }}>✖</small>
                        </div>
                    </div>
                ))}
            </div>

            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '5px' }}>
                <input 
                    type="text" 
                    value={msgText} 
                    onChange={e => setMsgText(e.target.value)} 
                    placeholder="Type a message..." 
                    style={{ flex: 1, padding: '10px', borderRadius: '5px', border: '1px solid #ccc' }}
                />
                <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setImgFile(e.target.files[0])}
                    style={{ maxWidth: '100px' }}
                />
                <button type="submit" style={{ padding: '10px 20px' }}>Send</button>
            </form>
        </div>
    );
}