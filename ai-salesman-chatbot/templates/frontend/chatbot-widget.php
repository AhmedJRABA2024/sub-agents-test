<?php
/**
 * Chatbot Widget Template
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Get persona settings
$chatbot_name = $this->options['chatbot_name'] ?? 'Gabriel';
$chatbot_persona = $this->options['chatbot_persona'] ?? 'friendly';
$chatbot_gender = $this->options['chatbot_gender'] ?? 'male';
$welcome_message = $this->options['welcome_message'] ?? sprintf(__('Hi there! I\'m %s, your personal shopping assistant. How can I help you find the perfect product today?', 'ai-salesman-chatbot'), $chatbot_name);
$header_text = $this->options['header_text'] ?? $welcome_message;
$button_text = $this->options['button_text'] ?? sprintf(__('Chat with %s', 'ai-salesman-chatbot'), $chatbot_name);
$show_timestamps = $this->options['show_timestamps'] ?? true;
$show_online_status = $this->options['show_online_status'] ?? true;

// Get avatar based on gender and persona
$avatar_icon = $this->get_persona_avatar($chatbot_gender, $chatbot_persona);
?>

<div id="ai-salesman-chatbot" class="ai-chatbot-widget">
    <!-- Chat Toggle Button -->
    <div class="chatbot-toggle" id="chatbot-toggle">
        <div class="toggle-icon">
            <svg class="chat-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 9H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M9 13H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="close-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="notification-badge" id="notification-badge" style="display: none;">
            <span class="badge-count">1</span>
        </div>
    </div>
    
    <!-- Chat Window -->
    <div class="chatbot-window" id="chatbot-window">
        <!-- Chat Header -->
        <div class="chatbot-header">
            <div class="header-content">
                <div class="bot-avatar">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <?php echo $avatar_icon; ?>
                    </svg>
                </div>
                <div class="header-info">
                    <div class="bot-name"><?php echo esc_html($chatbot_name); ?></div>
                    <?php if ($show_online_status): ?>
                    <div class="bot-status" id="bot-status">
                        <span class="status-indicator"></span>
                        <span class="status-text"><?php _e('Online', 'ai-salesman-chatbot'); ?></span>
                    </div>
                    <?php endif; ?>
                </div>
            </div>
            <div class="header-actions">
                <button class="minimize-btn" id="minimize-chat" title="<?php _e('Minimize chat', 'ai-salesman-chatbot'); ?>">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M6 12H18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
                <button class="close-btn" id="close-chat" title="<?php _e('Close chat', 'ai-salesman-chatbot'); ?>">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
        </div>
        
        <!-- Chat Messages -->
        <div class="chatbot-messages" id="chatbot-messages">
            <div class="welcome-message">
                <div class="message bot-message">
                    <div class="message-avatar">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C13.1046 2 14 2.89543 14 4C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4C10 2.89543 10.8954 2 12 2Z" fill="currentColor"/>
                            <path d="M21 9V7C21 6.44772 20.5523 6 20 6H4C3.44772 6 3 6.44772 3 7V9C3 9.55228 3.44772 10 4 10H20C20.5523 10 21 9.55228 21 9Z" fill="currentColor"/>
                            <path d="M20 12H4C3.44772 12 3 12.4477 3 13V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V13C21 12.4477 20.5523 12 20 12Z" fill="currentColor"/>
                            <circle cx="8" cy="16" r="1" fill="white"/>
                            <circle cx="16" cy="16" r="1" fill="white"/>
                        </svg>
                    </div>
                    <div class="message-content">
                        <div class="message-text"><?php echo esc_html($welcome_message); ?></div>
                        <?php if ($show_timestamps): ?>
                        <div class="message-time"><?php echo date_i18n(get_option('time_format')); ?></div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Typing Indicator -->
        <div class="typing-indicator" id="typing-indicator" style="display: none;">
            <div class="message bot-message">
                <div class="message-avatar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C13.1046 2 14 2.89543 14 4C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4C10 2.89543 10.8954 2 12 2Z" fill="currentColor"/>
                        <path d="M21 9V7C21 6.44772 20.5523 6 20 6H4C3.44772 6 3 6.44772 3 7V9C3 9.55228 3.44772 10 4 10H20C20.5523 10 21 9.55228 21 9Z" fill="currentColor"/>
                        <path d="M20 12H4C3.44772 12 3 12.4477 3 13V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V13C21 12.4477 20.5523 12 20 12Z" fill="currentColor"/>
                        <circle cx="8" cy="16" r="1" fill="white"/>
                        <circle cx="16" cy="16" r="1" fill="white"/>
                    </svg>
                </div>
                <div class="message-content">
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Chat Input -->
        <div class="chatbot-input">
            <div class="input-container">
                <textarea 
                    id="chat-message-input" 
                    class="message-input" 
                    placeholder="<?php _e('Type your message...', 'ai-salesman-chatbot'); ?>"
                    rows="1"
                ></textarea>
                <button id="send-message-btn" class="send-button" title="<?php _e('Send message', 'ai-salesman-chatbot'); ?>">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            
            <?php if ($this->options['emoji_reactions'] ?? true): ?>
            <!-- Emoji Reactions -->
            <div class="emoji-reactions" id="emoji-reactions" style="display: none;">
                <button class="emoji-btn" data-emoji="👍" title="<?php _e('Good', 'ai-salesman-chatbot'); ?>">👍</button>
                <button class="emoji-btn" data-emoji="👎" title="<?php _e('Bad', 'ai-salesman-chatbot'); ?>">👎</button>
                <button class="emoji-btn" data-emoji="😊" title="<?php _e('Happy', 'ai-salesman-chatbot'); ?>">😊</button>
                <button class="emoji-btn" data-emoji="❤️" title="<?php _e('Love it', 'ai-salesman-chatbot'); ?>">❤️</button>
                <button class="emoji-btn" data-emoji="🤔" title="<?php _e('Thinking', 'ai-salesman-chatbot'); ?>">🤔</button>
            </div>
            <?php endif; ?>
            
            <?php if ($this->options['response_suggestions'] ?? true): ?>
            <!-- Quick Suggestions -->
            <div class="quick-actions" id="quick-actions" style="display: none;">
                <!-- Quick action buttons will be added dynamically -->
            </div>
            <?php endif; ?>
        </div>
        
        <!-- Rating Modal -->
        <div class="rating-modal" id="rating-modal" style="display: none;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3><?php _e('Rate your experience', 'ai-salesman-chatbot'); ?></h3>
                </div>
                <div class="modal-body">
                    <div class="rating-stars" id="rating-stars">
                        <span class="star" data-rating="1">★</span>
                        <span class="star" data-rating="2">★</span>
                        <span class="star" data-rating="3">★</span>
                        <span class="star" data-rating="4">★</span>
                        <span class="star" data-rating="5">★</span>
                    </div>
                    <textarea 
                        id="rating-feedback" 
                        placeholder="<?php _e('Tell us about your experience (optional)', 'ai-salesman-chatbot'); ?>"
                        rows="3"
                    ></textarea>
                    <div class="modal-actions">
                        <button class="button secondary" id="skip-rating"><?php _e('Skip', 'ai-salesman-chatbot'); ?></button>
                        <button class="button primary" id="submit-rating"><?php _e('Submit', 'ai-salesman-chatbot'); ?></button>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Product Showcase Modal -->
    <div class="product-showcase" id="product-showcase" style="display: none;">
        <div class="product-showcase-content">
            <div class="showcase-header">
                <h3><?php _e('Recommended Products', 'ai-salesman-chatbot'); ?></h3>
                <button class="close-showcase" id="close-showcase">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </button>
            </div>
            <div class="showcase-content" id="showcase-content">
                <!-- Products will be added dynamically -->
            </div>
        </div>
    </div>
</div>

<!-- Hidden templates for dynamic content -->
<script type="text/template" id="user-message-template">
    <div class="message user-message">
        <div class="message-content">
            <div class="message-text">{{message}}</div>
            <div class="message-time">{{time}}</div>
        </div>
    </div>
</script>

<script type="text/template" id="bot-message-template">
    <div class="message bot-message">
        <div class="message-avatar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C13.1046 2 14 2.89543 14 4C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4C10 2.89543 10.8954 2 12 2Z" fill="currentColor"/>
                <path d="M21 9V7C21 6.44772 20.5523 6 20 6H4C3.44772 6 3 6.44772 3 7V9C3 9.55228 3.44772 10 4 10H20C20.5523 10 21 9.55228 21 9Z" fill="currentColor"/>
                <path d="M20 12H4C3.44772 12 3 12.4477 3 13V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V13C21 12.4477 20.5523 12 20 12Z" fill="currentColor"/>
                <circle cx="8" cy="16" r="1" fill="white"/>
                <circle cx="16" cy="16" r="1" fill="white"/>
            </svg>
        </div>
        <div class="message-content">
            <div class="message-text">{{message}}</div>
            <div class="message-time">{{time}}</div>
        </div>
    </div>
</script>

<script type="text/template" id="product-card-template">
    <div class="product-card" data-product-id="{{product_id}}">
        <div class="product-image">
            <img src="{{image_url}}" alt="{{name}}" loading="lazy">
        </div>
        <div class="product-info">
            <h4 class="product-name">{{name}}</h4>
            <div class="product-price">{{price}}</div>
            <div class="product-description">{{short_description}}</div>
            <div class="product-actions">
                <a href="{{permalink}}" class="button secondary" target="_blank">
                    <?php _e('View Product', 'ai-salesman-chatbot'); ?>
                </a>
                <button class="button primary add-to-cart-btn" data-product-id="{{product_id}}">
                    <?php _e('Add to Cart', 'ai-salesman-chatbot'); ?>
                </button>
            </div>
        </div>
    </div>
</script>

<script type="text/template" id="product-inline-template">
    <div class="product-inline" data-product-id="{{product_id}}">
        <div class="product-thumbnail">
            <img src="{{image_url}}" alt="{{name}}">
        </div>
        <div class="product-details">
            <div class="product-name">{{name}}</div>
            <div class="product-price">{{price}}</div>
            <div class="product-actions">
                <a href="{{permalink}}" class="product-link" target="_blank"><?php _e('View', 'ai-salesman-chatbot'); ?></a>
            </div>
        </div>
    </div>
</script>

<script type="text/template" id="coupon-template">
    <div class="coupon-offer">
        <div class="coupon-icon">🎫</div>
        <div class="coupon-details">
            <div class="coupon-text">{{text}}</div>
            <div class="coupon-code">
                <span class="code">{{code}}</span>
                <button class="copy-code-btn" data-code="{{code}}">
                    <?php _e('Copy', 'ai-salesman-chatbot'); ?>
                </button>
            </div>
            <div class="coupon-expiry"><?php _e('Expires:', 'ai-salesman-chatbot'); ?> {{expiry}}</div>
        </div>
    </div>
</script>

<!-- Enhanced product templates -->
<script type="text/template" id="product-inline-enhanced-template">
    <div class="product-card-enhanced-inline" data-product-id="{{product_id}}">
        <div class="product-image-inline">
            <img src="{{image_url}}" alt="{{name}}" loading="lazy" width="70" height="70">
            {{#badge}}
            <span class="product-badge">{{badge}}</span>
            {{/badge}}
        </div>
        <div class="product-info-inline">
            <h4 class="product-name">{{name}}</h4>
            <div class="product-price">{{{price_html}}}</div>
            <div class="product-rating">
                <span class="stars">{{rating_html}}</span>
                <span class="review-count">({{review_count}})</span>
            </div>
            <div class="product-availability {{#in_stock}}in-stock{{/in_stock}}{{^in_stock}}out-stock{{/in_stock}}">
                {{availability_text}}
            </div>
            <div class="product-actions-inline">
                <a href="{{permalink}}" class="btn-view" target="_blank">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View
                </a>
                <button class="btn-cart" data-product-id="{{product_id}}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="m1 1 4 4 2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Add
                </button>
            </div>
        </div>
    </div>
</script>

<script type="text/template" id="product-card-enhanced-template">
    <div class="product-card-enhanced" data-product-id="{{product_id}}">
        <div class="product-image">
            <img src="{{image_url}}" alt="{{name}}" loading="lazy">
        </div>
        <div class="product-info">
            <h4 class="product-name">{{name}}</h4>
            <div class="product-price">{{{price}}}</div>
            <div class="product-rating">
                <span class="stars">⭐</span>
                <span class="rating-value">{{rating}}</span>
                <span class="review-count">({{review_count}} reviews)</span>
            </div>
            <div class="product-description">{{short_description}}</div>
            <div class="product-categories">{{categories}}</div>
            <div class="product-actions">
                <a href="{{permalink}}" class="button secondary" target="_blank">
                    <?php _e('View Product', 'ai-salesman-chatbot'); ?>
                </a>
                <button class="button primary add-to-cart-btn" data-product-id="{{product_id}}">
                    <?php _e('Add to Cart', 'ai-salesman-chatbot'); ?>
                </button>
            </div>
        </div>
    </div>
</script>

<!-- Enhanced Inline Product Card Template -->
<script type="text/template" id="product-card-enhanced-inline-template">
    <div class="product-card-enhanced-inline" data-product-id="{{product_id}}">
        <div class="product-image-inline">
            <img src="{{image_url}}" alt="{{name}}" loading="lazy" width="70" height="70">
            {{#badge}}
            <span class="product-badge">{{badge}}</span>
            {{/badge}}
        </div>
        <div class="product-info-inline">
            <h4 class="product-name">{{name}}</h4>
            <div class="product-price">{{{price_html}}}</div>
            <div class="product-rating">
                <span class="stars">{{rating_html}}</span>
                <span class="review-count">({{review_count}})</span>
            </div>
            <div class="product-availability {{#in_stock}}in-stock{{/in_stock}}{{^in_stock}}out-stock{{/in_stock}}">
                {{availability_text}}
            </div>
            <div class="product-actions-inline">
                <a href="{{permalink}}" class="btn-view" target="_blank">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View
                </a>
                <button class="btn-cart" data-product-id="{{product_id}}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="m1 1 4 4 2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Add
                </button>
            </div>
        </div>
    </div>
</script>

<!-- Modern Product Card Template for Chat -->
<script type="text/template" id="modern-product-card-template">
    <div class="modern-product-card" data-product-id="{{product_id}}">
        <div class="modern-card-content">
            <div class="modern-product-image">
                <img src="{{image_url}}" alt="{{name}}" loading="lazy">
                {{#badge}}
                <span class="modern-product-badge">{{badge}}</span>
                {{/badge}}
            </div>
            <div class="modern-product-info">
                <h4 class="modern-product-name">{{name}}</h4>
                <div class="modern-product-price">{{{price_html}}}</div>
                <div class="modern-product-rating">
                    <span class="stars">{{rating_html}}</span>
                    <span class="rating-text">{{rating}} ({{review_count}} reviews)</span>
                </div>
                <div class="modern-product-stock {{#in_stock}}in-stock{{/in_stock}}{{^in_stock}}out-of-stock{{/in_stock}}">
                    {{stock_status}}
                </div>
                <div class="modern-product-actions">
                    <a href="{{permalink}}" class="modern-btn modern-btn-secondary" target="_blank">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                        View Details
                    </a>
                    <button class="modern-btn modern-btn-primary modern-add-to-cart-btn" data-product-id="{{product_id}}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="9" cy="21" r="1"></circle>
                            <circle cx="20" cy="21" r="1"></circle>
                            <path d="m1 1 4 4 2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                        </svg>
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    </div>
</script>

<!-- Showcase Product Card Template for Modal -->
<script type="text/template" id="showcase-product-card-template">
    <div class="showcase-product-card" data-product-id="{{product_id}}">
        <div class="showcase-product-image">
            <img src="{{image_url}}" alt="{{name}}" loading="lazy">
            {{#badge}}
            <span class="showcase-product-badge">{{badge}}</span>
            {{/badge}}
        </div>
        <div class="showcase-product-info">
            <h3 class="showcase-product-name">{{name}}</h3>
            <div class="showcase-product-price">{{{price_html}}}</div>
            <div class="showcase-product-rating">
                <span class="stars">{{rating_html}}</span>
                <span class="rating-text">{{rating}} ({{review_count}} reviews)</span>
            </div>
            <div class="showcase-product-description">{{short_description}}</div>
            <div class="showcase-product-stock {{#in_stock}}in-stock{{/in_stock}}{{^in_stock}}out-of-stock{{/in_stock}}">
                {{stock_status}}
            </div>
            <div class="showcase-product-actions">
                <a href="{{permalink}}" class="modern-btn modern-btn-secondary" target="_blank">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    </svg>
                    View Details
                </a>
                <button class="modern-btn modern-btn-primary modern-add-to-cart-btn" data-product-id="{{product_id}}">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="9" cy="21" r="1"></circle>
                        <circle cx="20" cy="21" r="1"></circle>
                        <path d="m1 1 4 4 2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                    </svg>
                    Add to Cart
                </button>
            </div>
        </div>
    </div>
</script>