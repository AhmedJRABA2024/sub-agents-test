/**
 * Enhanced Frontend JavaScript for AI Salesman Chatbot
 * Features: Advanced Socket.io integration, Real-time engagement tracking,
 * Progressive Web App capabilities, Mobile-first responsive design,
 * Advanced product recommendations, Dynamic coupon generation
 */

(function($) {
    'use strict';
    
    class AISalesmanChatbot {
        constructor() {
            // Core properties
            this.sessionId = null;
            this.socket = null;
            this.isConnected = false;
            this.isReconnecting = false;
            this.reconnectAttempts = 0;
            this.maxReconnectAttempts = 5;
            
            // Message handling
            this.messageQueue = [];
            this.messageHistory = [];
            this.templates = {};
            this.isTyping = false;
            this.typingUsers = new Set();
            this.lastMessageId = null;
            
            // UI state
            this.currentRating = 0;
            this.isMinimized = false;
            this.unreadCount = 0;
            this.currentTheme = 'light';
            this.soundEnabled = true;
            
            // NEW PERSONA & UX FEATURES
            this.chatbotName = aiSalesmanFrontend.options.chatbotName || 'Gabriel';
            this.chatbotPersona = aiSalesmanFrontend.options.chatbotPersona || 'friendly';
            this.typingSpeed = this.getTypingDelay(aiSalesmanFrontend.options.typingSpeed || 'normal');
            this.conversationPersistence = aiSalesmanFrontend.options.conversationPersistence !== false;
            this.showTimestamps = aiSalesmanFrontend.options.showTimestamps !== false;
            this.emojiReactions = aiSalesmanFrontend.options.emojiReactions !== false;
            
            // Sound manager
            this.soundManager = null;
            if (window.AIChatbotSoundManager) {
                this.soundManager = new window.AIChatbotSoundManager({
                    soundEnabled: aiSalesmanFrontend.options.soundEnabled !== false,
                    soundVolume: aiSalesmanFrontend.options.soundVolume || 0.5
                });
            }
            
            // Advanced features
            this.engagementTracker = new EngagementTracker();
            
            // Performance monitoring
            this.performanceMetrics = {
                connectionTime: 0,
                averageResponseTime: 0,
                totalMessages: 0,
                failedMessages: 0
            };
            
            // Mobile detection
            this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
            this.isTablet = /iPad|Android|Tablet/i.test(navigator.userAgent) && !this.isMobile;
            this.isTouchDevice = 'ontouchstart' in window;
            
            // Initialize immediately
            this.init();
        }
        
        /**
         * Get typing delay based on speed setting
         */
        getTypingDelay(speed) {
            const delays = {
                slow: 100,
                normal: 50,
                fast: 20
            };
            return delays[speed] || delays.normal;
        }
        
        async init() {
            try {
                // Initialize components
                this.loadTemplates();
                this.bindEvents();
                
                // Initialize engagement tracker
                if (this.engagementTracker && this.engagementTracker.init) {
                    this.engagementTracker.init();
                }
                
                // Start connection
                this.initSocket();
                this.startSession();
                
                // Show widget with animation
                this.showWidget();
                
                // Auto-open logic
                // Load conversation history if persistence is enabled
                if (this.conversationPersistence) {
                    this.loadConversationHistory();
                }
                
                if (aiSalesmanFrontend.options.autoOpen) {
                    setTimeout(() => {
                        this.openChat();
                    }, 3000);
                }
                
                console.log('AI Salesman Chatbot initialized successfully');
                
            } catch (error) {
                console.error('Failed to initialize chatbot:', error);
                this.showError('Failed to initialize chat. Please refresh the page.');
            }
        }
        
        showWidget() {
            console.log('AI Salesman: showWidget called');
            const $widget = $('#ai-salesman-chatbot');
            console.log('AI Salesman: Widget element found:', $widget.length);
            
            $widget.addClass('fade-in').show();
            
            // Force visibility with CSS
            $widget.css({
                'display': 'block',
                'opacity': '1',
                'visibility': 'visible'
            });
            
            // Add entrance animation
            setTimeout(() => {
                $widget.find('.chatbot-toggle').addClass('bounce-in');
            }, 500);
            
            console.log('AI Salesman: Widget should now be visible');
        }
        
        loadTemplates() {
            $('script[type="text/template"]').each((index, element) => {
                const $element = $(element);
                const id = $element.attr('id');
                this.templates[id] = $element.html();
            });
        }
        
        bindEvents() {
            // Toggle chat
            $('#chatbot-toggle').on('click', () => this.toggleChat());
            
            // Close/minimize chat
            $('#close-chat').on('click', () => this.closeChat());
            $('#minimize-chat').on('click', () => this.minimizeChat());
            
            // Send message
            $('#send-message-btn').on('click', () => this.sendMessage());
            $('#chat-message-input').on('keypress', (e) => {
                if (e.which === 13 && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            // Auto-resize textarea
            $('#chat-message-input').on('input', (e) => {
                this.autoResizeTextarea(e.target);
            });
            
            // Rating system
            $('#rating-stars .star').on('click', (e) => {
                this.setRating($(e.target).data('rating'));
            });
            
            $('#submit-rating').on('click', () => this.submitRating());
            $('#skip-rating').on('click', () => this.skipRating());
            
            // Product showcase
            $('#close-showcase').on('click', () => this.closeShowcase());
            
            // Emoji reactions
            $(document).on('click', '.emoji-btn', (e) => {
                const emoji = $(e.target).data('emoji');
                this.sendEmojiReaction(emoji);
            });
            
            // Copy coupon codes
            $(document).on('click', '.copy-code-btn', (e) => {
                this.copyCouponCode($(e.target).data('code'));
            });
            
            // Add to cart from chat
            $(document).on('click', '.add-to-cart-btn', (e) => {
                this.addToCart($(e.target).data('product-id'));
            });
            
            // Track product clicks
            $(document).on('click', '.product-link, .product-card', (e) => {
                const productId = $(e.target).closest('[data-product-id]').data('product-id');
                if (productId) {
                    this.engagementTracker.trackClick(productId);
                }
            });
            
            // Handle "See More Products" button
            $(document).on('click', '.see-more-products-btn', (e) => {
                e.preventDefault();
                
                // Use the stored products data instead of parsing from HTML
                if (this.currentProducts && Array.isArray(this.currentProducts)) {
                    this.showAllProducts(this.currentProducts);
                } else {
                    console.error('No products data available');
                }
            });
            
            // Handle modern modal close
            $(document).on('click', '.modern-product-showcase-modal', (e) => {
                if (e.target === e.currentTarget) {
                    $(e.currentTarget).removeClass('active');
                    setTimeout(() => {
                        $(e.currentTarget).remove();
                    }, 300);
                }
            });
            
            // Handle add to cart from modern cards
            $(document).on('click', '.modern-add-to-cart-btn', (e) => {
                e.preventDefault();
                const productId = $(e.target).closest('[data-product-id]').data('product-id');
                if (productId) {
                    this.addToCart(productId);
                    // Add visual feedback
                    const $btn = $(e.target);
                    $btn.addClass('adding');
                    setTimeout(() => {
                        $btn.removeClass('adding').addClass('added');
                        setTimeout(() => $btn.removeClass('added'), 2000);
                    }, 1000);
                }
            });
            
            // Close showcase when clicking backdrop
            $(document).on('click', '.product-showcase', (e) => {
                if (e.target === e.currentTarget) {
                    this.closeShowcase();
                }
            });
        }
        
        initSocket() {
            if (!aiSalesmanFrontend.socketUrl) {
                console.warn('AI Salesman: Socket URL not configured');
                return;
            }
            
            try {
                this.socket = io(aiSalesmanFrontend.socketUrl, {
                    transports: ['websocket', 'polling']
                });
                
                this.socket.on('connect', () => {
                    console.log('AI Salesman: Connected to server');
                    this.isConnected = true;
                    this.updateConnectionStatus('online');
                    this.processMessageQueue();
                });
                
                this.socket.on('disconnect', () => {
                    console.log('AI Salesman: Disconnected from server');
                    this.isConnected = false;
                    this.updateConnectionStatus('offline');
                });
                
                this.socket.on('bot_message', (data) => {
                    this.handleBotMessage(data);
                });
                
                this.socket.on('typing_start', () => {
                    this.showTypingIndicator();
                });
                
                this.socket.on('typing_stop', () => {
                    this.hideTypingIndicator();
                });
                
            } catch (error) {
                console.error('AI Salesman: Failed to initialize socket connection', error);
            }
        }
        
        startSession() {
            const userData = {
                user_email: aiSalesmanFrontend.user.email,
                current_page: aiSalesmanFrontend.currentPage,
                nonce: aiSalesmanFrontend.nonce
            };
            
            $.ajax({
                url: aiSalesmanFrontend.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'ai_salesman_start_chat_session',
                    ...userData
                },
                success: (response) => {
                    if (response.success) {
                        this.sessionId = response.data.session_id;
                        console.log('AI Salesman: Session started', this.sessionId);
                        
                        // Join socket room
                        if (this.socket && this.isConnected) {
                            this.socket.emit('join_session', {
                                session_id: this.sessionId
                            });
                        }
                        
                        // Start engagement tracking
                        if (this.engagementTracker) {
                            this.engagementTracker.startSession(this.sessionId);
                        }
                    }
                },
                error: (xhr, status, error) => {
                    console.error('AI Salesman: Failed to start session', error);
                    // Continue with basic functionality even if session start fails
                }
            });
        }
        
        toggleChat() {
            const $window = $('#chatbot-window');
            const $toggle = $('#chatbot-toggle');
            
            if ($window.hasClass('active')) {
                this.closeChat();
            } else {
                this.openChat();
            }
        }
        
        openChat() {
            $('#chatbot-window').addClass('active');
            $('#chatbot-toggle').addClass('active');
            this.isMinimized = false;
            
            // Hide notification badge
            this.hideNotificationBadge();
            
            // Focus input
            setTimeout(() => {
                $('#chat-message-input').focus();
            }, 300);
            
            // Track engagement
            this.engagementTracker.trackPageView();
        }
        
        closeChat() {
            $('#chatbot-window').removeClass('active');
            $('#chatbot-toggle').removeClass('active');
            this.isMinimized = true;
            this.closeShowcase();
            
            // Show rating modal if session has messages and feedback hasn't been handled for this conversation
            if (this.shouldShowRatingModal()) {
                setTimeout(() => {
                    this.showRatingModal();
                }, 500);
            }
        }
        
        minimizeChat() {
            this.closeChat();
        }
        
        sendMessage() {
            const $input = $('#chat-message-input');
            const message = $input.val().trim();
            
            if (!message || !this.sessionId) {
                return;
            }
            
            // Play send sound
            if (this.soundManager) {
                this.soundManager.play('send');
            }
            
            // Clear input
            $input.val('');
            this.autoResizeTextarea($input[0]);
            
            // Add user message to chat
            this.addMessage('user', message);
            
            // Disable send button temporarily
            this.setSendButtonState(false);
            
            // Show typing indicator
            this.showTypingIndicator();
            
            // Send via socket if connected, otherwise queue
            const messageData = {
                session_id: this.sessionId,
                message: message,
                current_page: aiSalesmanFrontend.currentPage,
                user_data: aiSalesmanFrontend.user,
                nonce: aiSalesmanFrontend.nonce
            };
            
            if (this.isConnected && this.socket) {
                this.socket.emit('user_message', messageData);
            } else {
                this.messageQueue.push(messageData);
                // Fallback to AJAX
                this.sendMessageAjax(messageData);
            }
        }
        
        sendMessageAjax(messageData) {
            $.ajax({
                url: aiSalesmanFrontend.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'ai_salesman_send_message',
                    ...messageData
                },
                success: (response) => {
                    if (response.success) {
                        this.handleBotMessage(response.data);
                    } else {
                        this.showError(response.data || 'Failed to send message');
                    }
                },
                error: (xhr, status, error) => {
                    console.error('AI Salesman: Failed to send message', error);
                    this.showError(aiSalesmanFrontend.strings.connection_error);
                },
                complete: () => {
                    this.hideTypingIndicator();
                    this.setSendButtonState(true);
                }
            });
        }
        
        handleBotMessage(data) {
            this.hideTypingIndicator();
            this.setSendButtonState(true);
            
            // Debug log the received data
            console.log('handleBotMessage received data:', data);
            console.log('Products in data:', data.products);
            console.log('Message type:', data.message_type);
            
            // Add bot message
            const botMessage = data.ai_response ? data.ai_response.message : data.message;
            this.addMessage('bot', botMessage, data);
            
            // Only show products in AI responses, NOT in welcome messages
            if (data.products && data.products.length > 0 && data.message_type !== 'welcome') {
                console.log('Products found, calling handleProductRecommendation');
                this.handleProductRecommendation(data);
            } else {
                console.log('No products found in response or this is a welcome message');
            }
            
            // Handle special message types
            if (data.message_type === 'coupon_offer') {
                this.handleCouponOffer(data);
            }
        }
        
        handleProductRecommendation(data) {
            if (data.products && data.products.length > 0) {
                const $lastMessage = $('#chatbot-messages .message:last-child .message-text');
                
                // CRITICAL: Never add products to welcome messages
                const $parentMessage = $lastMessage.closest('.message');
                const isWelcomeMessage = $parentMessage.closest('.welcome-message').length > 0;
                
                if (isWelcomeMessage) {
                    console.log('🚫 Skipping product display - this is a welcome message');
                    return;
                }
                
                // Create modern products container
                const productsContainer = $('<div class="products-recommendation-container"></div>');
                
                // Show only first 2-3 products in chat for better UX
                const maxInlineProducts = 2;
                const productsToShow = data.products.slice(0, maxInlineProducts);
                
                // Add products with modern card design
                productsToShow.forEach(product => {
                    const enhancedProduct = this.formatProductData(product);
                    const productHtml = this.renderTemplate('modern-product-card-template', enhancedProduct);
                    productsContainer.append(productHtml);
                });
                
                // Add "See More Products" button if there are more products
                if (data.products.length > maxInlineProducts) {
                    const remainingCount = data.products.length - maxInlineProducts;
                    
                    // Store products data for the button click
                    this.currentProducts = data.products;
                    
                    const seeMoreHtml = `
                        <div class="see-more-products-wrapper">
                            <button class="see-more-products-btn" data-count="${remainingCount}">
                                <span class="btn-icon">🛍️</span>
                                <span class="btn-text">See ${remainingCount} More Products</span>
                                <span class="btn-arrow">→</span>
                            </button>
                        </div>`;
                    productsContainer.append(seeMoreHtml);
                }
                
                $lastMessage.append(productsContainer);
            }
        }
        
        handleCouponOffer(data) {
            if (data.coupon) {
                const $lastMessage = $('#chatbot-messages .message:last-child .message-text');
                const couponHtml = this.renderTemplate('coupon-template', data.coupon);
                $lastMessage.append(couponHtml);
            }
        }
        
        showProductShowcase(products, explanation) {
            const $showcase = $('#product-showcase');
            const $content = $('#showcase-content');
            
            // Clear existing content
            $content.empty();
            
            // Add explanation if provided
            if (explanation) {
                $content.append(`<div class="showcase-explanation">${explanation}</div>`);
            }
            
            // Add product cards
            products.forEach(product => {
                const productHtml = this.renderTemplate('product-card-template', product);
                $content.append(productHtml);
            });
            
            // Show showcase
            $showcase.addClass('active');
        }
        
        closeShowcase() {
            const $showcase = $('#product-showcase');
            $showcase.removeClass('active');
            
            // Hide after animation completes
            setTimeout(() => {
                $showcase.hide();
            }, 300);
        }
        
        /**
         * Format product data for consistent display
         */
        formatProductData(product) {
            const formattedProduct = {
                product_id: product.id || product.product_id,
                name: product.name,
                price: this.formatPrice(product),
                price_html: this.formatPriceHtml(product),
                image_url: product.image_url || product.imageUrl || '/wp-content/uploads/woocommerce-placeholder.png',
                permalink: product.permalink,
                short_description: product.short_description || product.shortDescription || '',
                rating: product.rating || 0,
                rating_html: this.formatRatingHtml(product.rating || 0),
                review_count: product.review_count || product.reviewCount || 0,
                in_stock: product.in_stock !== false,
                stock_status: product.in_stock !== false ? 'In Stock' : 'Out of Stock',
                categories: product.categories || '',
                badge: product.on_sale ? 'Sale' : (product.featured ? 'Featured' : ''),
                discount_percentage: this.calculateDiscountPercentage(product)
            };
            
            return formattedProduct;
        }
        
        /**
         * Format price with enhanced HTML for better display
         */
        formatPriceHtml(product) {
            const currency = product.currency || 'USD';
            const currencySymbol = this.getCurrencySymbol(currency);
            
            if (product.on_sale && product.sale_price && product.regular_price) {
                const discount = this.calculateDiscountPercentage(product);
                return `
                    <span class="sale-price">${currencySymbol}${product.sale_price}</span>
                    <span class="regular-price">${currencySymbol}${product.regular_price}</span>
                    ${discount > 0 ? `<span class="discount-badge">-${discount}%</span>` : ''}
                `;
            }
            
            return `<span class="current-price">${currencySymbol}${product.price}</span>`;
        }
        
        /**
         * Format rating as HTML stars
         */
        formatRatingHtml(rating) {
            const fullStars = Math.floor(rating);
            const hasHalfStar = rating % 1 !== 0;
            const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
            
            let starsHtml = '';
            
            // Full stars
            for (let i = 0; i < fullStars; i++) {
                starsHtml += '★';
            }
            
            // Half star
            if (hasHalfStar) {
                starsHtml += '☆';
            }
            
            // Empty stars
            for (let i = 0; i < emptyStars; i++) {
                starsHtml += '☆';
            }
            
            return starsHtml;
        }
        
        /**
         * Calculate discount percentage
         */
        calculateDiscountPercentage(product) {
            if (product.on_sale && product.sale_price && product.regular_price) {
                const regular = parseFloat(product.regular_price);
                const sale = parseFloat(product.sale_price);
                if (regular > sale) {
                    return Math.round(((regular - sale) / regular) * 100);
                }
            }
            return 0;
        }
        
        /**
         * Format price with sale/regular price display
         */
        formatPrice(product) {
            const currency = product.currency || 'USD';
            const currencySymbol = this.getCurrencySymbol(currency);
            
            if (product.on_sale && product.sale_price && product.regular_price) {
                return `<span class="sale-price">${currencySymbol}${product.sale_price}</span> <span class="regular-price">${currencySymbol}${product.regular_price}</span>`;
            }
            
            return `${currencySymbol}${product.price}`;
        }
        
        /**
         * Get currency symbol
         */
        getCurrencySymbol(currency) {
            const symbols = {
                USD: '$',
                EUR: '€',
                GBP: '£',
                JPY: '¥'
            };
            return symbols[currency] || '$';
        }
        
        /**
         * Show all products in modern full-screen modal
         */
        showAllProducts(products) {
            const $showcase = this.createModernProductShowcase(products);
            
            console.log('showAllProducts called with products:', products);
            
            // Show showcase modal with animation
            $('body').append($showcase);
            
            // Trigger animation after DOM insertion
            setTimeout(() => {
                $showcase.addClass('active');
            }, 10);
            
            console.log('Modern product showcase should be visible now');
        }
        
        /**
         * Create modern product showcase modal
         */
        createModernProductShowcase(products) {
            const productCount = products.length;
            
            const showcaseHtml = `
                <div class="modern-product-showcase-modal">
                    <div class="showcase-modal-overlay">
                        <div class="showcase-modal-container">
                            <div class="showcase-modal-header">
                                <h2 class="showcase-title">
                                    <span class="title-icon">🛍️</span>
                                    Recommended Products
                                    <span class="product-count">${productCount} items</span>
                                </h2>
                                <button class="showcase-close-btn" onclick="this.closest('.modern-product-showcase-modal').remove()">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                            <div class="showcase-modal-body">
                                <div class="products-grid-showcase">
                                    ${this.renderProductsGrid(products)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            return $(showcaseHtml);
        }
        
        /**
         * Render products grid for showcase
         */
        renderProductsGrid(products) {
            return products.map(product => {
                const enhancedProduct = this.formatProductData(product);
                return this.renderTemplate('showcase-product-card-template', enhancedProduct);
            }).join('');
        }
        
        addMessage(type, message, data = null, saveToHistory = true) {
            const timestamp = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const templateId = type === 'user' ? 'user-message-template' : 'bot-message-template';
            
            const messageHtml = this.renderTemplate(templateId, {
                message: message,
                time: this.showTimestamps ? timestamp : ''
            });
            
            $('#chatbot-messages').append(messageHtml);
            // Only auto-scroll for bot messages if user hasn't manually scrolled up
            if (type === 'bot') {
                this.scrollToBottom(); // Use smart scroll for bot messages
            } else {
                this.scrollToBottom(true); // Always scroll for user messages
            }
            
            // Play sound for bot messages
            if (type === 'bot' && this.soundManager) {
                this.soundManager.play('message');
                
                // Show notification if chat is minimized
                if (this.isMinimized || document.hidden) {
                    this.soundManager.play('notification');
                    this.showNotificationBadge();
                }
            }
            
            // Add typing effect for bot messages (disabled to prevent scroll issues)
            // if (type === 'bot' && this.typingSpeed) {
            //     this.typeMessage(messageHtml, message);
            // }
            
            // Save to message history for persistence
            if (saveToHistory !== false) {
                this.messageHistory.push({
                    type: type,
                    message: message,
                    data: data,
                    timestamp: Date.now()
                });
                
                // Save to localStorage
                this.saveConversationHistory();
            }
            
            // Increment message count
            this.incrementMessageCount();
        }
        
        renderTemplate(templateId, data) {
            let template = this.templates[templateId];
            if (!template) {
                console.error('Template not found:', templateId);
                return '';
            }
            
            // Enhanced template processing with Handlebars/Mustache-like syntax
            return this.processTemplate(template, data);
        }
        
        /**
         * Process template with Handlebars/Mustache-like syntax
         */
        processTemplate(template, data) {
            let output = template;
            
            // Process conditional blocks {{#condition}} ... {{/condition}}
            output = output.replace(/\{\{#(\w+)\}\}(.*?)\{\{\/\1\}\}/gs, (match, condition, content) => {
                const value = this.getNestedValue(data, condition);
                if (value && value !== '' && value !== false && value !== null && value !== undefined) {
                    return this.processTemplate(content, data);
                }
                return '';
            });
            
            // Process inverse conditional blocks {{^condition}} ... {{/condition}}
            output = output.replace(/\{\{\^(\w+)\}\}(.*?)\{\{\/\1\}\}/gs, (match, condition, content) => {
                const value = this.getNestedValue(data, condition);
                if (!value || value === '' || value === false || value === null || value === undefined) {
                    return this.processTemplate(content, data);
                }
                return '';
            });
            
            // Process triple-brace variables (unescaped HTML) {{{variable}}}
            output = output.replace(/\{\{\{(\w+(?:\.\w+)*)\}\}\}/g, (match, key) => {
                const value = this.getNestedValue(data, key);
                return value || '';
            });
            
            // Process double-brace variables (escaped) {{variable}}
            output = output.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
                const value = this.getNestedValue(data, key);
                return this.escapeHtml(value || '');
            });
            
            return output;
        }
        
        /**
         * Get nested value from object (e.g., 'user.name' from {user: {name: 'John'}})
         */
        getNestedValue(obj, path) {
            if (!obj || !path) return '';
            
            const keys = path.split('.');
            let result = obj;
            
            for (const key of keys) {
                if (result && typeof result === 'object' && key in result) {
                    result = result[key];
                } else {
                    return '';
                }
            }
            
            return result;
        }
        
        /**
         * Escape HTML entities
         */
        escapeHtml(text) {
            if (typeof text !== 'string') return text;
            
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        showTypingIndicator() {
            if (!this.isTyping) {
                $('#typing-indicator').show();
                this.scrollToBottom();
                this.isTyping = true;
                
                // Play typing sound
                if (this.soundManager) {
                    this.soundManager.play('typing');
                }
            }
        }
        
        /**
         * Show notification badge with count
         */
        showNotificationBadge() {
            this.unreadCount++;
            const $badge = $('#notification-badge');
            $badge.find('.badge-count').text(this.unreadCount);
            $badge.show();
        }
        
        /**
         * Hide notification badge
         */
        hideNotificationBadge() {
            this.unreadCount = 0;
            $('#notification-badge').hide();
        }
        
        /**
         * Typing effect for bot messages
         */
        typeMessage(messageElement, fullMessage) {
            const $messageText = $(messageElement).find('.message-text');
            const originalText = $messageText.text();
            $messageText.text('');
            
            let currentIndex = 0;
            const typeChar = () => {
                if (currentIndex < originalText.length) {
                    $messageText.text($messageText.text() + originalText.charAt(currentIndex));
                    currentIndex++;
                    this.scrollToBottom();
                    setTimeout(typeChar, this.typingSpeed);
                }
            };
            
            typeChar();
        }
        
        hideTypingIndicator() {
            $('#typing-indicator').hide();
            this.isTyping = false;
        }
        
        setSendButtonState(enabled) {
            $('#send-message-btn').prop('disabled', !enabled);
        }
        
        autoResizeTextarea(textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 80) + 'px';
        }
        
        scrollToBottom(force = false) {
            const $messages = $('#chatbot-messages');
            
            // If force is true, always scroll (for new messages from bot)
            if (force) {
                $messages.animate({
                    scrollTop: $messages[0].scrollHeight
                }, 300);
                return;
            }
            
            // Check if user is near the bottom (within 100px) - increased threshold
            const scrollTop = $messages.scrollTop();
            const scrollHeight = $messages[0].scrollHeight;
            const clientHeight = $messages.height();
            const isNearBottom = (scrollTop + clientHeight >= scrollHeight - 100);
            
            // Only auto-scroll if user is near the bottom OR if it's the first message
            const messageCount = $messages.find('.message').length;
            if (isNearBottom || messageCount <= 2) {
                $messages.animate({
                    scrollTop: scrollHeight
                }, 300);
            }
        }
        
        isScrolledToBottom($container) {
            const threshold = 30; // pixels from bottom
            const scrollTop = $container.scrollTop();
            const scrollHeight = $container[0].scrollHeight;
            const clientHeight = $container.height();
            
            return (scrollTop + clientHeight >= scrollHeight - threshold);
        }
        
        updateConnectionStatus(status) {
            const $statusText = $('#bot-status .status-text');
            const $statusIndicator = $('#bot-status .status-indicator');
            
            if (status === 'online') {
                $statusText.text(aiSalesmanFrontend.strings.online || 'Online');
                $statusIndicator.css('background', '#4ade80');
            } else {
                $statusText.text('Offline');
                $statusIndicator.css('background', '#f87171');
            }
        }
        
        processMessageQueue() {
            while (this.messageQueue.length > 0) {
                const messageData = this.messageQueue.shift();
                if (this.socket) {
                    this.socket.emit('user_message', messageData);
                }
            }
        }
        
        showError(message) {
            this.addMessage('bot', `❌ ${message}`);
        }
        
        copyCouponCode(code) {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(code).then(() => {
                    this.showToast(aiSalesmanFrontend.strings.coupon_copied);
                });
            } else {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = code;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                this.showToast(aiSalesmanFrontend.strings.coupon_copied);
            }
        }
        
        showToast(message) {
            // Create toast element
            const $toast = $(`<div class="ai-toast">${message}</div>`);
            $('body').append($toast);
            
            // Show toast
            setTimeout(() => $toast.addClass('show'), 100);
            
            // Hide and remove toast
            setTimeout(() => {
                $toast.removeClass('show');
                setTimeout(() => $toast.remove(), 300);
            }, 3000);
        }
        
        addToCart(productId) {
            // Add to WooCommerce cart via AJAX
            $.ajax({
                url: wc_add_to_cart_params.ajax_url,
                type: 'POST',
                data: {
                    action: 'woocommerce_add_to_cart',
                    product_id: productId,
                    quantity: 1
                },
                success: (response) => {
                    if (response.error) {
                        this.showToast('Failed to add product to cart');
                    } else {
                        this.showToast('Product added to cart!');
                        
                        // Track engagement
                        this.engagementTracker.trackAddToCart(productId);
                        
                        // Update cart count if element exists
                        if ($('.cart-count').length) {
                            const currentCount = parseInt($('.cart-count').text()) || 0;
                            $('.cart-count').text(currentCount + 1);
                        }
                    }
                },
                error: () => {
                    this.showToast('Failed to add product to cart');
                }
            });
        }
        
        shouldShowRatingModal() {
            const messageCount = this.getMessageCount();
            
            // Don't show modal if there aren't enough messages for meaningful interaction
            if (messageCount < 2) {
                return false;
            }
            
            // Check if feedback has already been handled for this session
            if (this.sessionId && this.isFeedbackHandled(this.sessionId)) {
                return false;
            }
            
            return true;
        }

        /**
         * Check if feedback has been handled (submitted or declined) for a specific conversation
         */
        isFeedbackHandled(sessionId) {
            if (!sessionId) return false;
            
            try {
                const handledFeedback = JSON.parse(localStorage.getItem('ai_salesman_handled_feedback') || '{}');
                return handledFeedback[sessionId] || false;
            } catch (error) {
                console.warn('Failed to check feedback status:', error);
                return false;
            }
        }

        /**
         * Mark feedback as handled for a specific conversation
         */
        markFeedbackHandled(sessionId, action = 'completed') {
            if (!sessionId) return;
            
            try {
                const handledFeedback = JSON.parse(localStorage.getItem('ai_salesman_handled_feedback') || '{}');
                handledFeedback[sessionId] = {
                    handled: true,
                    action: action, // 'submitted', 'skipped'
                    timestamp: Date.now(),
                    date: new Date().toISOString()
                };
                
                // Cleanup old entries (keep only last 50 sessions to prevent storage bloat)
                const entries = Object.entries(handledFeedback);
                if (entries.length > 50) {
                    // Sort by timestamp and keep newest 50
                    const sortedEntries = entries
                        .sort(([,a], [,b]) => (b.timestamp || 0) - (a.timestamp || 0))
                        .slice(0, 50);
                    
                    const cleanedFeedback = Object.fromEntries(sortedEntries);
                    localStorage.setItem('ai_salesman_handled_feedback', JSON.stringify(cleanedFeedback));
                } else {
                    localStorage.setItem('ai_salesman_handled_feedback', JSON.stringify(handledFeedback));
                }
                
                console.log(`Feedback marked as handled for session ${sessionId} (${action})`);
            } catch (error) {
                console.warn('Failed to mark feedback as handled:', error);
            }
        }

        showRatingModal() {
            $('#rating-modal').show();
        }
        
        hideRatingModal() {
            $('#rating-modal').hide();
        }
        
        setRating(rating) {
            this.currentRating = rating;
            $('#rating-stars .star').each(function(index) {
                if (index < rating) {
                    $(this).addClass('active');
                } else {
                    $(this).removeClass('active');
                }
            });
        }
        
        submitRating() {
            if (this.currentRating === 0) {
                this.showToast('Please select a rating');
                return;
            }
            
            const feedback = $('#rating-feedback').val();
            
            // Mark feedback as handled immediately to prevent re-showing
            this.markFeedbackHandled(this.sessionId, 'submitted');
            
            $.ajax({
                url: aiSalesmanFrontend.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'ai_salesman_rate_session',
                    session_id: this.sessionId,
                    rating: this.currentRating,
                    feedback: feedback,
                    nonce: aiSalesmanFrontend.nonce
                },
                success: (response) => {
                    if (response.success) {
                        this.showToast(aiSalesmanFrontend.strings.thank_you);
                        this.hideRatingModal();
                    }
                },
                error: () => {
                    this.showToast('Failed to submit rating');
                }
            });
        }
        
        skipRating() {
            // Mark feedback as handled to prevent re-showing for this conversation
            this.markFeedbackHandled(this.sessionId, 'skipped');
            
            this.hideRatingModal();
        }
        
        getMessageCount() {
            return $('#chatbot-messages .message').length;
        }
        
        incrementMessageCount() {
            // This could be used for analytics
        }
        
        /**
         * Send emoji reaction
         */
        sendEmojiReaction(emoji) {
            // Show emoji reaction animation
            this.showEmojiAnimation(emoji);
            
            // Send reaction as a special message
            if (this.sessionId) {
                const reactionData = {
                    session_id: this.sessionId,
                    reaction: emoji,
                    type: 'emoji_reaction',
                    nonce: aiSalesmanFrontend.nonce
                };
                
                // Track reaction via AJAX
                $.post(aiSalesmanFrontend.ajaxUrl, {
                    action: 'ai_salesman_track_engagement',
                    ...reactionData
                });
            }
        }
        
        /**
         * Show emoji animation
         */
        showEmojiAnimation(emoji) {
            const $animation = $(`<div class="emoji-animation">${emoji}</div>`);
            $('#chatbot-window').append($animation);
            
            $animation.css({
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%) scale(2)',
                fontSize: '2em',
                zIndex: 1000,
                animation: 'emojiPop 1s ease-out forwards'
            });
            
            setTimeout(() => $animation.remove(), 1000);
        }
        
        /**
         * Load conversation history from localStorage
         */
        loadConversationHistory() {
            if (!this.conversationPersistence) return;
            
            const history = localStorage.getItem('ai_chatbot_conversation');
            if (history) {
                try {
                    const messages = JSON.parse(history);
                    messages.forEach(msg => {
                        this.addMessage(msg.type, msg.message, msg.data, false); // Don't save while loading
                    });
                    this.messageHistory = messages;
                } catch (error) {
                    console.warn('Failed to load conversation history:', error);
                }
            }
        }
        
        /**
         * Save conversation to localStorage
         */
        saveConversationHistory() {
            if (!this.conversationPersistence) return;
            
            try {
                localStorage.setItem('ai_chatbot_conversation', JSON.stringify(this.messageHistory.slice(-20))); // Keep last 20 messages
            } catch (error) {
                console.warn('Failed to save conversation history:', error);
            }
        }
    }
    
    /**
     * Engagement Tracker Class
     */
    class EngagementTracker {
        constructor() {
            this.sessionId = null;
            this.startTime = Date.now();
            this.productTimes = {};
            this.productClicks = {};
            this.scrollPercentage = 0;
        }
        
        init() {
            this.bindEvents();
        }
        
        startSession(sessionId) {
            this.sessionId = sessionId;
            this.startTime = Date.now();
        }
        
        bindEvents() {
            // Track scroll percentage
            $(window).on('scroll', this.throttle(() => {
                const scrollTop = $(window).scrollTop();
                const docHeight = $(document).height();
                const winHeight = $(window).height();
                const scrollPercent = Math.round(scrollTop / (docHeight - winHeight) * 100);
                
                this.scrollPercentage = Math.max(this.scrollPercentage, scrollPercent);
            }, 250));
            
            // Track time on product pages
            if (aiSalesmanFrontend.currentPage.type === 'product') {
                this.trackProductTime(aiSalesmanFrontend.currentPage.productId);
            }
            
            // Send engagement data before page unload
            $(window).on('beforeunload', () => {
                this.sendEngagementData();
            });
            
            // Send engagement data periodically
            setInterval(() => {
                this.sendEngagementData();
            }, 30000); // Every 30 seconds
        }
        
        trackProductTime(productId) {
            if (!productId || !this.sessionId) return;
            
            if (!this.productTimes[productId]) {
                this.productTimes[productId] = {
                    startTime: Date.now(),
                    totalTime: 0
                };
            }
        }
        
        trackClick(productId) {
            if (!productId || !this.sessionId) return;
            
            this.productClicks[productId] = (this.productClicks[productId] || 0) + 1;
            
            // Send immediate engagement data for clicks
            this.sendEngagementData(productId);
        }
        
        trackPageView() {
            if (!this.sessionId) return;
            
            const productId = aiSalesmanFrontend.currentPage.productId;
            if (productId) {
                this.sendEngagementData(productId, { page_view: true });
            }
        }
        
        trackAddToCart(productId) {
            if (!productId || !this.sessionId) return;
            
            this.sendEngagementData(productId, { add_to_cart: true });
        }
        
        sendEngagementData(productId = null, additionalData = {}) {
            if (!this.sessionId) return;
            
            const data = {
                action: 'ai_salesman_track_engagement',
                session_id: this.sessionId,
                nonce: aiSalesmanFrontend.nonce,
                ...additionalData
            };
            
            if (productId) {
                data.product_id = productId;
                
                // Calculate time spent
                if (this.productTimes[productId]) {
                    const now = Date.now();
                    const timeSpent = Math.round((now - this.productTimes[productId].startTime) / 1000);
                    data.time_spent = timeSpent;
                }
                
                // Add click count
                if (this.productClicks[productId]) {
                    data.clicks = this.productClicks[productId];
                }
                
                // Add scroll percentage
                if (aiSalesmanFrontend.currentPage.productId === productId) {
                    data.scroll_percentage = this.scrollPercentage;
                }
            }
            
            // Send via AJAX (don't wait for response)
            $.ajax({
                url: aiSalesmanFrontend.ajaxUrl,
                type: 'POST',
                data: data,
                async: true
            });
        }
        
        throttle(func, delay) {
            let timeoutId;
            let lastExecTime = 0;
            return function () {
                const context = this;
                const args = arguments;
                const currentTime = Date.now();
                
                if (currentTime - lastExecTime > delay) {
                    func.apply(context, args);
                    lastExecTime = currentTime;
                } else {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(function () {
                        func.apply(context, args);
                        lastExecTime = Date.now();
                    }, delay - (currentTime - lastExecTime));
                }
            };
        }
    }
    
    // Initialize chatbot when DOM is ready
    $(document).ready(function() {
        console.log('AI Salesman: DOM ready, checking frontend config');
        
        // Check if we should load the chatbot
        if (typeof aiSalesmanFrontend !== 'undefined') {
            console.log('AI Salesman: Frontend config found, initializing chatbot');
            console.log('AI Salesman: Options:', aiSalesmanFrontend.options);
            
            try {
                window.aiSalesmanChatbot = new AISalesmanChatbot();
                console.log('AI Salesman: Chatbot instance created successfully');
            } catch (error) {
                console.error('AI Salesman: Failed to create chatbot instance:', error);
                
                // Fallback: Show widget without advanced features
                setTimeout(function() {
                    const $widget = $('#ai-salesman-chatbot');
                    if ($widget.length) {
                        $widget.css({
                            'display': 'block',
                            'opacity': '1',
                            'visibility': 'visible'
                        });
                        console.log('AI Salesman: Fallback widget display activated');
                    }
                }, 1000);
            }
        } else {
            console.error('AI Salesman: Frontend configuration not found');
        }
    });
    
    // Add toast styles dynamically
    $('<style>')
        .prop('type', 'text/css')
        .html(`
            .ai-toast {
                position: fixed;
                bottom: 100px;
                right: 20px;
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 14px;
                z-index: 1000000;
                transform: translateY(100px);
                opacity: 0;
                transition: all 0.3s ease;
            }
            .ai-toast.show {
                transform: translateY(0);
                opacity: 1;
            }
        `)
        .appendTo('head');
        
})(jQuery);