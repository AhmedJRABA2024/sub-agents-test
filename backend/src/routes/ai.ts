import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { body, validationResult } from 'express-validator';
import { ChatService } from '../services/ChatService';
import { AIEngineService } from '../services/AIEngineService';

const router = Router();
const chatService = new ChatService();
const aiEngineService = new AIEngineService();

// Validation middleware
const validateRequest = (req: any, res: any, next: any) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Direct chat endpoint for plugin integration - handles both session creation and AI response
router.post('/chat', [
  body('session_id').optional().isString(),
  body('message').isString().notEmpty().isLength({ max: 2000 }),
  body('context').optional().isObject(),
  body('context.current_page').optional().isString(),
  body('context.user_data').optional().isObject(),
  body('context.store_url').optional().isURL(),
  body('context.store_name').optional().isString(),
  validateRequest
], asyncHandler(async (req: Request, res: Response) => {
  const { session_id, message, context } = req.body;
  const shopId = (req as any).shopId; // From tenant middleware

  if (!shopId) {
    return res.status(401).json({
      success: false,
      error: 'Shop authentication required'
    });
  }

  try {
    let sessionId = session_id;

    // If no session_id provided, create a new session
    if (!sessionId) {
      const newSession = await chatService.createChatSession({
        siteId: shopId,
        userId: context?.user_data?.user_id || 'anonymous',
        userInfo: {
          ip: req.ip,
          userAgent: req.get('User-Agent') || 'Unknown',
          referrer: context?.current_page || '',
          timestamp: new Date()
        },
        context: {
          currentUrl: context?.current_page || '',
          storeUrl: context?.store_url || '',
          storeName: context?.store_name || '',
          userAgent: req.get('User-Agent') || '',
          ...context
        }
      });
      sessionId = newSession.id;
    }

    // Send the user message
    const userMessage = await chatService.sendMessage({
      sessionId,
      message,
      type: 'user',
      userId: context?.user_data?.user_id,
      metadata: {
        source: 'plugin',
        context,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }
    });

    // Generate AI response using the real AI engine
    const aiRequest = {
      sessionId,
      message,
      siteId: shopId,
      userId: context?.user_data?.userId || 'anonymous',
      context: {
        previousMessages: [],
        currentPage: context?.current_page,
        userData: context?.user_data
      }
    };
    
    const aiResponse = await aiEngineService.processMessage(aiRequest);
    const responseText = aiResponse.message;
    
    // Send the AI message
    const aiMessage = await chatService.sendMessage({
      sessionId,
      message: responseText,
      type: 'bot',
      userId: 'ai-assistant',
      metadata: {
        source: 'ai',
        confidence: 0.85,
        processing_time: Date.now()
      }
    });

    // Return the complete conversation response with products and metadata
    const response = {
      success: true,
      data: {
        session_id: sessionId,
        user_message: {
          id: userMessage.id,
          message: userMessage.content || userMessage.message,
          timestamp: userMessage.createdAt
        },
        ai_response: {
          id: aiMessage.id,
          message: aiMessage.content || aiMessage.message,
          timestamp: aiMessage.createdAt,
          // Include products and metadata from AI response
          products: aiResponse.products || [],
          metadata: {
            products: aiResponse.products || [],
            coupons: aiResponse.coupons || [],
            actions: aiResponse.actions || [],
            intent: aiResponse.intent,
            confidence: aiResponse.confidence,
            sentiment: aiResponse.sentiment,
            ...aiResponse.metadata
          }
        },
        // Also include products at data level for WordPress compatibility
        products: aiResponse.products || [],
        context: context || {}
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);

  } catch (error: any) {
    console.error('Chat processing error:', error);
    res.status(500).json({
      success: false,
      error: 'Chat processing failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
}));

// AI service endpoints
router.post('/analyze', asyncHandler(async (req: Request, res: Response) => {
  // Implement AI analysis logic
  res.json({
    success: true,
    message: 'Analysis completed',
    data: {
      intent: 'general',
      confidence: 0.85,
      response: 'AI analysis placeholder'
    },
    timestamp: new Date().toISOString()
  });
}));

router.post('/recommendations', asyncHandler(async (req: Request, res: Response) => {
  // Implement AI recommendations
  res.json({
    success: true,
    message: 'Recommendations generated',
    data: {
      products: [],
      confidence: 0.8
    },
    timestamp: new Date().toISOString()
  });
}));

// Helper function to generate AI responses
async function generateAIResponse(userMessage: string, context: any, shopId: string): Promise<string> {
  // For now, return a simple response based on the message content
  // In a real implementation, this would integrate with OpenAI, Claude, or other AI services
  
  const message = userMessage.toLowerCase();
  
  if (message.includes('hello') || message.includes('hi')) {
    return "Hello! Welcome to our store! I'm here to help you find the perfect products. What are you looking for today?";
  }
  
  if (message.includes('product') || message.includes('buy') || message.includes('purchase')) {
    return "I'd be happy to help you find the right products! Can you tell me more about what you're looking for? I can show you our best sellers or help you find something specific.";
  }
  
  if (message.includes('price') || message.includes('cost') || message.includes('discount')) {
    return "I can help you find great deals! We often have special discounts available. Let me know what products you're interested in and I can check for any current promotions.";
  }
  
  if (message.includes('help')) {
    return "I'm here to help! I can assist you with finding products, answering questions about our items, helping with sizes, checking availability, and finding the best deals. What would you like to know?";
  }
  
  // Default response
  return "Thank you for your message! I'm here to help you with any questions about our products or store. Could you tell me more about what you're looking for?";
}

export default router;