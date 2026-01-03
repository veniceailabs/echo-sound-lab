/**
 * GOLDEN MASTER ARCHIVE - WATERMARK PROTECTION SYSTEM
 *
 * This script provides multi-layer watermarking and anti-theft protection:
 * 1. Runtime watermark injection
 * 2. Copy/paste metadata tagging
 * 3. Print detection and marking
 * 4. Screenshot forensics
 * 5. Anti-tampering measures
 */

(function() {
    'use strict';

    // Configuration
    const ARCHIVE_HASH = '15b6fe260562cea2b202e9a1a8522bd80eec6208da88b251b3f468fd96f79ad1';
    const SEAL_DATE = 'January 1, 2026';
    const DOCUMENT_ID = 'ACTION_AUTHORITY_v1.4.0_GOLDEN_MASTER';

    // Initialize protection on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeProtection);
    } else {
        initializeProtection();
    }

    function initializeProtection() {
        // Apply protection layers
        preventCopyTheft();
        preventPrintTheft();
        preventScreenshotTheft();
        preventDevToolsAccess();
        addMetadataMarkers();
        initializeForensicLogging();
    }

    /**
     * LAYER 1: Copy Protection
     * Tags all copied text with metadata
     */
    function preventCopyTheft() {
        document.addEventListener('copy', function(e) {
            const selectedText = window.getSelection().toString();

            // Create watermarked copy
            const timestamp = new Date().toISOString();
            const watermarkedText = `${selectedText}\n\n[WATERMARKED COPY]\nSource: ${DOCUMENT_ID}\nHash: ${ARCHIVE_HASH}\nDate Sealed: ${SEAL_DATE}\nExtracted: ${timestamp}\nThis document is CONFIDENTIAL and protected by law.`;

            // Set the clipboard with watermarked text
            if (e.clipboardData || window.clipboardData) {
                e.clipboardData.setData('text/plain', watermarkedText);
                e.preventDefault();

                // Log the copy attempt
                logForensicEvent('COPY_WATERMARKED', {
                    textLength: selectedText.length,
                    timestamp: timestamp
                });
            }
        });

        // Prevent drag-and-drop theft
        document.addEventListener('dragstart', function(e) {
            if (e.target.closest('.container')) {
                e.preventDefault();
                logForensicEvent('DRAG_ATTEMPT_BLOCKED', {});
            }
        });
    }

    /**
     * LAYER 2: Print Protection
     * Detects print attempts and logs them
     */
    function preventPrintTheft() {
        window.addEventListener('beforeprint', function() {
            logForensicEvent('PRINT_INITIATED', {
                timestamp: new Date().toISOString()
            });

            // Add visible print warning (doesn't prevent printing, just logs it)
            const warning = document.createElement('div');
            warning.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: rgba(220, 53, 69, 0.9);
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                font-size: 12px;
                z-index: 10000;
                font-weight: bold;
                text-align: center;
            `;
            warning.textContent = 'Printing logged • This document is forensically tracked';
            document.body.appendChild(warning);

            setTimeout(() => warning.remove(), 3000);
        });

        window.addEventListener('afterprint', function() {
            logForensicEvent('PRINT_COMPLETED', {
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * LAYER 3: Screenshot Watermarking
     * The CSS watermark layer already marks all screenshots
     * (diagonal text + background pattern are visible in any screenshot)
     * Client-side detection is unreliable on macOS, so we rely on the watermark instead
     */
    function preventScreenshotTheft() {
        // Log when page visibility changes (user may have taken a screenshot)
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                logForensicEvent('PAGE_HIDDEN', {
                    timestamp: new Date().toISOString(),
                    note: 'User may have taken screenshot or switched apps'
                });
            }
        });
    }

    /**
     * LAYER 4: Dev Tools Prevention
     * Detects and warns about developer tools access
     */
    function preventDevToolsAccess() {
        let devtoolsOpen = false;

        // Detect dev tools via timing
        const threshold = 160;
        setInterval(function() {
            const start = performance.now();
            debugger; // This pauses in dev tools
            const end = performance.now();

            if (end - start > threshold) {
                if (!devtoolsOpen) {
                    devtoolsOpen = true;
                    logForensicEvent('DEVELOPER_TOOLS_DETECTED', {
                        timestamp: new Date().toISOString()
                    });

                    // Show warning
                    console.warn('%c⚠️  CONFIDENTIAL DOCUMENT ⚠️', 'color: red; font-size: 16px; font-weight: bold;');
                    console.warn('%cDeveloper tools access has been detected and logged.', 'color: red; font-size: 12px;');
                    console.warn('%cUnauthorized access attempts are tracked and reported.', 'color: red; font-size: 12px;');
                }
            }
        }, 500);

        // Disable right-click context menu
        document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            logForensicEvent('CONTEXT_MENU_ATTEMPT', {
                x: e.clientX,
                y: e.clientY
            });

            // Show notification
            showNotification('Right-click disabled - This document is protected');
            return false;
        });

        // Prevent keyboard shortcuts for saving
        document.addEventListener('keydown', function(e) {
            // Cmd/Ctrl+S, Cmd/Ctrl+P
            if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'p')) {
                // Allow Ctrl+P for printing (it's already logged)
                if (e.key === 'p') return;

                e.preventDefault();
                logForensicEvent('SAVE_SHORTCUT_BLOCKED', {});
                showNotification('Save disabled - Use print to PDF instead');
                return false;
            }
        });
    }

    /**
     * LAYER 5: Add Metadata Markers
     * Embeds forensic information in the document
     */
    function addMetadataMarkers() {
        // Add forensic metadata to page
        const meta = document.createElement('meta');
        meta.name = 'forensic-hash';
        meta.content = ARCHIVE_HASH;
        document.head.appendChild(meta);

        // Add data attributes to main container
        const container = document.querySelector('.container');
        if (container) {
            container.setAttribute('data-forensic-id', DOCUMENT_ID);
            container.setAttribute('data-seal-date', SEAL_DATE);
            container.setAttribute('data-protection-active', 'true');
        }

        // Embed invisible watermark in page title
        const originalTitle = document.title;
        document.title = `${originalTitle} [CONFIDENTIAL-${ARCHIVE_HASH.substring(0, 8)}]`;
    }

    /**
     * LAYER 6: Forensic Logging
     * Logs all protection events
     */
    function initializeForensicLogging() {
        // Check if forensic logging endpoint exists
        window.forensicLog = logForensicEvent;

        // Log initial page load
        logForensicEvent('DOCUMENT_LOADED', {
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            documentId: DOCUMENT_ID,
            url: window.location.href
        });

        // Log page visibility changes (document hidden/shown)
        document.addEventListener('visibilitychange', function() {
            logForensicEvent('VISIBILITY_CHANGED', {
                hidden: document.hidden,
                timestamp: new Date().toISOString()
            });
        });

        // Log before page unload
        window.addEventListener('beforeunload', function() {
            logForensicEvent('PAGE_UNLOAD', {
                timestamp: new Date().toISOString()
            });
        });
    }

    /**
     * Log forensic events (would send to server in production)
     */
    function logForensicEvent(eventType, eventData) {
        const logEntry = {
            eventType: eventType,
            documentId: DOCUMENT_ID,
            hash: ARCHIVE_HASH,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            ...eventData
        };

        // Log to console (visible in dev tools, adding to the logging record)
        console.log('[FORENSIC]', logEntry);

        // In production, this would send to a secure logging endpoint:
        // fetch('/api/forensic-log', {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify(logEntry)
        // });

        // Store in sessionStorage for this session
        if (window.sessionStorage) {
            const logs = JSON.parse(window.sessionStorage.getItem('forensicLogs') || '[]');
            logs.push(logEntry);
            window.sessionStorage.setItem('forensicLogs', JSON.stringify(logs.slice(-100))); // Keep last 100
        }
    }

    /**
     * Show notification to user
     */
    function showNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(31, 41, 55, 0.95);
            color: white;
            padding: 20px 30px;
            border-radius: 8px;
            font-size: 14px;
            z-index: 10000;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(220, 53, 69, 0.5);
            text-align: center;
            font-weight: 500;
        `;
        notification.textContent = message;

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

})();
