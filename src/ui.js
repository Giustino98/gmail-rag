// UI Module - Pure DOM manipulation layer
// This module should NEVER contain business logic, only UI updates

export class UIManager {
    constructor() {
        this.elements = this.initializeElements();
        this.setupCheckboxBehaviors();
        this.setupTextareaAutoResize();
        this.setupCopyButton();
        this.currentSearch = null;
        
        // Load saved search options after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.loadSearchOptions();
        }, 100);
    }

    setupCheckboxBehaviors() {
        // Handle "All Mail" checkbox behavior
        document.getElementById('all').addEventListener('change', (e) => {
            if (e.target.checked) {
                ['inbox', 'sent', 'drafts'].forEach(id => {
                    const checkbox = document.getElementById(id);
                    if (checkbox) checkbox.checked = false;
                });
            }
            this.saveSearchOptions();
        });
        
        // Handle other checkboxes
        ['inbox', 'sent', 'drafts'].forEach(id => {
            const checkbox = document.getElementById(id);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        const allCheckbox = document.getElementById('all');
                        if (allCheckbox) allCheckbox.checked = false;
                    }
                    this.saveSearchOptions();
                });
            }
        });

        // Handle AI-assisted toggle
        const aiToggle = document.getElementById('aiAssistedFolders');
        if (aiToggle) {
            aiToggle.addEventListener('change', () => {
                this.saveSearchOptions();
            });
        }
    }

    initializeElements() {
        return {
            // Auth elements
            authStatusText: document.getElementById('authStatusText'),
            userAvatarContainer: document.getElementById('userAvatarContainer'),
            toggleConfigButton: document.getElementById('toggleConfigButton'),
            logoutButton: document.getElementById('logoutButton'),
            
            // Config elements
            configSection: document.getElementById('configSection'),
            geminiApiKey: document.getElementById('geminiApiKey'),
            geminiModel: document.getElementById('geminiModel'),
            saveConfig: document.getElementById('saveConfig'),
            authButton: document.getElementById('authButton'),
            hideConfigButton: document.getElementById('hideConfigButton'),
            
            // Query elements
            query: document.getElementById('query'),
            clearButton: document.getElementById('clearButton'),
            searchButton: document.getElementById('searchButton'),
            searchProgress: document.getElementById('searchProgress'),
            
            // Folder selection elements
            aiAssistedFolders: document.getElementById('aiAssistedFolders'),
            manualFolderSelection: document.getElementById('manualFolderSelection'),
            showMoreLabelsButton: document.getElementById('showMoreLabelsButton'),
            showLessLabelsButton: document.getElementById('showLessLabelsButton'),
            additionalLabelsContainer: document.getElementById('additionalLabelsContainer'),
            
            // Result elements
            status: document.getElementById('status'),
            results: document.getElementById('results'),
            resultsSection: document.getElementById('resultsSection'),
            
            // New elements
            errorDisplay: document.getElementById('errorDisplay'),
            copyButton: document.getElementById('copyButton'),
            loadingOverlay: document.getElementById('loadingOverlay'),
            cancelButton: document.getElementById('cancelButton')
        };
    }

    // ===== AUTH STATUS METHODS =====
    
    showAuthStatus(status, userInfo = null) {
        switch (status) {
            case 'connected':
                this._showConnectedStatus(userInfo);
                break;
            case 'disconnected':
                this._showDisconnectedStatus();
                break;
        }
    }

    _showConnectedStatus(userInfo) {
        if (userInfo) {
            const avatarContent = this._createAvatarContent(userInfo);
            this.elements.authStatusText.innerHTML = `
                <div class="user-avatar" title="Connected as ${userInfo.emailAddress}">
                    ${avatarContent}
                </div>
            `;
        } else {
            this.elements.authStatusText.innerHTML = `
                <div class="user-avatar" title="Connected to Gmail">?</div>
            `;
        }
        this.elements.authStatusText.className = 'auth-status-text';
        this.elements.authStatusText.classList.remove('hidden');
        this.elements.logoutButton.classList.remove('hidden');
    }

    _showDisconnectedStatus() {
        this.elements.authStatusText.textContent = 'Not connected to Gmail';
        this.elements.authStatusText.className = 'auth-status-text auth-status disconnected';
        this.elements.authStatusText.classList.remove('hidden');
        this.elements.logoutButton.classList.add('hidden');
    }

    _createAvatarContent(userInfo) {
        if (userInfo.profilePicture) {
            return `<img src="${userInfo.profilePicture}" alt="Profile picture" onerror="this.style.display='none'; this.parentElement.innerHTML='${this._getInitials(userInfo.emailAddress).replace(/'/g, '&apos;')}';">`;
        }
        return this._getInitials(userInfo.emailAddress);
    }

    _getInitials(email) {
        if (!email) return '?';
        const parts = email.split('@')[0].split('.');
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return email.substring(0, 2).toUpperCase();
    }

    // ===== CONFIGURATION METHODS =====

    toggleConfigView(show) {
        if (show) {
            this.elements.configSection.classList.remove('hidden');
            this.elements.toggleConfigButton.classList.add('hidden');
        } else {
            this.elements.configSection.classList.add('hidden');
            this.elements.toggleConfigButton.classList.remove('hidden');
        }
    }

    showHideConfigButton(show) {
        this.elements.hideConfigButton.style.display = show ? 'block' : 'none';
    }

    showConfigToggleButton(show) {
        if (show) {
            this.elements.toggleConfigButton.classList.remove('hidden');
        } else {
            this.elements.toggleConfigButton.classList.add('hidden');
        }
    }

    // ===== BUTTON STATE METHODS =====

    updateButtonState(buttonName, enabled) {
        const button = this.elements[buttonName];
        if (button) {
            button.disabled = !enabled;
        }
    }

    updateButtonStates(states) {
        Object.entries(states).forEach(([buttonName, enabled]) => {
            this.updateButtonState(buttonName, enabled);
        });
    }

    // ===== LOADING STATE METHODS =====

    showLoading(isLoading) {
        const buttonText = this.elements.searchButton.querySelector('.button-text');
        const spinner = this.elements.searchButton.querySelector('.loading-spinner');
        
        if (isLoading) {
            this.elements.searchButton.disabled = true;
            this.elements.searchButton.classList.add('loading');
            if (buttonText) buttonText.textContent = 'Searching...';
            if (spinner) spinner.style.display = 'block';
            if (this.elements.searchProgress) {
                this.elements.searchProgress.style.display = 'block';
                this._startProgressAnimation();
            }
        } else {
            this.elements.searchButton.classList.remove('loading');
            if (buttonText) buttonText.textContent = 'Search & Analyze';
            if (spinner) spinner.style.display = 'none';
            if (this.elements.searchProgress) {
                this.elements.searchProgress.style.display = 'none';
            }
        }
    }

    _startProgressAnimation() {
        const progressText = document.querySelector('.progress-text');
        if (!progressText) return;
        
        const messages = [
            'Searching your emails...',
            'Analyzing with AI...',
            'Processing results...',
            'Almost done...'
        ];
        
        let index = 0;
        const interval = setInterval(() => {
            if (this.elements.searchProgress.style.display === 'none') {
                clearInterval(interval);
                return;
            }
            progressText.textContent = messages[index % messages.length];
            index++;
        }, 1500);
    }

    // ===== FOLDER SELECTION METHODS =====

    updateFolderSelectionState(disabled) {
        if (disabled) {
            this.elements.manualFolderSelection.classList.add('disabled');
        } else {
            this.elements.manualFolderSelection.classList.remove('disabled');
        }
    }

    // ===== LABELS METHODS =====

    async showAdditionalLabels(labels) {
        const container = this.elements.additionalLabelsContainer;
        container.innerHTML = '';

        // Filter out already shown system labels
        const filteredLabels = labels.filter(label => !['INBOX', 'SENT', 'DRAFT'].includes(label.id));
        
        // Create labels container with larger height and no search
        const labelsContainer = document.createElement('div');
        labelsContainer.id = 'scrollableLabels';
        labelsContainer.style.cssText = `
            max-height: 300px; 
            overflow-y: auto; 
            border: 1px solid #eee; 
            border-radius: 4px; 
            padding: 8px;
            background: #fafafa;
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
        `;
        
        // Hide scrollbar for Webkit browsers
        const style = document.createElement('style');
        style.textContent = `
            #scrollableLabels::-webkit-scrollbar {
                width: 0px;
                background: transparent;
            }
        `;
        document.head.appendChild(style);
        container.appendChild(labelsContainer);

        // Create counter
        const counter = document.createElement('div');
        counter.id = 'labelCounter';
        counter.style.cssText = 'margin-top: 8px; font-size: 12px; color: #666; text-align: center;';
        container.appendChild(counter);

        // Render all labels
        this.renderLabels(filteredLabels, labelsContainer, counter);

        // Restore custom label selections after labels are rendered
        await this.restoreCustomLabelSelections();

        container.style.display = 'block';
        this.elements.showMoreLabelsButton.style.display = 'none';
        this.elements.showLessLabelsButton.style.display = 'block';
    }

    renderLabels(labelsToShow, labelsContainer, counter) {
        labelsContainer.innerHTML = '';
        
        if (labelsToShow.length === 0) {
            labelsContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No custom labels found</div>';
            counter.textContent = 'No custom labels available';
            return;
        }

        // Sort labels alphabetically
        const sortedLabels = [...labelsToShow].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

        sortedLabels.forEach(label => {
            const labelWrapper = document.createElement('label');
            labelWrapper.style.cssText = `
                display: flex; 
                align-items: center; 
                padding: 6px 0; 
                cursor: pointer;
                border-bottom: 1px solid #f0f0f0;
            `;
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `label-${label.id}`;
            checkbox.value = label.name;
            checkbox.style.marginRight = '8px';

            const labelText = document.createElement('span');
            labelText.textContent = label.name;
            labelText.style.cssText = 'font-size: 13px; word-break: break-word;';

            // Add change listener to save options when custom labels are selected
            checkbox.addEventListener('change', () => {
                this.saveSearchOptions();
            });

            labelWrapper.appendChild(checkbox);
            labelWrapper.appendChild(labelText);
            labelsContainer.appendChild(labelWrapper);
        });

        // Update counter
        counter.textContent = `${labelsToShow.length} custom labels available`;
    }

    hideAdditionalLabels() {
        this.elements.additionalLabelsContainer.style.display = 'none';
        this.elements.additionalLabelsContainer.innerHTML = '';
        this.elements.showLessLabelsButton.style.display = 'none';
        this.elements.showMoreLabelsButton.style.display = 'block';
        this.elements.showMoreLabelsButton.disabled = false;
        this.elements.showMoreLabelsButton.textContent = 'Show more labels';
    }

    updateLabelsButtonState(loading) {
        this.elements.showMoreLabelsButton.disabled = loading;
        this.elements.showMoreLabelsButton.textContent = loading ? 'Loading...' : 'Show more labels';
    }

    // ===== STATUS METHODS =====

    showStatus(message, type) {
        this.elements.status.textContent = message;
        this.elements.status.className = `status ${type}`;
        this.elements.status.style.display = 'block';
        
        if (type === 'success') {
            setTimeout(() => {
                this.elements.status.style.display = 'none';
            }, 3000);
        }
    }

    hideStatus() {
        this.elements.status.style.display = 'none';
    }

    // ===== RESULTS METHODS =====


    // ===== FORM METHODS =====

    getFormData() {
        return {
            geminiApiKey: this.elements.geminiApiKey.value.trim(),
            geminiModel: this.elements.geminiModel.value,
            query: this.elements.query.value.trim(),
            aiAssistedFolders: this.elements.aiAssistedFolders.checked
        };
    }

    setFormData(data) {
        if (data.geminiApiKey !== undefined) this.elements.geminiApiKey.value = data.geminiApiKey;
        if (data.geminiModel !== undefined) this.elements.geminiModel.value = data.geminiModel;
        if (data.query !== undefined) this.elements.query.value = data.query;
    }

    clearForm() {
        this.elements.query.value = '';
        this.clearResults();
        this.hideStatus();
    }

    getSelectedLabels() {
        const checkboxes = document.querySelectorAll(
            '#manualFolderSelection input[type="checkbox"]:checked, ' +
            '#additionalLabelsContainer input[type="checkbox"]:checked'
        );
        return Array.from(checkboxes)
            .map(cb => cb.value)
            .filter(Boolean);
    }

    // ===== EVENT LISTENER HELPERS =====
    
    addEventListener(elementName, event, callback) {
        const element = this.elements[elementName];
        if (element) {
            element.addEventListener(event, callback);
        } else {
            console.warn(`Element '${elementName}' not found for event '${event}'`);
        }
    }

    // For elements not in the elements map
    addEventListenerToElement(selector, event, callback) {
        const element = document.querySelector(selector);
        if (element) {
            element.addEventListener(event, callback);
        } else {
            console.warn(`Element '${selector}' not found for event '${event}'`);
        }
    }

    // ===== NEW UI ENHANCEMENT METHODS =====

    setupTextareaAutoResize() {
        if (this.elements.query) {
            this.elements.query.addEventListener('input', () => {
                this._autoResizeTextarea(this.elements.query);
            });
        }
    }

    _autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }

    setupCopyButton() {
        if (this.elements.copyButton) {
            this.elements.copyButton.addEventListener('click', () => {
                this.copyResultsToClipboard();
            });
        }
    }

    async copyResultsToClipboard() {
        if (!this.elements.results.textContent) return;

        try {
            await navigator.clipboard.writeText(this.elements.results.textContent);
            this.showCopyFeedback();
        } catch (error) {
            console.warn('Clipboard API not available, trying fallback');
            this.fallbackCopyToClipboard(this.elements.results.textContent);
        }
    }

    fallbackCopyToClipboard(text) {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            this.showCopyFeedback();
        } catch (error) {
            console.error('Failed to copy to clipboard:', error);
        }
        document.body.removeChild(textArea);
    }

    showCopyFeedback() {
        const button = this.elements.copyButton;
        const originalHTML = button.innerHTML;
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="m9 12 2 2 4-4"></path>
            </svg>
        `;
        button.style.background = 'var(--form-element-valid-border-color)';
        button.style.borderColor = 'var(--form-element-valid-border-color)';
        button.style.color = 'white';
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.style.background = 'transparent';
            button.style.borderColor = 'var(--primary)';
            button.style.color = 'var(--primary)';
        }, 2000);
    }

    showError(message) {
        this.elements.errorDisplay.innerHTML = `
            <strong>Error:</strong> ${message}
        `;
        this.elements.errorDisplay.style.display = 'block';
        setTimeout(() => {
            this.elements.errorDisplay.style.display = 'none';
        }, 5000);
    }

    hideError() {
        this.elements.errorDisplay.style.display = 'none';
    }

    showEnhancedLoading(show, message = 'Analyzing your emails...') {
        if (show) {
            this.elements.loadingOverlay.querySelector('p').textContent = message;
            this.elements.loadingOverlay.classList.add('active');
            // Disable form
            document.querySelector('.search-section form').classList.add('form-disabled');
        } else {
            this.elements.loadingOverlay.classList.remove('active');
            document.querySelector('.search-section form').classList.remove('form-disabled');
        }
    }

    displayResults(data, isAiAssisted = false) {
        this.elements.results.innerHTML = '';
        this.elements.resultsSection.style.display = 'block';

        try {
            const parsedData = typeof data === 'string' ? JSON.parse(data) : data;

            // Main Answer with Markdown-like formatting
            const answerDiv = document.createElement('div');
            answerDiv.className = 'results-content';
            answerDiv.innerHTML = this._formatMarkdown(parsedData.answer || "No answer provided.");
            this.elements.results.appendChild(answerDiv);

            // Create collapsible sources section
            if ((parsedData.source_folders && parsedData.source_folders.length > 0) || 
                (parsedData.source_emails && parsedData.source_emails.length > 0)) {
                
                const sourcesDetails = document.createElement('details');
                sourcesDetails.className = 'source-details';
                
                // Create summary with counts
                const summary = document.createElement('summary');
                const folderCount = parsedData.source_folders ? parsedData.source_folders.length : 0;
                const emailCount = parsedData.source_emails ? parsedData.source_emails.length : 0;
                
                // Build summary text based on available data
                let summaryText;
                if (folderCount > 0) {
                    summaryText = `Show sources (${emailCount} email${emailCount !== 1 ? 's' : ''} from ${folderCount} folder${folderCount !== 1 ? 's' : ''})`;
                } else {
                    // When AI chooses folders automatically, we don't have the folder count
                    summaryText = `Show sources (${emailCount} email${emailCount !== 1 ? 's' : ''})`;
                }
                
                summary.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14,2 14,8 20,8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10,9 9,9 8,9"></polyline>
                    </svg>
                    ${summaryText}
                `;
                
                // Create source content container
                const sourceContainer = document.createElement('div');
                sourceContainer.className = 'source-info';
                
                // Add folders info - now works for both manual and AI-assisted modes
                if (parsedData.source_folders && parsedData.source_folders.length > 0) {
                    const foldersSection = document.createElement('div');
                    
                    // Use the isAiAssisted parameter to determine the correct label
                    const labelText = isAiAssisted ? "AI searched in:" : "Searched folders:";
                    
                    foldersSection.innerHTML = `
                        <div class="source-section">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <strong>${labelText}</strong> ${parsedData.source_folders.join(', ')}
                        </div>
                    `;
                    sourceContainer.appendChild(foldersSection);
                } else {
                    // Fallback for when no folder information is available
                    const foldersSection = document.createElement('div');
                    foldersSection.innerHTML = `
                        <div class="source-section">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2l5 0 2 3h9a2 2 0 0 1 2 2z"></path>
                            </svg>
                            <strong>Search scope:</strong> AI searched across Gmail
                        </div>
                    `;
                    sourceContainer.appendChild(foldersSection);
                }
                
                // Add emails info
                if (parsedData.source_emails && parsedData.source_emails.length > 0) {
                    const emailsSection = document.createElement('div');
                    emailsSection.className = 'source-section';
                    emailsSection.innerHTML = `
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        <strong>Source emails:</strong>
                    `;
                    
                    const emailList = document.createElement('ul');
                    emailList.className = 'source-emails-list';
                    parsedData.source_emails.forEach(email => {
                        const item = document.createElement('li');
                        const link = document.createElement('a');
                        link.href = email.link;
                        link.textContent = email.subject || '(No Subject)';
                        link.target = '_blank';
                        item.appendChild(link);
                        emailList.appendChild(item);
                    });
                    emailsSection.appendChild(emailList);
                    sourceContainer.appendChild(emailsSection);
                }
                
                sourcesDetails.appendChild(summary);
                sourcesDetails.appendChild(sourceContainer);
                this.elements.results.appendChild(sourcesDetails);
            }

        } catch (error) {
            console.error("Failed to parse or display results:", error);
            this.elements.results.innerHTML = `<p>An error occurred while displaying the result.</p>`;
        }
    }

    _formatMarkdown(text) {
        // Simple Markdown-like formatting
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>') // Inline code
            .replace(/\n\n/g, '</p><p>') // Paragraphs
            .replace(/\n/g, '<br>') // Line breaks
            .replace(/^/, '<p>') // Start paragraph
            .replace(/$/, '</p>'); // End paragraph
    }

    clearResults() {
        this.elements.results.innerHTML = '';
        this.elements.resultsSection.style.display = 'none';
    }

    // ===== PERSISTENT SEARCH OPTIONS =====

    async saveSearchOptions() {
        try {
            const selectedLabels = this.getSelectedLabels();
            const aiAssisted = document.getElementById('aiAssistedFolders')?.checked || false;
            
            const searchOptions = {
                selectedLabels: selectedLabels,
                aiAssistedFolders: aiAssisted
            };

            await chrome.storage.local.set({ searchOptions });
        } catch (error) {
            console.warn('Could not save search options:', error);
        }
    }

    async loadSearchOptions() {
        try {
            const result = await chrome.storage.local.get(['searchOptions']);
            const options = result.searchOptions;
            
            if (!options) return; // No saved options
            
            // Restore AI-assisted toggle
            const aiToggle = document.getElementById('aiAssistedFolders');
            if (aiToggle && options.aiAssistedFolders !== undefined) {
                aiToggle.checked = options.aiAssistedFolders;
                // Trigger change event to update UI state
                aiToggle.dispatchEvent(new Event('change'));
            }
            
            // Restore selected labels
            if (options.selectedLabels && options.selectedLabels.length > 0) {
                // First, clear all current selections
                const allCheckboxes = document.querySelectorAll(
                    '#manualFolderSelection input[type="checkbox"], ' +
                    '#additionalLabelsContainer input[type="checkbox"]'
                );
                allCheckboxes.forEach(cb => cb.checked = false);
                
                // Then restore saved selections
                options.selectedLabels.forEach(labelValue => {
                    // Check main folder checkboxes
                    const mainCheckbox = document.querySelector(
                        `#manualFolderSelection input[type="checkbox"][value="${labelValue}"]`
                    );
                    if (mainCheckbox) {
                        mainCheckbox.checked = true;
                        return;
                    }
                    
                    // Check custom label checkboxes (these might load later)
                    const customCheckbox = document.querySelector(
                        `#additionalLabelsContainer input[type="checkbox"][value="${labelValue}"]`
                    );
                    if (customCheckbox) {
                        customCheckbox.checked = true;
                    }
                });
            }
        } catch (error) {
            console.warn('Could not load search options:', error);
        }
    }

    // Call this after labels are loaded
    async restoreCustomLabelSelections() {
        try {
            const result = await chrome.storage.local.get(['searchOptions']);
            const options = result.searchOptions;
            
            if (!options || !options.selectedLabels) return;
            
            // Restore custom label selections after they're rendered
            options.selectedLabels.forEach(labelValue => {
                const customCheckbox = document.querySelector(
                    `#additionalLabelsContainer input[type="checkbox"][value="${labelValue}"]`
                );
                if (customCheckbox) {
                    customCheckbox.checked = true;
                }
            });
        } catch (error) {
            console.warn('Could not restore custom label selections:', error);
        }
    }
}