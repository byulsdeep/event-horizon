import { useEffect, useState } from 'react';
import { client, databases, storage, account, DATABASE_ID, COLLECTION_ID, BUCKET_ID } from './lib/appwrite';
import { ID, Query } from 'appwrite';

export default function Chat() {
    const [messages, setMessages] = useState([]);
    const [msgText, setMsgText] = useState('');
    const [imgFile, setImgFile] = useState(null);
    const [user, setUser] = useState(null);

    useEffect(() => {
        // 1. Login Anonymously
        const init = async () => {
            try {
                let current = await account.get();
                setUser(current);
            } catch {
                const session = await account.createAnonymousSession();
                setUser(session);
            }
            fetchMessages();
        };
        init();

        // 2. Realtime Subscription (WebSocket)
        const unsubscribe = client.subscribe(
            `databases.${DATABASE_ID}.collections.${COLLECTION_ID}.documents`,
            (response) => {
                // When a new message arrives, add it to the list
                if (response.events.includes('databases.*.collections.*.documents.*.create')) {
                    setMessages(prev => [...prev, response.payload]);
                }
            }
        );

        return () => unsubscribe();
    }, []);

    const fetchMessages = async () => {
        const response = await databases.listDocuments(
            DATABASE_ID,
            COLLECTION_ID,
            [Query.limit(50)] // You can add Query.orderDesc('$createdAt')
        );
        setMessages(response.documents);
    };

    const sendMessage = async (e) => {
        e.preventDefault();
        if (!msgText && !imgFile) return;

        let fileId = null;
        if (imgFile) {
            const upload = await storage.createFile(BUCKET_ID, ID.unique(), imgFile);
            fileId = upload.$id;
        }

        await databases.createDocument(DATABASE_ID, COLLECTION_ID, ID.unique(), {
            body: msgText,
            sender: user ? user.$id : 'Anon',
            fileId: fileId
        });

        setMsgText('');
        setImgFile(null);
    };

    const getImageUrl = (fileId) => {
        // return storage.getFilePreview(BUCKET_ID, fileId); 
        // {"message":"Image transformations are blocked on your current plan. Please upgrade to a higher plan. ","code":403,"type":"storage_image_transformations_blocked","version":"1.8.0"}
        return storage.getFileView(BUCKET_ID, fileId); 
    };

    return (
        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto' }}>
            <h2>Event Horizon Chat</h2>
            
            <div style={{ border: '1px solid #ccc', height: '400px', overflowY: 'scroll', marginBottom: '10px', padding: '10px' }}>
                {messages.map((msg) => (
                    <div key={msg.$id} style={{ marginBottom: '10px', padding: '5px', background: '#f0f0f0', borderRadius: '5px' }}>
                        <small style={{color: '#888'}}>{msg.sender.substring(0,5)}...</small><br/>
                        {msg.body && <span>{msg.body}</span>}
                        {msg.fileId && (
                            <div>
                                <img src={getImageUrl(msg.fileId)} alt="attachment" style={{ maxWidth: '200px', borderRadius: '8px' }} />
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <form onSubmit={sendMessage} style={{ display: 'flex', gap: '5px' }}>
                <input 
                    type="text" 
                    value={msgText} 
                    onChange={e => setMsgText(e.target.value)} 
                    placeholder="Type a message..." 
                    style={{ flex: 1 }}
                />
                <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => setImgFile(e.target.files[0])}
                />
                <button type="submit">Send</button>
            </form>
        </div>
    );
}