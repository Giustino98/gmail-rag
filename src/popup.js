import { UIManager } from './ui.js';

class GmailRAGPopup {
    constructor() {
        this.isAuthenticated = false;
        this.config = {};
        this.configVisible = false;
        this.ui = new UIManager();
        this.initializeEventListeners();
        this.isSearching = false;
    }

    initializeEventListeners() {
        // Configuration buttons
        this.ui.elements.saveConfig.addEventListener('click', () => this.saveConfiguration());
        this.ui.elements.authButton.addEventListener('click', () => this.handleAuth());
        this.ui.elements.toggleConfigButton.addEventListener('click', () => this.toggleConfiguration());
        this.ui.elements.hideConfigButton.addEventListener('click', () => this.hideConfiguration());
        this.ui.elements.logoutButton.addEventListener('click', () => this.handleLogout());
        
        // Search and query elements
        this.ui.elements.searchButton.addEventListener('click', () => this.performSearch());
        this.ui.elements.clearButton.addEventListener('click', () => this.clearAll());
        this.ui.elements.query.addEventListener('input', () => this.updateUIState());
        
        // Keyboard shortcuts
        this.ui.elements.query.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                e.preventDefault();
                if (!this.ui.elements.searchButton.disabled) {
                    this.performSearch();
                }
            }
            // Also support Enter without Ctrl for convenience
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
                e.preventDefault();
                if (!this.ui.elements.searchButton.disabled) {
                    this.performSearch();
                }
            }
        });

        // Cancel button
        this.ui.elements.cancelButton.addEventListener('click', () => {
            this.cancelSearch();
        });
        
        // Labels management
        this.ui.elements.showMoreLabelsButton.addEventListener('click', () => this.loadAdditionalLabels());
        this.ui.elements.showLessLabelsButton.addEventListener('click', () => this.hideAdditionalLabels());

        // AI-assisted folder selection
        this.ui.elements.aiAssistedFolders.addEventListener('change', (e) => {
            this.ui.updateFolderSelectionState(e.target.checked);
        });
    }

    async loadConfiguration() {
        try {
            const result = await chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'lastResult', 'lastQuery']);
            
            this.config = result;
            this.ui.setFormData({
                geminiApiKey: result.geminiApiKey,
                geminiModel: result.geminiModel || 'gemini-2.5-flash-lite',
                query: result.lastQuery
            });

            if (result.lastResult) {
                this.ui.displayResults(result.lastResult);
            }
            
            this.updateUIState();
        } catch (error) {
            this.ui.showStatus('Error loading configuration: ' + error.message, 'error');
        }
    }

    async saveConfiguration() {
        const values = this.ui.getFormData();
        
        if (!values.geminiApiKey) {
            this.ui.showStatus('Please enter the Gemini API key', 'error');
            return;
        }

        // Basic API key validation
        if (!this._isValidApiKey(values.geminiApiKey)) {
            this.ui.showStatus('Invalid API key format. Please check your Gemini API key.', 'error');
            return;
        }

        try {
            await chrome.storage.local.set({
                geminiApiKey: values.geminiApiKey,
                geminiModel: values.geminiModel
            });

            this.config = { 
                geminiApiKey: values.geminiApiKey, 
                geminiModel: values.geminiModel 
            };
            this.ui.showStatus('Configuration saved successfully!', 'success');
            this.updateUIState();
        } catch (error) {
            this.ui.showStatus('Error saving configuration: ' + error.message, 'error');
        }
    }

    _isValidApiKey(apiKey) {
        // Basic validation for Gemini API key format
        const trimmedKey = apiKey.trim();
        return trimmedKey.length > 20 && 
               /^[A-Za-z0-9_-]+$/.test(trimmedKey) &&
               trimmedKey.length < 200;
    }

    async checkAuthStatus() {
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'checkAuthStatus'
            });
            
            this.isAuthenticated = response.isAuthenticated;
            
            // If not authenticated, show config section by default
            if (!this.isAuthenticated) {
                this.configVisible = true;
            }
            
            await this.updateAuthStatus();
            this.updateUIState();
        } catch (error) {
            console.error('Error checking auth status:', error);
            // On error, assume not authenticated and show config
            this.isAuthenticated = false;
            this.configVisible = true;
            await this.updateAuthStatus();
            this.updateUIState();
        }
    }

    async handleAuth() {
        try {
            this.ui.showStatus('Connecting to Gmail...', 'success');
            
            const response = await chrome.runtime.sendMessage({
                action: 'authenticate'
            });

            if (response.success) {
                this.isAuthenticated = true;
                this.configVisible = false; // Hide config section after successful login
                this.ui.showStatus('Successfully connected to Gmail!', 'success');
                await this.updateAuthStatus();
                this.updateUIState();
            } else {
                throw new Error(response.error || 'Authentication failed');
            }
        } catch (error) {
            this.ui.showStatus('Authentication error: ' + error.message, 'error');
        }
    }

    async handleLogout() {
        try {
            await chrome.runtime.sendMessage({ action: 'logout' });
            
            this.isAuthenticated = false;
            this.configVisible = true; // Show config section after logout
            await this.updateAuthStatus();
            this.updateUIState();
            
            this.ui.showStatus('Successfully logged out from Gmail', 'success');
        } catch (error) {
            this.ui.showStatus('Logout error: ' + error.message, 'error');
        }
    }

    async updateAuthStatus() {
        if (this.isAuthenticated) {
            try {
                const userInfo = await this.getUserInfo();
                this.ui.showAuthStatus('connected', userInfo);
            } catch (error) {
                this.ui.showAuthStatus('connected');
            }
        } else {
            this.ui.showAuthStatus('disconnected');
        }
    }

    async getUserInfo() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'getUserInfo' });
            return response.success ? response.userInfo : null;
        } catch (error) {
            console.error('Error getting user info:', error);
            return null;
        }
    }

    updateUIState() {
        const hasApiKey = !!this.config.geminiApiKey;
        const values = this.ui.getFormData();
        const hasQuery = !!values.query;

        this.ui.toggleConfigView(this.configVisible);
        this.ui.showHideConfigButton(this.configVisible);
        this.ui.showConfigToggleButton(this.isAuthenticated && !this.configVisible);
        
        this.ui.updateButtonStates({
            authButton: !this.isAuthenticated,
            logoutButton: this.isAuthenticated,
            searchButton: this.isAuthenticated && hasApiKey && hasQuery
        });
    }

    toggleConfiguration() {
        this.configVisible = true;
        this.updateUIState();
    }

    hideConfiguration() {
        this.configVisible = false;
        this.updateUIState();
    }

    clearAll() {
        this.ui.clearForm();
        chrome.storage.local.remove(['lastResult', 'lastQuery']);
        this.updateUIState();
    }

    async loadAdditionalLabels() {
        this.ui.updateLabelsButtonState(true);

        try {
            const response = await chrome.runtime.sendMessage({ action: 'listAllGmailLabels' });
            if (response.success) {
                await this.ui.showAdditionalLabels(response.labels);
            } else {
                throw new Error(response.error || 'Failed to load labels');
            }
        } catch (error) {
            this.ui.showStatus('Error loading labels: ' + error.message, 'error');
            this.ui.updateLabelsButtonState(false);
        }
    }

    hideAdditionalLabels() {
        this.ui.hideAdditionalLabels();
    }

    async performSearch() {
        const values = this.ui.getFormData();
        
        if (!values.query) {
            this.ui.showStatus('Please enter a question', 'error');
            return;
        }

        if (!this.isAuthenticated) {
            this.ui.showStatus('Please connect to Gmail first', 'error');
            return;
        }

        if (!this.config.geminiApiKey) {
            this.ui.showStatus('Please configure your Gemini API key first', 'error');
            return;
        }

        let selectedLabels;
        if (values.aiAssistedFolders) {
            selectedLabels = [];
        } else {
            selectedLabels = this.ui.getSelectedLabels();
            if (selectedLabels.length === 0) {
                this.ui.showStatus('Please select at least one folder/label or use AI-assisted mode', 'error');
                return;
            }
        }

        if (this.isSearching) {
            return; // Prevent multiple simultaneous searches
        }

        try {
            this.isSearching = true;
            this.ui.clearResults();
            this.ui.hideError();
            this.ui.showEnhancedLoading(true, 'Searching your emails...');
            this.ui.showLoading(true);
            
            // Simulate progressive loading messages
            const progressTimeout = setTimeout(() => {
                if (this.isSearching) {
                    this.ui.showEnhancedLoading(true, 'Analyzing content with AI...');
                }
            }, 2000);

            const response = await chrome.runtime.sendMessage({
                action: 'performRAG',
                query: values.query,
                labels: selectedLabels,
                aiAssistedFolders: values.aiAssistedFolders,
                geminiApiKey: this.config.geminiApiKey,
                geminiModel: this.config.geminiModel || 'gemini-2.5-flash-lite'
            });

            clearTimeout(progressTimeout);

            if (!this.isSearching) {
                return; // Search was cancelled
            }

            if (response.success) {
                this.ui.displayResults(response.result, values.aiAssistedFolders);
                this.ui.showStatus('Analysis completed successfully!', 'success');
                
                await chrome.storage.local.set({ 
                    lastResult: response.result,
                    lastQuery: values.query 
                });
            } else {
                throw new Error(response.error || 'Search failed');
            }
        } catch (error) {
            if (!this.isSearching) {
                this.ui.showStatus('Search cancelled', 'success');
            } else {
                this.ui.showError(error.message);
                this.ui.showStatus('Search error: ' + error.message, 'error');
            }
        } finally {
            this.isSearching = false;
            this.ui.showEnhancedLoading(false);
            this.ui.showLoading(false);
            this.updateUIState();
        }
    }

    cancelSearch() {
        if (this.isSearching) {
            this.isSearching = false;
            this.ui.showEnhancedLoading(false);
            this.ui.showLoading(false);
            this.ui.showStatus('Search cancelled by user', 'success');
            this.updateUIState();
        }
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const popup = new GmailRAGPopup();
    popup.loadConfiguration();
    popup.checkAuthStatus();
});

