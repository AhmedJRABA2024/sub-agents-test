<?php
/**
 * Frontend class
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class AI_Salesman_Frontend {
    
    private static $instance = null;
    private $options;
    
    /**
     * Get single instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Constructor
     */
    private function __construct() {
        $this->options = get_option('ai_salesman_chatbot_options', array());
        
        // Hook into template_redirect to check if we should load the chatbot
        // This ensures WooCommerce conditional functions are available
        add_action('template_redirect', array($this, 'init_chatbot_conditionally'));
        
        // Add debug info for administrators when query param is present
        if (isset($_GET['ai_chatbot_debug']) && current_user_can('manage_options')) {
            add_action('wp_footer', array($this, 'debug_chatbot_status'));
        }
    }
    
    /**
     * Initialize chatbot conditionally after WooCommerce is loaded
     */
    public function init_chatbot_conditionally() {
        // Refresh options in case they were changed
        $this->options = get_option('ai_salesman_chatbot_options', array());
        
        if ($this->should_load_chatbot()) {
            add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
            add_action('wp_footer', array($this, 'render_chatbot_widget'));
            add_action('wp_head', array($this, 'add_dynamic_css'));
            
            // Log for debugging
            error_log('AI Salesman Chatbot: Initializing chatbot - should load returned true');
        } else {
            error_log('AI Salesman Chatbot: Not initializing chatbot - should load returned false');
        }
    }
    
    /**
     * Check if chatbot should be loaded
     */
    private function should_load_chatbot() {
        // First check if chatbot is enabled - this is the most important check
        $chatbot_enabled = $this->options['chatbot_enabled'] ?? false;
        
        // Handle both string and boolean values
        if (empty($chatbot_enabled) || $chatbot_enabled === '0' || $chatbot_enabled === 0 || $chatbot_enabled === false) {
            error_log('AI Salesman Chatbot: Chatbot is disabled in settings (value: ' . var_export($chatbot_enabled, true) . ')');
            return false;
        }
        
        error_log('AI Salesman Chatbot: Chatbot is enabled in settings (value: ' . var_export($chatbot_enabled, true) . ')');
        
        // Skip setup requirement for now - auto-enable if chatbot is enabled
        if (!isset($this->options['setup_completed']) || !$this->options['setup_completed']) {
            // Auto-complete setup if chatbot is enabled
            if ($this->options['chatbot_enabled']) {
                $updated_options = $this->options;
                $updated_options['setup_completed'] = true;
                update_option('ai_salesman_chatbot_options', $updated_options);
                $this->options = $updated_options;
            } else {
                return false;
            }
        }
        
        // Check if we're on the right pages
        $show_on_pages = $this->options['show_on_pages'] ?? array('shop', 'product', 'cart');
        
        // Ensure it's an array and handle empty array (no pages selected)
        if (!is_array($show_on_pages)) {
            $show_on_pages = array();
        }
        
        // If no pages are selected, don't show widget anywhere
        if (empty($show_on_pages)) {
            error_log('AI Salesman Chatbot: No pages selected for display - widget disabled');
            return false;
        }
        
        // If 'all' is in show_on_pages, display everywhere
        if (in_array('all', $show_on_pages)) {
            return true;
        }
        
        // Check if WooCommerce is available and functions exist
        if (!function_exists('is_shop') || !function_exists('is_product') || !function_exists('is_cart')) {
            // If WooCommerce functions don't exist, log it but don't bypass page checks
            error_log('AI Salesman Chatbot: WooCommerce functions not available - falling back to generic page checks');
            
            // Fall back to generic WordPress conditionals for basic page detection
            // Only show on specific pages if they're in the allowed list
            if (is_front_page() && in_array('home', $show_on_pages)) {
                return true;
            }
            
            // For other pages when WooCommerce not available, only show if 'all' is selected
            return in_array('all', $show_on_pages);
        }
        
        if (is_shop() && in_array('shop', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on shop page - shop is enabled in settings');
            return true;
        }
        
        if (is_product() && in_array('product', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on product page - product is enabled in settings');
            return true;
        }
        
        if (is_cart() && in_array('cart', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on cart page - cart is enabled in settings');
            return true;
        }
        
        if (is_checkout() && in_array('checkout', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on checkout page - checkout is enabled in settings');
            return true;
        }
        
        if (function_exists('is_account_page') && is_account_page() && in_array('account', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on account page - account is enabled in settings');
            return true;
        }
        
        if (is_front_page() && in_array('home', $show_on_pages)) {
            error_log('AI Salesman Chatbot: Displaying on home page - home is enabled in settings');
            return true;
        }
        
        // Log detailed debug information
        error_log('AI Salesman Chatbot: Show on pages setting: ' . print_r($show_on_pages, true));
        error_log('AI Salesman Chatbot: Current page type: ' . $this->get_current_page_type());
        error_log('AI Salesman Chatbot: Current page conditions:');
        error_log('  - is_shop(): ' . (function_exists('is_shop') && is_shop() ? 'true' : 'false'));
        error_log('  - is_product(): ' . (function_exists('is_product') && is_product() ? 'true' : 'false'));
        error_log('  - is_cart(): ' . (function_exists('is_cart') && is_cart() ? 'true' : 'false'));
        error_log('  - is_checkout(): ' . (function_exists('is_checkout') && is_checkout() ? 'true' : 'false'));
        error_log('  - is_front_page(): ' . (is_front_page() ? 'true' : 'false'));
        error_log('AI Salesman Chatbot: No matching page conditions - widget will not be displayed');
        
        return false;
    }
    
    /**
     * Debug function to check chatbot status
     */
    public function debug_chatbot_status() {
        if (!current_user_can('manage_options')) {
            return;
        }
        
        $current_options = get_option('ai_salesman_chatbot_options', array());
        $debug_info = array(
            'Current Options from DB' => $current_options,
            'Loaded Options' => $this->options,
            'WooCommerce Active' => class_exists('WooCommerce') ? 'Yes' : 'No',
            'WooCommerce Functions Available' => array(
                'is_shop' => function_exists('is_shop') ? 'Yes' : 'No',
                'is_product' => function_exists('is_product') ? 'Yes' : 'No',
                'is_cart' => function_exists('is_cart') ? 'Yes' : 'No',
            ),
            'Current Page Checks' => array(
                'is_shop()' => function_exists('is_shop') ? (is_shop() ? 'TRUE' : 'FALSE') : 'N/A',
                'is_product()' => function_exists('is_product') ? (is_product() ? 'TRUE' : 'FALSE') : 'N/A',
                'is_cart()' => function_exists('is_cart') ? (is_cart() ? 'TRUE' : 'FALSE') : 'N/A',
                'is_front_page()' => is_front_page() ? 'TRUE' : 'FALSE'
            ),
            'Current Page Type' => $this->get_current_page_type(),
            'Should Load Chatbot' => $this->should_load_chatbot() ? 'YES' : 'NO',
            'Chatbot Enabled' => ($this->options['chatbot_enabled'] ?? false) ? 'TRUE' : 'FALSE',
            'Setup Completed' => ($this->options['setup_completed'] ?? false) ? 'TRUE' : 'FALSE',
            'Show On Pages' => $this->options['show_on_pages'] ?? 'Not Set'
        );
        
        echo '<div class="ai-chatbot-debug" style="position: fixed; top: 50px; right: 20px; background: white; border: 2px solid red; padding: 20px; z-index: 999999; max-width: 500px; font-size: 11px; max-height: 80vh; overflow-y: auto;">';
        echo '<h3 style="margin-top: 0;">AI Chatbot Debug Info</h3>';
        foreach ($debug_info as $key => $value) {
            echo '<strong>' . esc_html($key) . ':</strong><br>';
            if (is_array($value)) {
                echo '<pre style="font-size: 10px; background: #f5f5f5; padding: 5px; margin: 5px 0;">' . htmlspecialchars(print_r($value, true)) . '</pre>';
            } else {
                echo '<span style="color: #006600;">' . esc_html($value) . '</span><br><br>';
            }
        }
        echo '<button onclick="this.parentElement.style.display=\'none\'" style="margin-top: 10px;">Close</button>';
        echo '</div>';
    }
    
    /**
     * Enqueue frontend scripts and styles
     */
    public function enqueue_scripts() {
        // Debug logging
        error_log('AI Salesman Chatbot: Enqueuing frontend scripts and styles');
        
        wp_enqueue_style(
            'ai-salesman-frontend',
            AI_SALESMAN_CHATBOT_PLUGIN_URL . 'assets/css/frontend.css',
            array(),
            AI_SALESMAN_CHATBOT_VERSION
        );
        
        // Enqueue sound manager first
        wp_enqueue_script(
            'ai-salesman-sounds',
            AI_SALESMAN_CHATBOT_PLUGIN_URL . 'assets/js/chatbot-sounds.js',
            array(),
            AI_SALESMAN_CHATBOT_VERSION,
            true
        );
        
        wp_enqueue_script(
            'ai-salesman-frontend',
            AI_SALESMAN_CHATBOT_PLUGIN_URL . 'assets/js/frontend.js',
            array('jquery', 'ai-salesman-sounds'),
            AI_SALESMAN_CHATBOT_VERSION,
            true
        );
        
        // Socket.IO for real-time chat
        wp_enqueue_script(
            'socket-io',
            'https://cdn.socket.io/4.7.2/socket.io.min.js',
            array(),
            '4.7.2',
            true
        );
        
        // Get API URL from main plugin instance
        $main_plugin = AISalesmanChatbot::get_instance();
        $api_url = $main_plugin->get_api_url();
        
        // Localize script with options and endpoints
        wp_localize_script('ai-salesman-frontend', 'aiSalesmanFrontend', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'restUrl' => rest_url('ai-salesman/v1/'),
            'nonce' => wp_create_nonce('ai_salesman_frontend_nonce'),
            'socketUrl' => $api_url,
            'apiUrl' => $api_url,
            'options' => array(
                'backgroundColor' => $this->options['background_color'] ?? '#ffffff',
                'secondaryColor' => $this->options['secondary_color'] ?? '#007cba',
                'headerText' => $this->options['header_text'] ?? __('Hello! How can I help you find the perfect product?', 'ai-salesman-chatbot'),
                'buttonText' => $this->options['button_text'] ?? __('Chat with AI Assistant', 'ai-salesman-chatbot'),
                'autoOpen' => $this->options['auto_open'] ?? false,
                'engagementTracking' => $this->options['engagement_tracking'] ?? true,
                
                // NEW PERSONA & UX OPTIONS
                'chatbotName' => $this->options['chatbot_name'] ?? 'Gabriel',
                'chatbotPersona' => $this->options['chatbot_persona'] ?? 'friendly',
                'chatbotGender' => $this->options['chatbot_gender'] ?? 'male',
                'welcomeMessage' => $this->options['welcome_message'] ?? sprintf(__('Hi there! I\'m %s, your personal shopping assistant. How can I help you find the perfect product today?', 'ai-salesman-chatbot'), $this->options['chatbot_name'] ?? 'Gabriel'),
                'typingSpeed' => $this->options['typing_speed'] ?? 'normal',
                'soundEnabled' => $this->options['sound_enabled'] ?? true,
                'soundVolume' => $this->options['sound_volume'] ?? 0.5,
                'showTimestamps' => $this->options['show_timestamps'] ?? true,
                'showTypingIndicator' => $this->options['show_typing_indicator'] ?? true,
                'conversationPersistence' => $this->options['conversation_persistence'] ?? true,
                'emojiReactions' => $this->options['emoji_reactions'] ?? true,
                'showOnlineStatus' => $this->options['show_online_status'] ?? true,
                'responseSuggestions' => $this->options['response_suggestions'] ?? true,
                'themeMode' => $this->options['theme_mode'] ?? 'auto'
            ),
            'strings' => array(
                'typing' => __('AI is typing...', 'ai-salesman-chatbot'),
                'connection_error' => __('Connection error. Please try again.', 'ai-salesman-chatbot'),
                'send_message' => __('Send message', 'ai-salesman-chatbot'),
                'minimize' => __('Minimize chat', 'ai-salesman-chatbot'),
                'close' => __('Close chat', 'ai-salesman-chatbot'),
                'rate_experience' => __('Rate your experience', 'ai-salesman-chatbot'),
                'thank_you' => __('Thank you for your feedback!', 'ai-salesman-chatbot'),
                'view_product' => __('View Product', 'ai-salesman-chatbot'),
                'add_to_cart' => __('Add to Cart', 'ai-salesman-chatbot'),
                'copy_coupon' => __('Copy Coupon', 'ai-salesman-chatbot'),
                'coupon_copied' => __('Coupon code copied!', 'ai-salesman-chatbot')
            ),
            'currentPage' => array(
                'type' => $this->get_current_page_type(),
                'productId' => is_product() ? get_the_ID() : null,
                'categoryId' => is_product_category() ? get_queried_object_id() : null
            ),
            'user' => array(
                'isLoggedIn' => is_user_logged_in(),
                'userId' => get_current_user_id(),
                'email' => is_user_logged_in() ? wp_get_current_user()->user_email : null
            )
        ));
    }
    
    /**
     * Add dynamic CSS to head
     */
    public function add_dynamic_css() {
        $background_color = $this->options['background_color'] ?? '#ffffff';
        $secondary_color = $this->options['secondary_color'] ?? '#007cba';
        
        echo '<style id="ai-salesman-dynamic-css">
            :root {
                --ai-chatbot-bg-color: ' . esc_attr($background_color) . ';
                --ai-chatbot-secondary-color: ' . esc_attr($secondary_color) . ';
                --ai-chatbot-secondary-hover: ' . esc_attr($this->adjust_brightness($secondary_color, -20)) . ';
            }
        </style>';
    }
    
    /**
     * Get current page type
     */
    private function get_current_page_type() {
        if (is_product()) {
            return 'product';
        } elseif (is_shop()) {
            return 'shop';
        } elseif (is_product_category()) {
            return 'category';
        } elseif (is_cart()) {
            return 'cart';
        } elseif (is_checkout()) {
            return 'checkout';
        } elseif (is_account_page()) {
            return 'account';
        } elseif (is_front_page()) {
            return 'home';
        }
        return 'page';
    }
    
    /**
     * Adjust color brightness
     */
    private function adjust_brightness($hex, $steps) {
        $steps = max(-255, min(255, $steps));
        $hex = str_replace('#', '', $hex);
        
        if (strlen($hex) == 3) {
            $hex = str_repeat(substr($hex, 0, 1), 2) . str_repeat(substr($hex, 1, 1), 2) . str_repeat(substr($hex, 2, 1), 2);
        }
        
        $color_parts = str_split($hex, 2);
        $return = '#';
        
        foreach ($color_parts as $color) {
            $color = hexdec($color);
            $color = max(0, min(255, $color + $steps));
            $return .= str_pad(dechex($color), 2, '0', STR_PAD_LEFT);
        }
        
        return $return;
    }
    
    /**
     * Get persona avatar SVG based on gender and personality
     */
    public function get_persona_avatar($gender = 'male', $persona = 'friendly') {
        $avatars = array(
            'male' => array(
                'friendly' => '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>',
                'professional' => '<path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9V7L12 2L3 7V9C3 9.55 3.45 10 4 10H20C20.55 10 21 9.55 21 9ZM4 12V18C4 19.1 4.9 20 6 20H18C19.1 20 20 19.1 20 18V12H4Z" fill="currentColor"/>',
                'expert' => '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>'
            ),
            'female' => array(
                'friendly' => '<path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM12 14.2C9.5 14.2 7.5 12.2 7.5 9.7V6.5C7.5 5.1 8.6 4 10 4H14C15.4 4 16.5 5.1 16.5 6.5V9.7C16.5 12.2 14.5 14.2 12 14.2Z" fill="currentColor"/>',
                'professional' => '<path d="M12 2C14.2 2 16 3.8 16 6S14.2 10 12 10 8 8.2 8 6 9.8 2 12 2ZM12 12C16.42 12 20 13.79 20 16V18H4V16C4 13.79 7.58 12 12 12Z" fill="currentColor"/>',
                'expert' => '<path d="M12 2C13.65 2 15 3.35 15 5S13.65 8 12 8 9 6.65 9 5 10.35 2 12 2ZM12 10C15.87 10 19 11.45 19 13.25V16H5V13.25C5 11.45 8.13 10 12 10Z" fill="currentColor"/>'
            )
        );
        
        return $avatars[$gender][$persona] ?? $avatars['male']['friendly'];
    }
    
    /**
     * Render chatbot widget
     */
    public function render_chatbot_widget() {
        // Add debug comment for troubleshooting
        echo '<!-- AI Salesman Chatbot Widget Loading -->';
        
        if (file_exists(AI_SALESMAN_CHATBOT_PLUGIN_PATH . 'templates/frontend/chatbot-widget.php')) {
            include AI_SALESMAN_CHATBOT_PLUGIN_PATH . 'templates/frontend/chatbot-widget.php';
            echo '<!-- AI Salesman Chatbot Widget Loaded -->';
        } else {
            echo '<!-- AI Salesman Chatbot Widget Template NOT FOUND -->';
            error_log('AI Salesman Chatbot: Widget template not found at ' . AI_SALESMAN_CHATBOT_PLUGIN_PATH . 'templates/frontend/chatbot-widget.php');
        }
    }
    
    /**
     * AJAX: Start chat session
     */
    public static function ajax_start_chat_session() {
        if (!wp_verify_nonce($_POST['nonce'], 'ai_salesman_frontend_nonce')) {
            wp_die(__('Security check failed.', 'ai-salesman-chatbot'));
        }
        
        $database = AI_Salesman_Database::get_instance();
        
        $session_data = array(
            'user_email' => sanitize_email($_POST['user_email'] ?? ''),
            'user_ip' => $_SERVER['REMOTE_ADDR'],
            'user_agent' => $_SERVER['HTTP_USER_AGENT']
        );
        
        $session_id = $database->create_chat_session($session_data);
        
        if ($session_id) {
            wp_send_json_success(array(
                'session_id' => $session_id,
                'message' => __('Chat session started successfully.', 'ai-salesman-chatbot')
            ));
        } else {
            wp_send_json_error(__('Failed to start chat session.', 'ai-salesman-chatbot'));
        }
    }
    
    /**
     * AJAX: Send message
     */
    public static function ajax_send_message() {
        if (!wp_verify_nonce($_POST['nonce'], 'ai_salesman_frontend_nonce')) {
            wp_die(__('Security check failed.', 'ai-salesman-chatbot'));
        }
        
        $session_id = sanitize_text_field($_POST['session_id']);
        $message = sanitize_textarea_field($_POST['message']);
        $message_data = $_POST['message_data'] ?? null;
        
        $database = AI_Salesman_Database::get_instance();
        
        // Save user message
        $database->add_chat_message($session_id, 'user', $message, $message_data);
        
        // Forward to AI backend
        $options = get_option('ai_salesman_chatbot_options', array());
        
        // Get API URL from plugin instance
        $plugin_instance = ai_salesman_chatbot();
        $api_url = '';
        if ($plugin_instance && method_exists($plugin_instance, 'get_api_url')) {
            $api_url = $plugin_instance->get_api_url();
        }
        
        if (empty($api_url) || empty($options['api_key'])) {
            wp_send_json_error(__('Chatbot is not properly configured.', 'ai-salesman-chatbot'));
        }
        
        $api_data = array(
            'session_id' => $session_id,
            'message' => $message,
            'message_data' => $message_data,
            'context' => array(
                'current_page' => $_POST['current_page'] ?? array(),
                'user_data' => $_POST['user_data'] ?? array(),
                'store_url' => home_url()
            )
        );
        
        $response = wp_remote_post($api_url . '/chat', array(
            'headers' => array(
                'X-API-Key' => $options['api_key'],
                'Content-Type' => 'application/json'
            ),
            'body' => json_encode($api_data),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error($response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        $response_body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($status_code === 200 && $response_body) {
            // Extract AI response from nested structure
            $ai_message = '';
            if (isset($response_body['data']['ai_response']['message'])) {
                $ai_message = $response_body['data']['ai_response']['message'];
            } elseif (isset($response_body['message'])) {
                $ai_message = $response_body['message'];
            }
            
            // Save AI response
            $database->add_chat_message(
                $session_id, 
                'bot', 
                $ai_message, 
                $response_body['message_data'] ?? null,
                $response_body['products'] ?? null
            );
            
            // Extract products and metadata from response - try multiple nested locations
            $products = null;
            $metadata = array();
            
            // Check for products in various locations
            if (isset($response_body['data']['ai_response']['metadata']['products'])) {
                $products = $response_body['data']['ai_response']['metadata']['products'];
                $metadata = $response_body['data']['ai_response']['metadata'];
            } elseif (isset($response_body['data']['products'])) {
                $products = $response_body['data']['products'];
            } elseif (isset($response_body['products'])) {
                $products = $response_body['products'];
            } elseif (isset($response_body['data']['ai_response']['products'])) {
                $products = $response_body['data']['ai_response']['products'];
            }
            
            // Ensure metadata includes products
            if ($products && !isset($metadata['products'])) {
                $metadata['products'] = $products;
            }
            
            // Include coupons and actions if present
            if (isset($response_body['data']['ai_response']['metadata']['coupons'])) {
                $metadata['coupons'] = $response_body['data']['ai_response']['metadata']['coupons'];
            }
            if (isset($response_body['data']['ai_response']['metadata']['actions'])) {
                $metadata['actions'] = $response_body['data']['ai_response']['metadata']['actions'];
            }
            
            // Send the AI message in the expected format for frontend
            wp_send_json_success(array(
                'ai_response' => array(
                    'message' => $ai_message,
                    'metadata' => $metadata  // Include metadata with products
                ),
                'message' => $ai_message, // Backward compatibility
                'session_id' => $session_id,
                'message_data' => $response_body['message_data'] ?? null,
                'products' => $products,  // Keep for backward compatibility
                'metadata' => $metadata,  // Also include at top level
                'message_type' => !empty($products) ? 'product_recommendation' : 'text',
                'debug_info' => array(
                    'products_count' => count($products ?: []),
                    'has_products' => !empty($products),
                    'message_type' => !empty($products) ? 'product_recommendation' : 'text',
                    'first_product_name' => $products ? $products[0]['name'] ?? 'unknown' : 'none'
                )
            ));
        } else {
            wp_send_json_error(__('Failed to get response from AI.', 'ai-salesman-chatbot'));
        }
    }
    
    /**
     * AJAX: Track user engagement
     */
    public static function ajax_track_engagement() {
        if (!wp_verify_nonce($_POST['nonce'], 'ai_salesman_frontend_nonce')) {
            wp_die(__('Security check failed.', 'ai-salesman-chatbot'));
        }
        
        $session_id = sanitize_text_field($_POST['session_id']);
        $product_id = intval($_POST['product_id']);
        $engagement_data = array();
        
        if (isset($_POST['time_spent'])) {
            $engagement_data['time_spent'] = intval($_POST['time_spent']);
        }
        
        if (isset($_POST['clicks'])) {
            $engagement_data['clicks_count'] = intval($_POST['clicks']);
        }
        
        if (isset($_POST['scroll_percentage'])) {
            $engagement_data['scroll_percentage'] = min(100, intval($_POST['scroll_percentage']));
        }
        
        if (isset($_POST['page_view'])) {
            $engagement_data['page_views'] = 1;
        }
        
        if (isset($_POST['add_to_cart'])) {
            $engagement_data['add_to_cart'] = 1;
        }
        
        $database = AI_Salesman_Database::get_instance();
        $result = $database->update_user_engagement($session_id, $product_id, $engagement_data);
        
        if ($result !== false) {
            wp_send_json_success(__('Engagement tracked successfully.', 'ai-salesman-chatbot'));
        } else {
            wp_send_json_error(__('Failed to track engagement.', 'ai-salesman-chatbot'));
        }
    }
    
    /**
     * AJAX: Rate session
     */
    public static function ajax_rate_session() {
        if (!wp_verify_nonce($_POST['nonce'], 'ai_salesman_frontend_nonce')) {
            wp_die(__('Security check failed.', 'ai-salesman-chatbot'));
        }
        
        global $wpdb;
        
        $session_id = sanitize_text_field($_POST['session_id']);
        $rating = max(1, min(5, intval($_POST['rating'])));
        $feedback = sanitize_textarea_field($_POST['feedback'] ?? '');
        
        $table = $wpdb->prefix . 'ai_salesman_chat_sessions';
        
        $result = $wpdb->update(
            $table,
            array(
                'user_rating' => $rating,
                'user_feedback' => $feedback,
                'status' => 'ended'
            ),
            array('session_id' => $session_id)
        );
        
        if ($result !== false) {
            wp_send_json_success(__('Thank you for your feedback!', 'ai-salesman-chatbot'));
        } else {
            wp_send_json_error(__('Failed to save rating.', 'ai-salesman-chatbot'));
        }
    }
}

// Initialize AJAX handlers
add_action('wp_ajax_ai_salesman_start_chat_session', array('AI_Salesman_Frontend', 'ajax_start_chat_session'));
add_action('wp_ajax_nopriv_ai_salesman_start_chat_session', array('AI_Salesman_Frontend', 'ajax_start_chat_session'));

add_action('wp_ajax_ai_salesman_send_message', array('AI_Salesman_Frontend', 'ajax_send_message'));
add_action('wp_ajax_nopriv_ai_salesman_send_message', array('AI_Salesman_Frontend', 'ajax_send_message'));

add_action('wp_ajax_ai_salesman_track_engagement', array('AI_Salesman_Frontend', 'ajax_track_engagement'));
add_action('wp_ajax_nopriv_ai_salesman_track_engagement', array('AI_Salesman_Frontend', 'ajax_track_engagement'));

add_action('wp_ajax_ai_salesman_rate_session', array('AI_Salesman_Frontend', 'ajax_rate_session'));
add_action('wp_ajax_nopriv_ai_salesman_rate_session', array('AI_Salesman_Frontend', 'ajax_rate_session'));