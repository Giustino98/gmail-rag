# Gmail RAG Assistant - Chrome Extension

A Chrome extension that enables RAG (Retrieval-Augmented Generation) on Gmail using Google's Gemini AI.

## Features

- **Gmail Integration**: OAuth authentication with Gmail API
- **Smart Search**: Search and filter emails by folders/labels (Inbox, Sent, Drafts, All Mail)
- **AI Analysis**: Uses Gemini 2.5 Flash Lite for intelligent email content analysis
- **Natural Language Queries**: Ask questions about your emails in plain language
- **Privacy-Focused**: All processing happens client-side, your emails stay private

## Setup Instructions

### 1. Prerequisites

You'll need:
- Google Cloud Project with Gmail API enabled
- Gemini API key from Google AI Studio

### 2. Google Cloud Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the Gmail API:
   - Go to "APIs & Services" > "Library"
   - Search for "Gmail API" and enable it
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Application type: "Chrome Extension"
   - Copy the Client ID (you'll need this)

### 3. Gemini API Setup

1. Go to [Google AI Studio](https://aistudio.google.com)
2. Create a new API key
3. Copy the API key (you'll need this)

### 4. Install the Extension

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select this directory
4. The extension should now appear in your extensions list

### 5. Configure the Extension

1. Click the extension icon in your Chrome toolbar
2. In the "Configuration" section:
   - Enter your Gemini API Key
   - Enter your Google OAuth Client ID
   - Click "Save Configuration"
3. Click "Connect to Gmail" to authenticate
4. Grant the necessary permissions when prompted

### 6. Usage

1. Select which Gmail folders/labels to search (Inbox, Sent, Drafts, All Mail)
2. Enter your question in natural language (e.g., "What meetings do I have this week?")
3. Click "Search & Analyze"
4. The extension will:
   - Search your Gmail for relevant emails
   - Retrieve content from the first 10 matching emails
   - Send the content to Gemini AI for analysis
   - Display the AI-generated response

## Example Queries

- "What are my recent project updates?"
- "Show me emails about vacation requests"
- "What meetings do I have scheduled?"
- "Find emails from John about the budget"
- "What are the latest invoices I received?"

## Privacy & Security

- Your Gmail access token is stored locally in Chrome storage
- Email content is sent only to Google's Gemini API (same company as Gmail)
- No data is stored on external servers
- You can revoke access anytime through your Google Account settings

## File Structure

```
chrome-extension-rag/
├── manifest.json          # Extension manifest (points to dist/)
├── src/                   # Source files
│   ├── popup.html         # Main UI
│   ├── popup.css          # Popup styles
│   ├── popup.js           # UI logic
│   ├── background.js      # Gmail & Gemini API integration
│   ├── ui.js              # UI components and handlers
│   └── pico.min.css       # CSS framework
├── dist/                  # Built files (generated)
├── icons/                 # Extension icons
├── logo.png              # Extension logo
├── package.json          # NPM dependencies and scripts
└── README.md             # This file
```

## Troubleshooting

### Authentication Issues
- Make sure your Google Cloud project has Gmail API enabled
- Check that your OAuth Client ID is correctly configured for Chrome Extensions
- Try clearing extension storage: `chrome://extensions/` > Extension details > "Clear storage"

### API Issues
- Verify your Gemini API key is valid and has quota available
- Check browser console for detailed error messages
- Ensure you have internet connection for API calls

### Permission Issues
- Make sure you granted Gmail read permissions during setup
- Check Chrome's site settings for the extension

## Development

### Build Commands

```bash
# Install dependencies
npm install

# Build for development (one-time)
npm run build

# Build in watch mode (rebuilds on file changes)
npm run dev

# Create production zip for Chrome Web Store
npm run package
```

### Development Workflow

1. Make changes to files in `src/` directory
2. Run `npm run build` or `npm run dev` (for auto-rebuild)
3. Go to `chrome://extensions/` and click refresh on the extension
4. Test your changes
5. When ready for production, run `npm run package` to create `extension.zip`

### File Organization

- **Source files**: Edit files in `src/` directory
- **Built files**: Generated automatically in `dist/` directory
- **Extension loading**: Chrome loads from root directory (uses `dist/` via manifest.json)

## License

This project is provided as-is for educational and development purposes.