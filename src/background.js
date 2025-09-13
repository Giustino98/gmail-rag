import { GoogleGenAI } from "@google/genai";

class GmailRAGBackground {
    constructor() {
        this.accessToken = null;
        this.ai = null;
        this.setupMessageHandlers();
    }

    setupMessageHandlers() {
        chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
            this.handleMessage(request, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });
    }

    async handleMessage(request, sender, sendResponse) {
        try {
            switch (request.action) {
                case 'checkAuthStatus':
                    const isAuthenticated = await this.checkAuthStatus();
                    sendResponse({ isAuthenticated });
                    break;

                case 'authenticate':
                    const authResult = await this.authenticate();
                    sendResponse(authResult);
                    break;

                case 'performRAG':
                    const ragResult = await this.performRAG(request.query, request.labels, request.geminiApiKey, request.geminiModel, request.aiAssistedFolders);
                    sendResponse(ragResult);
                    break;

                case 'listAllGmailLabels':
                    const labels = await this.listAllGmailLabels();
                    sendResponse({ success: true, labels });
                    break;

                case 'logout':
                    const logoutResult = await this.logout();
                    sendResponse(logoutResult);
                    break;

                case 'getUserInfo':
                    const userInfo = await this.getUserInfo();
                    sendResponse(userInfo);
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown action' });
            }
        } catch (error) {
            sendResponse({ success: false, error: error.message });
        }
    }

    async checkAuthStatus() {
        try {
            const token = await this.getStoredToken();
            if (!token) return false;

            // Verify token is still valid
            const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.accessToken = token;
                return true;
            } else {
                // Token is invalid, remove it
                await chrome.storage.local.remove(['accessToken']);
                return false;
            }
        } catch (error) {
            return false;
        }
    }

    async authenticate() {
        try {
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({
                    'interactive': true
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            // Store the token
            await chrome.storage.local.set({ accessToken: token });
            this.accessToken = token;

            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getStoredToken() {
        const result = await chrome.storage.local.get(['accessToken']);
        return result.accessToken;
    }

    async refreshTokenIfNeeded() {
        try {
            // Try to get a fresh token silently
            const token = await new Promise((resolve, reject) => {
                chrome.identity.getAuthToken({
                    'interactive': false
                }, (token) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(token);
                    }
                });
            });

            // Store the new token
            await chrome.storage.local.set({ accessToken: token });
            this.accessToken = token;
            return token;
        } catch (error) {
            throw error;
        }
    }

    async apiCallWithRetry(url, options = {}) {
        let attempt = 0;
        const maxAttempts = 2;
        
        while (attempt < maxAttempts) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Authorization': `Bearer ${this.accessToken}`,
                        ...options.headers
                    }
                });

                if (response.status === 401 && attempt === 0) {
                    // Token expired, try to refresh it
                    await this.refreshTokenIfNeeded();
                    attempt++;
                    continue;
                }

                return response;
            } catch (error) {
                if (attempt === maxAttempts - 1) {
                    throw error;
                }
                attempt++;
            }
        }
    }

    async logout() {
        try {
            // Revoke the token if we have one
            if (this.accessToken) {
                try {
                    await fetch(`https://oauth2.googleapis.com/revoke?token=${this.accessToken}`, {
                        method: 'POST'
                    });
                } catch (revokeError) {
                    // Could not revoke token
                }
            }

            // Clear stored token and chrome identity cache
            await chrome.storage.local.remove(['accessToken']);
            
            // Clear Chrome's auth token cache
            try {
                await new Promise((resolve) => {
                    chrome.identity.clearAllCachedAuthTokens(resolve);
                });
            } catch (clearError) {
                // Could not clear cached tokens
            }

            this.accessToken = null;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async getUserInfo() {
        try {
            if (!this.accessToken) {
                return { success: false, error: 'Not authenticated' };
            }

            // Get Gmail profile info
            const gmailResponse = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
                headers: {
                    'Authorization': `Bearer ${this.accessToken}`
                }
            });

            if (!gmailResponse.ok) {
                throw new Error(`Gmail API error: ${gmailResponse.status}`);
            }

            const gmailData = await gmailResponse.json();
            
            // Get Google profile info for picture
            let profilePicture = null;
            
            // Try multiple approaches to get profile picture
            const apiEndpoints = [
                'https://www.googleapis.com/oauth2/v2/userinfo',
                'https://people.googleapis.com/v1/people/me?personFields=photos'
            ];
            
            for (const endpoint of apiEndpoints) {
                try {
                    const response = await fetch(endpoint, {
                        headers: {
                            'Authorization': `Bearer ${this.accessToken}`
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        
                        if (endpoint.includes('userinfo')) {
                            profilePicture = data.picture;
                        } else if (endpoint.includes('people')) {
                            profilePicture = data.photos?.[0]?.url;
                        }
                        
                        if (profilePicture) {
                            break;
                        }
                    }
                } catch (error) {
                    // Error with endpoint
                }
            }
            
            // Fallback: generate Gravatar URL from email
            if (!profilePicture && gmailData.emailAddress) {
                try {
                    const hash = await this.md5(gmailData.emailAddress.toLowerCase().trim());
                    profilePicture = `https://www.gravatar.com/avatar/${hash}?s=80&d=identicon`;
                } catch (gravatarError) {
                    // Could not generate Gravatar
                }
            }

            return { 
                success: true, 
                userInfo: {
                    emailAddress: gmailData.emailAddress,
                    messagesTotal: gmailData.messagesTotal,
                    threadsTotal: gmailData.threadsTotal,
                    profilePicture: profilePicture
                }
            };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    async md5(text) {
        // Simple hash function for Gravatar (since WebCrypto MD5 is not widely supported)
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(16);
    }

    cleanQueryResponse(response) {
        return response
            .trim()
            // Remove all possible XML tags that might leak through
            .replace(/<\/correct_query>/g, '')
            .replace(/<correct_query>/g, '')
            .replace(/<\/output>/g, '')
            .replace(/<output>/g, '')
            .replace(/<\/user_query>/g, '')
            .replace(/<user_query>/g, '')
            // Remove any other XML-like tags
            .replace(/<[^>]*>/g, '')
            // Remove any trailing/leading whitespace again
            .trim();
    }

async rewriteQueryWithGemini(userQuery, labels, apiKey, model, aiAssistedFolders = false) {
    const today = new Date().toISOString().slice(0, 10);

    if (aiAssistedFolders) {
        // --- PROMPT 1 - UPDATED ARMORED VERSION ---
        const prompt = `
<prompt>
    <role>
        You are an expert assistant specializing in converting natural language into the most precise and effective Gmail search queries possible. Your goal is to leverage Gmail's advanced operators first, and use keyword expansion only as a secondary tactic.
    </role>

    <instructions>
        <rule id="1" importance="critical">
            **Prioritize Operators Over Keywords:** Your primary strategy is to use Gmail's specific, indexed operators (\`from:\`, \`to:\`, \`subject:\`, \`category:\`, \`larger:\`, \`has:\`). They are faster and more accurate than general keyword searches.
        </rule>
        <rule id="2" importance="critical">
            **Robust Entity Matching:** To reliably find a sender/recipient, search both their email address and display name.
            - **The Formula:** \`(operator:entity OR entity*)\`
            - **Example for "from Fineco":** Generate \`(from:fineco OR Fineco*)\`.
        </rule>
        <rule id="3">
            **Leverage Gmail Categories:** If the user's intent matches a Gmail category, use it. This is highly accurate.
            - "Offers", "deals", "promotions" -> \`category:promotions\`
            - "Order confirmations", "receipts", "notifications" -> \`category:updates\`
            - "Social media notifications" -> \`category:social\`
            - "Forum discussions", "mailing lists" -> \`category:forums\`
        </rule>
        <rule id="4">
            **Intelligent Keyword Expansion (Use Sparingly):** If, and only if, no specific operator applies, you can expand on core keywords with 1-2 essential synonyms. Do not over-expand.
        </rule>
        <rule id="5">
            **Distinguish "Latest" from "Recent":**
            - If the user asks for the **"latest"** or **"last"** email (e.g., "l'ultima comunicazione"), **DO NOT add a date filter**. The goal is to find the absolute most recent one, regardless of how old it is. The API's default sorting will handle this.
            - If the user asks for emails from a **"recent"** period (e.g., "last week", "in the last few days", "recentemente"), then use the \`newer_than:\` operator.
        </rule>
        <rule id="6">
            **Generic Placeholders:** If a sender is generic ("my boss"), treat it as a simple keyword.
        </rule>
    </instructions>

    <output_format>
        Return ONLY the final, raw Gmail search string. Do not include any XML tags, formatting, or explanations.
    </output_format>

    <examples>
        <example>
            Input: "When did I receive the last communication from Fineco?"
            Output: in:inbox (from:fineco OR Fineco*)
        </example>
        <example>
            Input: "when did I buy dog food on Amazon?"
            Output: in:inbox (from:amazon OR Amazon*) category:updates ("dog food" OR "cibo per cani")
        </example>
        <example>
            Input: "find all offers I received last month"
            Output: in:inbox category:promotions newer_than:30d
        </example>
        <example>
            Input: "Amazon order confirmations for electronics"
            Output: in:inbox (from:amazon OR Amazon*) category:updates (electronics OR elettronica)
        </example>
        <example>
            Input: "search for recent emails with large attachments from my lawyer"
            Output: (in:inbox OR in:sent) lawyer larger:10M newer_than:15d
        </example>
    </examples>

    <context>
        <current_date>${today}</current_date>
        <user_request>${userQuery}</user_request>
    </context>

    <task>
        Based on the <user_request>, generate the complete Gmail query. Strictly follow all <instructions>, prioritizing operators. Use the <examples> as a guide. Provide only the raw query string. **Do not reproduce any tags from the prompt structure.**
    </task>
</prompt>`;

        const fullQuery = await this.queryGemini(prompt, apiKey, model, false);
        return this.cleanQueryResponse(fullQuery);

    } else {
        // --- PROMPT 2 - UPDATED ARMORED VERSION ---
        // Separate main folders from custom labels/subfolders
        const mainFolders = labels.filter(label => ['INBOX', 'SENT', 'DRAFT', 'ALL'].includes(label));
        const customLabels = labels.filter(label => !['INBOX', 'SENT', 'DRAFT', 'ALL'].includes(label));
        
        let labelQuery = '';
        
        // Priority logic: If custom labels exist, ignore main folders (except ALL)
        if (customLabels.length > 0) {
            // Use only custom labels - ignore INBOX/SENT/DRAFT selections
            labelQuery = customLabels.map(label => `label:${label}`).join(' OR ');
        } else {
            // No custom labels selected, use main folders
            labelQuery = mainFolders.map(label => {
                if (label === 'ALL') return '';
                const gmailLabel = label === 'DRAFT' ? 'draft' : label.toLowerCase();
                return `in:${gmailLabel}`;
            }).filter(Boolean).join(' OR ');
        }

        const prompt = `
<prompt>
    <role>
        You are an expert assistant for converting natural language into precise Gmail search query FRAGMENTS.
    </role>

    <instructions>
        <rule id="1" importance="critical">
            **Exclude Folder Operators:** DO NOT include \`in:inbox\`, \`in:sent\`, or \`label:\`.
        </rule>
        <rule id="2" importance="critical">
            **Prioritize Operators Over Keywords:** Your primary strategy is to use Gmail's specific, indexed operators (\`from:\`, \`to:\`, \`subject:\`, \`category:\`, \`larger:\`, \`has:\`).
        </rule>
        <rule id="3" importance="critical">
            **Robust Entity Matching:** Use the formula \`(operator:entity OR entity*)\`. For "from Fineco", generate \`(from:fineco OR Fineco*)\`.
        </rule>
        <rule id="4">
            **Distinguish "Latest" from "Recent":**
            - For the **"latest"** or **"last"** email, **DO NOT add a date filter**.
            - For a **"recent"** period ("last week", "recentemente"), use the \`newer_than:\` operator.
        </rule>
        <rule id="5">
            **Leverage Gmail Categories:** If intent matches a Gmail category, use \`category:\`. Valid categories: \`promotions\`, \`updates\`, \`social\`, \`forums\`, \`primary\`.
        </rule>
    </instructions>

    <output_format>
        Return ONLY the final, raw Gmail search query FRAGMENT. Do not include any XML tags or explanations.
    </output_format>

    <examples>
        <example>
            Input: "last communication from Fineco"
            Output: (from:fineco OR Fineco*)
        </example>
        <example>
            Input: "dog food purchase on Amazon"
            Output: (from:amazon OR Amazon*) category:updates ("dog food" OR "cibo per cani")
        </example>
        <example>
            Input: "recent offers I received"
            Output: category:promotions newer_than:15d
        </example>
    </examples>

    <context>
        <current_date>${today}</current_date>
        <user_request>${userQuery}</user_request>
    </context>

    <task>
        Based on the <user_request>, generate a Gmail query FRAGMENT. Strictly follow all <instructions>, prioritizing operators. Provide only the raw query fragment. **Do not reproduce any tags from the prompt structure.**
    </task>
</prompt>`;

        const userQueryPart = await this.queryGemini(prompt, apiKey, model, false);
        const cleanedPart = this.cleanQueryResponse(userQueryPart);

        if (!labelQuery && !cleanedPart) return '';
        if (!labelQuery) return cleanedPart;
        if (!cleanedPart) return `(${labelQuery})`;

        return `(${labelQuery}) (${cleanedPart})`;
    }
}

    extractFoldersFromQuery(query) {
        const folders = [];
        const queryLower = query.toLowerCase();
        
        // Extract folders from query using regex patterns
        // Check for inbox
        if (queryLower.includes('in:inbox')) {
            folders.push('INBOX');
        }
        
        // Check for sent
        if (queryLower.includes('in:sent')) {
            folders.push('SENT');
        }
        
        // Check for drafts
        if (queryLower.includes('in:draft')) {
            folders.push('DRAFT');
        }
        
        // Extract custom labels
        const labelMatches = query.match(/label:([a-zA-Z0-9_-]+)/g);
        if (labelMatches) {
            labelMatches.forEach(match => {
                const label = match.replace('label:', '');
                if (!folders.includes(label)) {
                    folders.push(label);
                }
            });
        }
        
        // If no specific folders found but query contains broader searches, 
        // assume it searched across all mail
        if (folders.length === 0 && (queryLower.includes('or') || !queryLower.includes('in:'))) {
            return ['All Gmail'];
        }
        
        return folders.length > 0 ? folders : ['Gmail'];
    }

      createFinalRagPrompt(userQuery, emailContents, labels) {
    const emailsText = emailContents.map((email, index) =>
        `<email id="${email.id}">
    <index>${index + 1}</index>
    <subject>${email.subject}</subject>
    <from>${email.from}</from>
    <date>${email.date}</date>
    <body>
        <![CDATA[${email.body}]]>
    </body>
</email>`
    ).join('\n\n');

    const sourceEmailsForPrompt = emailContents.map(email => ({
        subject: email.subject,
        link: `https://mail.google.com/mail/u/0/#all/${email.id}`
    }));

    // --- PROMPT RAG ADATTIVO E PERTINENTE ---
    return `<prompt>
    <role>
        You are an expert Personal Assistant specializing in email inbox analysis. Your goal is to provide answers that are not only accurate but also directly pertinent to the user's specific intent. The response must be in Italian.
    </role>

    <instructions>
        <rule id="1" importance="critical">
            **Adaptive Response Based on Query Scope:** Before answering, determine if the user's query is SPECIFIC or BROAD.
            - A **SPECIFIC** query asks for a single item (e.g., "the *last* email", "the email from yesterday", "the attachment from Mario").
            - A **BROAD** query asks for a general overview (e.g., "what's new from my bank?", "summarize recent emails about Project X").
        </rule>
        <rule id="2" importance="high">
            **Tailor the Answer's Depth:**
            - For a **SPECIFIC** query: Provide a detailed, rich answer for the **single most relevant email**. You can then add *one brief sentence* to mention the existence of other related emails (e.g., "Inoltre, ci sono altre 3 email recenti su questo argomento."). Do NOT summarize them all.
            - For a **BROAD** query: Provide concise summaries for the **2-3 most important and recent emails**. Do not list all of them.
        </rule>
        <rule id="3" importance="high">
            **Absolute Fidelity to Context:** Your answers must be based *exclusively* on the information contained in the <email_data> tag.
        </rule>
        <rule id="4" importance="medium">
            **Handling Uncertainty:** If the emails do not contain the necessary information, state it clearly (e.g., "Le email fornite non contengono questa informazione.").
        </rule>
        <rule id="5" importance="high">
            **Answer Formatting:** Use Markdown within the "answer" field for readability (bold, bullet points, etc.).
        </rule>
        <rule id="6" importance="critical">
            **Strict JSON Output:** Your final output must be *exclusively a single, valid JSON object*. Your entire response must start with \`{\` and end with \`}\`.
        </rule>
    </instructions>

    <output_format>
        <description>
            You must generate a JSON object with the following exact structure.
        </description>
        <json_structure>
            \`\`\`json
            {
              "answer": "...",
              "source_folders": [],
              "source_emails": []
            }
            \`\`\`
        </json_structure>
        <field_details>
            - \`answer\`: (String) The complete and pertinent answer in Italian, formatted in Markdown, and addressed to the user ("tu").
            - \`source_folders\`: (Array of Strings) Populate this with the list from <analyzed_folders>.
            - \`source_emails\`: (Array of Objects) Populate this with the relevant emails from <source_references>.
        </field_details>
    </output_format>

    <context>
        <user_query>${userQuery}</user_query>
        <analyzed_folders>${JSON.stringify(labels)}</analyzed_folders>
        <email_data>${emailsText}</email_data>
        <source_references>${JSON.stringify(sourceEmailsForPrompt, null, 2)}</source_references>
    </context>

    <workflow>
        <step_1_analysis>
            First, analyze the <user_query> to determine if its scope is SPECIFIC or BROAD. Then, identify the relevant emails within <email_data>.
        </step_1_analysis>
        <step_2_draft_answer>
            Prepare the text for the "answer" field in Italian, strictly following the adaptive response logic from instruction #2. Use Markdown and address the user with "tu".
        </step_2_draft_answer>
        <step_3_assemble_json>
            Construct the final JSON object. CRUCIALLY, ensure all special characters in the "answer" string (like \\" and \\n) are correctly escaped to produce a valid JSON. Populate all fields as instructed.
        </step_3_assemble_json>
    </workflow>

    <task>
        Execute the <workflow>. Your entire response must be the final JSON object, and nothing else. Start immediately with \`{\`.
    </task>
</prompt>`;
    }
    
async listAllGmailLabels() {
    try {
        if (!this.accessToken) {
            throw new Error('Not authenticated');
        }

        const response = await this.apiCallWithRetry(
            'https://www.googleapis.com/gmail/v1/users/me/labels'
        );

        if (!response.ok) {
            throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const labels = data.labels || [];

        // Sort labels alphabetically by name
        labels.sort((a, b) => a.name.localeCompare(b.name));

        return labels;

    } catch (error) {
        throw error;
    }
}

    async performRAG(userQuery, labels, geminiApiKey, geminiModel = 'gemini-2.5-flash-lite', aiAssistedFolders = false) {
        try {
            // Check if we're authenticated and token is still valid
            const isValid = await this.checkAuthStatus();
            if (!isValid) {
                throw new Error('Not authenticated');
            }

            // Step 1: Rewrite user query with Gemini for optimal search
            const rewrittenQuery = await this.rewriteQueryWithGemini(userQuery, labels, geminiApiKey, geminiModel, aiAssistedFolders);

            // Step 2: Extract folders from AI-generated query if in AI-assisted mode
            let finalLabels = labels;
            if (aiAssistedFolders) {
                finalLabels = this.extractFoldersFromQuery(rewrittenQuery);
            }

            // Step 3: Search Gmail messages with the rewritten query
            const emails = await this.searchGmailMessages(rewrittenQuery);
            
            if (emails.length === 0) {
                return { 
                    success: true, 
                    result: JSON.stringify({ answer: "Non ho trovato email pertinenti nelle cartelle specificate per rispondere alla tua domanda.", source_folders: finalLabels, source_emails: [] }) 
                }; 
            }

            // Step 4: Get email content
            const emailContents = await this.getEmailContents(emails.slice(0, 10));
            

            // Step 5: Create the final prompt for structured JSON output
            const finalPrompt = this.createFinalRagPrompt(userQuery, emailContents, finalLabels);

            // Step 6: Query Gemini for the final structured answer
            const geminiResponse = await this.queryGemini(finalPrompt, geminiApiKey, geminiModel, true);

            // Parse the Gemini response to add folder information
            let finalResult;
            try {
                // geminiResponse is already a valid JSON string from queryGemini
                finalResult = JSON.parse(geminiResponse);
                // Add the extracted folders to the result when in AI-assisted mode
                if (aiAssistedFolders && finalLabels) {
                    finalResult.source_folders = finalLabels;
                }
            } catch (e) {
                // If parsing fails, create a fallback response
                finalResult = {
                    answer: "Error: Could not parse the AI response. Please try again.",
                    source_folders: finalLabels || [],
                    source_emails: []
                };
            }

            return { 
                success: true, 
                result: JSON.stringify(finalResult)
            };

        } catch (error) {
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

    async searchGmailMessages(optimizedQuery) {
        try {
            const response = await this.apiCallWithRetry(
                `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(optimizedQuery)}&maxResults=10`
            );

            if (!response.ok) {
                throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();
            return data.messages || [];

        } catch (error) {
            throw error;
        }
    }

    async getEmailContents(messages) {
        const emailContents = [];

        for (const message of messages) {
            try {
                const response = await this.apiCallWithRetry(
                    `https://www.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`
                );

                if (response.ok) {
                    const emailData = await response.json();
                    const emailContent = this.extractEmailContent(emailData);
                    emailContents.push(emailContent);
                }
            } catch (error) {
                // Continue with other emails
            }
        }

        return emailContents;
    }

    extractEmailContent(emailData) {
        const headers = emailData.payload.headers;
        const subject = headers.find(h => h.name === 'Subject')?.value || 'No Subject';
        const from = headers.find(h => h.name === 'From')?.value || 'Unknown Sender';
        const date = headers.find(h => h.name === 'Date')?.value || 'Unknown Date';
        
        let body = '';
        
        if (emailData.payload.body && emailData.payload.body.data) {
            const rawBody = this.decodeBase64(emailData.payload.body.data);
            
            // Check if it's HTML and convert to text
            if (emailData.payload.mimeType === 'text/html') {
                body = this.htmlToText(rawBody);
            } else {
                body = rawBody;
            }
        } else if (emailData.payload.parts) {
            body = this.extractBodyFromParts(emailData.payload.parts);
        }

        return {
            id: emailData.id, // Keep the email ID
            subject,
            from,
            date,
            body: body.substring(0, 40000) // Increased limit to 40k chars for comprehensive context
        };
    }

    extractBodyFromParts(parts) {
        let plainTextBody = '';
        let htmlBody = '';
        
        for (const part of parts) {
            if (part.mimeType === 'text/plain' && part.body && part.body.data) {
                plainTextBody += this.decodeBase64(part.body.data);
            } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
                htmlBody += this.decodeBase64(part.body.data);
            } else if (part.parts) {
                const nestedResult = this.extractBodyFromParts(part.parts);
                // If nested parts return object with both types, merge them
                if (typeof nestedResult === 'object') {
                    plainTextBody += nestedResult.plain || '';
                    htmlBody += nestedResult.html || '';
                } else {
                    // Legacy: just add to plain text
                    plainTextBody += nestedResult;
                }
            }
        }
        
        // Prefer plain text if available, otherwise use HTML
        if (plainTextBody.trim()) {
            return plainTextBody;
        } else if (htmlBody.trim()) {
            return this.htmlToText(htmlBody);
        }
        
        return '';
    }

    htmlToText(html) {
        // Simple HTML to text conversion without external dependencies
        return html
            // Remove script and style elements
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            // Convert common block elements to line breaks
            .replace(/<\/?(div|p|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
            // Convert links to readable format
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)')
            // Remove all remaining HTML tags
            .replace(/<[^>]*>/g, '')
            // Decode HTML entities
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            // Clean up whitespace
            .replace(/\n\s*\n/g, '\n\n')
            .replace(/^\s+|\s+$/g, '')
            .trim();
    }

    decodeBase64(data) {
        try {
            // Gmail API returns base64url encoded data
            const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
            return atob(base64);
        } catch (error) {
            return '';
        }
    }

    async queryGemini(prompt, apiKey, model = 'gemini-2.5-flash-lite', expectJson = false) {
        try {
            // Initialize with the provided API key using new API
            const ai = new GoogleGenAI({ apiKey: apiKey });

            // Configure thinking budget based on model
            const thinkingBudget = model === 'gemini-2.5-pro' ? -1 : 0;

            const response = await ai.models.generateContent({
                model: model,
                contents: prompt,
                config: {
                    thinkingConfig: {
                        thinkingBudget: thinkingBudget,
                    },
                }
            });

            let text = response.text;

            if (expectJson) {
                // Clean the response to ensure it's valid JSON
                text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                
                // Try to parse and re-stringify to ensure proper escaping
                try {
                    const parsedJson = JSON.parse(text);
                    const cleanJson = JSON.stringify(parsedJson);
                    return cleanJson; // Return the properly escaped JSON
                } catch (e) {
                    // Try to extract just the JSON part if there's extra text
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            const extractedJson = jsonMatch[0];
                            const parsedJson = JSON.parse(extractedJson);
                            const cleanJson = JSON.stringify(parsedJson);
                            return cleanJson;
                        } catch (extractError) {
                            // Extracted JSON also failed
                        }
                    }
                    
                    // Fallback to a structured error message
                    return JSON.stringify({
                        answer: "Error: The AI returned an invalid response. Please try again.",
                        source_folders: [],
                        source_emails: []
                    });
                }
            }

            return text;

        } catch (error) {
            throw new Error(`Error during Gemini analysis: ${error.message}`);
        }
    }
}

// Initialize background script
new GmailRAGBackground();
