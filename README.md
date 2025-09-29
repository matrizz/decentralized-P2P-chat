# SecureChat P2P - Decentralized Chat Application

A fully decentralized, peer-to-peer chat application with end-to-end encryption, built with Next.js, libp2p, and TweetNaCl.

## Features

- 🔐 **End-to-End Encryption**: All messages are encrypted using TweetNaCl (NaCl cryptography)
- 🌐 **Decentralized P2P**: Built on libp2p for true peer-to-peer communication
- 💾 **Local Storage**: All data stored locally using IndexedDB (via localforage)
- 👥 **Contact Management**: Add, verify, block, and manage contacts
- 🔒 **Zero-Knowledge**: No central server stores your messages or keys
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Technology Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS v4, Radix UI components
- **Cryptography**: TweetNaCl for encryption/decryption
- **P2P Network**: libp2p with WebRTC transport
- **Storage**: localforage (IndexedDB wrapper)

## Getting Started

### Installation

\`\`\`bash
npm install
\`\`\`

### Development

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

\`\`\`bash
npm run build
npm start
\`\`\`

## How It Works

### Architecture

1. **Cryptography Layer** (`lib/crypto.ts`)
   - Uses TweetNaCl for public-key cryptography (X25519)
   - Generates key pairs for each user
   - Encrypts/decrypts direct messages using box encryption
   - Encrypts/decrypts group messages using secretbox encryption

2. **P2P Network Layer** (`lib/p2p-network.ts`)
   - Built on libp2p with WebRTC transport
   - Uses GossipSub for pub/sub messaging
   - Connects to bootstrap nodes for peer discovery
   - Handles message routing and delivery

3. **Storage Layer** (`lib/storage.ts`)
   - Uses IndexedDB via localforage
   - Stores user data, contacts, groups, and messages locally
   - No data leaves your device except encrypted messages

4. **Message Manager** (`lib/message-manager.ts`)
   - Coordinates between crypto, network, and storage layers
   - Handles message encryption/decryption
   - Manages message delivery and receipt

### Security Features

- **Public Key Infrastructure**: Each user has a unique key pair
- **Perfect Forward Secrecy**: Messages use ephemeral keys
- **Contact Verification**: Verify contacts using fingerprints
- **Block List**: Block unwanted contacts
- **Local-Only Storage**: Keys and messages never leave your device

### Contact Management

1. **Adding Contacts**
   - Share your Public ID with others
   - Add contacts using their Public ID and Public Key
   - Verify contacts using fingerprint comparison

2. **Verifying Contacts**
   - Compare fingerprints out-of-band (phone, in-person, etc.)
   - Mark contacts as verified for added security

3. **Blocking Contacts**
   - Block unwanted contacts
   - Blocked contacts cannot send you messages

## Usage

### Creating an Account

1. Enter a username on the welcome screen
2. Your key pair is automatically generated
3. Your Public ID is created from your public key

### Adding a Contact

1. Click "Manage" in the Contacts section
2. Click "Add Contact"
3. Enter their username, Public ID, and Public Key
4. Optionally verify their fingerprint

### Sending Messages

1. Click on a contact in the sidebar
2. Type your message in the input field
3. Press Enter or click Send
4. Messages are automatically encrypted before sending

### Sharing Your ID

1. Go to Settings
2. Copy your Public ID
3. Share it with others (along with your Public Key)

## Network Configuration

The app uses public bootstrap nodes for peer discovery. You can configure custom bootstrap nodes in `lib/p2p-network.ts`:

\`\`\`typescript
const bootstrapNodes = [
  '/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN',
  // Add your custom bootstrap nodes here
]
\`\`\`

## Privacy & Security

- **No Central Server**: All communication is peer-to-peer
- **End-to-End Encryption**: Only you and your contacts can read messages
- **Local Storage**: All data stored locally on your device
- **No Tracking**: No analytics, no tracking, no data collection
- **Open Source**: Fully transparent and auditable code

## Limitations

- **Bootstrap Dependency**: Requires bootstrap nodes for initial peer discovery
- **NAT Traversal**: May have issues behind strict NATs/firewalls
- **Browser-Only**: Currently only works in web browsers
- **No Message History Sync**: Messages only stored locally

## Future Enhancements

- [ ] Group chat support
- [ ] File sharing
- [ ] Voice/video calls
- [ ] Mobile apps (React Native)
- [ ] Desktop apps (Electron)
- [ ] DHT-based peer discovery
- [ ] Message history sync across devices

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - feel free to use this code for your own projects.

## Disclaimer

This is an experimental project. While it uses industry-standard cryptography (TweetNaCl), it has not been audited by security professionals. Use at your own risk for sensitive communications.
