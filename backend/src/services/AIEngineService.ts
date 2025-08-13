import OpenAI from 'openai';
import { config } from '../config/config';
import { logger, logAIInteraction, createTimer } from '../utils/logger';
import { redisCache } from '../config/redis';
import { AIRequest, AIResponse, Product, Coupon, ChatMessage } from '../types';
import { ProductModel } from '../models/Product';
import { CouponService } from './CouponService';
import { AnalyticsService } from './AnalyticsService';

interface LangGraphNode {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embeddings?: number[];
  score?: number;
}

interface ConversationContext {
  sessionId: string;
  userId?: string;
  siteId: string;
  userInterests: string[];
  previousMessages: ChatMessage[];
  currentIntent?: string;
  sentimentHistory: number[];
  productPreferences: {
    categories: string[];
    priceRange?: { min: number; max: number };
    features: string[];
  };
}

export class AIEngineService {
  private openai: OpenAI;
  private couponService: CouponService;
  private analyticsService: AnalyticsService;

  constructor() {
    const isOpenRouter = process.env.OPENAI_API_BASE?.includes('openrouter.ai');
    
    this.openai = new OpenAI({
      apiKey: config.openai.apiKey,
      baseURL: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1',
      defaultHeaders: isOpenRouter ? {
        'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'https://localhost:3000',
        'X-Title': process.env.OPENROUTER_APP_NAME || 'AI Salesman Chatbot',
      } : undefined,
    });
    this.couponService = new CouponService();
    this.analyticsService = new AnalyticsService();
  }

  async processMessage(request: AIRequest): Promise<AIResponse> {
    const timer = createTimer('AI message processing');

    try {
      // Build conversation context
      const context = await this.buildConversationContext(request);

      // Analyze user intent and sentiment
      const analysis = await this.analyzeUserMessage(request.message, context);

      // Generate AI response
      const aiResponse = await this.generateAIResponse(request, context, analysis);

      // Post-process response (add products, coupons, etc.)
      const enhancedResponse = await this.enhanceResponse(aiResponse, context, analysis, request.message);

      // Cache response for similar queries
      await this.cacheResponse(request, enhancedResponse);

      // Log interaction
      this.logInteraction(request, enhancedResponse, timer.end());

      return enhancedResponse;

    } catch (error: any) {
      logger.error('AI Engine processing error', {
        error: error.message,
        sessionId: request.sessionId,
        siteId: request.siteId
      });

      // Return fallback response
      return this.getFallbackResponse(request, error);
    }
  }

  private async buildConversationContext(request: AIRequest): Promise<ConversationContext> {
    const cacheKey = `conversation_context:${request.sessionId}`;
    let context = await redisCache.get<ConversationContext>(cacheKey);

    if (!context) {
      context = {
        sessionId: request.sessionId,
        userId: request.userId,
        siteId: request.siteId,
        userInterests: [],
        previousMessages: request.context?.previousMessages || [],
        sentimentHistory: [],
        productPreferences: {
          categories: [],
          features: []
        }
      };
    }

    // Update context with current request
    if (request.context?.previousMessages) {
      context.previousMessages = request.context.previousMessages;
    }

    // Extract user interests from conversation history
    context.userInterests = await this.extractUserInterests(context.previousMessages);

    // Analyze product preferences
    context.productPreferences = await this.analyzeProductPreferences(context.previousMessages);

    // Cache updated context
    await redisCache.set(cacheKey, context, config.caching.aiResponseCacheTtl);

    return context;
  }

  private async analyzeUserMessage(message: string, context: ConversationContext) {
    const timer = createTimer('Message analysis');

    try {
      const analysisPrompt = `
Analyze the following user message and provide structured analysis:

Message: "${message}"

Previous context:
- User interests: ${context.userInterests.join(', ')}
- Session history: ${context.previousMessages.length} messages
- Current intent: ${context.currentIntent || 'unknown'}

Please analyze:
1. Primary intent (greeting, product_inquiry, price_question, comparison, purchase_intent, complaint, goodbye)
2. Sentiment (-1.0 to 1.0)
3. Confidence level (0.0 to 1.0)
4. Extracted entities (products, categories, features, price mentions)
5. Urgency level (low, medium, high)
6. Purchase readiness (researching, considering, ready_to_buy)

Respond with valid JSON only:
`;

      const completion = await this.openai.chat.completions.create({
        model: config.openai.model,
        messages: [
          {
            role: 'system',
            content: 'You are an expert at analyzing user messages for e-commerce chatbots. Always respond with valid JSON.'
          },
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      });

      const analysisText = completion.choices[0]?.message?.content || '{}';
      const analysis = JSON.parse(analysisText);

      timer.end({ analysis: analysis.intent });

      return {
        intent: analysis.intent || 'unknown',
        sentiment: analysis.sentiment || 0,
        confidence: analysis.confidence || 0.5,
        entities: analysis.entities || {},
        urgency: analysis.urgency || 'medium',
        purchaseReadiness: analysis.purchaseReadiness || 'researching',
        ...analysis
      };

    } catch (error: any) {
      logger.warn('Message analysis failed, using fallback', {
        error: error.message,
        sessionId: context.sessionId
      });

      timer.end();

      // Fallback analysis
      return {
        intent: this.inferIntentFromKeywords(message),
        sentiment: this.calculateSimpleSentiment(message),
        confidence: 0.3,
        entities: {},
        urgency: 'medium',
        purchaseReadiness: 'researching'
      };
    }
  }

  private async generateAIResponse(
    request: AIRequest,
    context: ConversationContext,
    analysis: any
  ): Promise<AIResponse> {
    const timer = createTimer('AI response generation');

    try {
      // Get relevant product knowledge from LangGraph
      const productKnowledge = await this.getProductKnowledge(request.message, context.siteId);
      
      // Store product knowledge in context for later use in enhanceResponse
      context['productKnowledge'] = productKnowledge;

      // Build system prompt
      const systemPrompt = this.buildSystemPrompt(context.siteId, analysis, productKnowledge);

      // Build conversation history
      const messages = this.buildConversationMessages(context.previousMessages, request.message);

      const isClaudeModel = config.openai.model.includes('claude');
      
      const completionParams: any = {
        model: config.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages
        ],
        max_tokens: config.openai.maxTokens,
        temperature: config.openai.temperature,
      };

      // Add function calling for compatible models
      if (!isClaudeModel) {
        completionParams.functions = this.getAvailableFunctions();
        completionParams.function_call = 'auto';
      } else {
        // For Claude, include function descriptions in system prompt
        const functionDescriptions = this.getAvailableFunctions()
          .map(fn => `Function: ${fn.name} - ${fn.description}`)
          .join('\n');
        completionParams.messages[0].content += `\n\nAvailable functions:\n${functionDescriptions}`;
      }

      const completion = await this.openai.chat.completions.create(completionParams);

      const responseMessage = completion.choices[0]?.message;
      const tokenUsage = completion.usage?.total_tokens || 0;

      timer.end({ tokens: tokenUsage });

      // Handle function calls
      let actions: any[] = [];
      if (responseMessage?.function_call) {
        actions = await this.handleFunctionCall(responseMessage.function_call, context);
      } else if (isClaudeModel && responseMessage?.content) {
        // For Claude, parse function calls from response content
        actions = await this.parseFunctionCallsFromContent(responseMessage.content, context);
      }

      return {
        message: responseMessage?.content || 'I apologize, but I encountered an issue. Could you please rephrase your question?',
        intent: analysis.intent,
        confidence: analysis.confidence,
        sentiment: analysis.sentiment,
        actions,
        metadata: {
          tokenUsage,
          model: config.openai.model,
          processingTime: Date.now()
        }
      };

    } catch (error: any) {
      logger.error('AI response generation failed', {
        error: error.message,
        sessionId: context.sessionId
      });

      timer.end();
      throw error;
    }
  }

  private async enhanceResponse(
    response: AIResponse,
    context: ConversationContext,
    analysis: any,
    query: string
  ): Promise<AIResponse> {
    const enhanced = { ...response };

    try {
      // INTELLIGENT PRODUCT INCLUSION: Only include products when truly relevant
      const productKnowledge = context['productKnowledge'] || [];
      const hasProductKnowledge = productKnowledge.some(node => node.metadata?.type === 'product');
      
      // Analyze query for product-specific keywords  
      const queryLower = query.toLowerCase();
      const isInventoryQuery = /\b(how many|total|count)\s+(products?|items?|laptops?|computers?)\b/i.test(query);
      const isShowAllQuery = /\b(show|display|see|list)\s+(all|entire|complete|every)\s+(products?|items?|laptops?|computers?|inventory|catalog)\b/i.test(query);
      const isProductRequest = /\b(show|suggest|recommend|find|looking for|need|want|buy)\s+(products?|laptop|computer|gaming|design)\b/i.test(query);
      const isSpecificProductQuery = /\b(asus|msi|lenovo|hp|katana|strix|vivobook|expertbook|zenbook)\b/i.test(query);
      
      // SMART LOGIC: Only include products when:
      // 1. User explicitly asks for product suggestions/recommendations  
      // 2. User asks to see all products
      // 3. LangGraph found specific product matches
      // 4. User mentions specific brands/models
      // 5. Intent is clearly product-focused
      const shouldIncludeProducts = (
        isProductRequest ||
        isShowAllQuery ||
        hasProductKnowledge ||
        isSpecificProductQuery ||
        ['product_inquiry', 'comparison', 'purchase_intent'].includes(analysis.intent)
      );
      
      // For inventory count queries, don't include product list - just mention the count in text
      if (isInventoryQuery) {
        const totalProducts = await ProductModel.countDocuments({ siteId: context.siteId, status: 'publish' });
        enhanced.metadata = enhanced.metadata || {};
        enhanced.metadata.totalProductCount = totalProducts;
        logger.info('Inventory query detected - providing count only', { totalProducts });
        return enhanced; // Return without products list
      }
      
      if (shouldIncludeProducts) {
        
        // First, try to get products from LangGraph knowledge
        let relevantProducts: Product[] = [];
        
        if (hasProductKnowledge) {
          // Extract product IDs from LangGraph nodes
          const productIds = productKnowledge
            .filter(node => node.metadata?.type === 'product')
            .map(node => node.metadata.id)
            .filter(id => id);
          
          // Fetch full product details
          if (productIds.length > 0) {
            // Get ALL products instead of limiting to 5 - user wants to see all inventory
            for (const productId of productIds) {
              const product = await ProductModel.findOne({ 
                id: productId, 
                siteId: context.siteId 
              });
              if (product) {
                relevantProducts.push(product);
              }
            }
          }
        }
        
        // If no products from LangGraph, fall back to other methods
        if (relevantProducts.length === 0) {
          relevantProducts = await this.getRelevantProducts(analysis, context);
        }
        
        // If we have products, intelligently limit and prioritize them
        if (relevantProducts && relevantProducts.length > 0) {
          // SMART LIMITING: Different limits based on query type
          let maxProducts = 6; // Default: 6 products (3 for chat + 3 for modal preview)
          
          if (isShowAllQuery) {
            maxProducts = 12; // Show more products when user explicitly asks for all
          } else if (isSpecificProductQuery) {
            maxProducts = 3; // Show fewer when user asks about specific products
          }
          
          // Priority: In stock > High ratings > Recent products
          const prioritizedProducts = relevantProducts
            .sort((a, b) => {
              // Priority 1: In stock products first
              if (a.stockStatus === 'instock' && b.stockStatus !== 'instock') return -1;
              if (b.stockStatus === 'instock' && a.stockStatus !== 'instock') return 1;
              
              // Priority 2: Higher ratings
              const ratingA = a.averageRating || 0;
              const ratingB = b.averageRating || 0;
              if (ratingA !== ratingB) return ratingB - ratingA;
              
              // Priority 3: More reviews (popularity)
              const reviewsA = a.reviewCount || 0;
              const reviewsB = b.reviewCount || 0;
              return reviewsB - reviewsA;
            })
            .slice(0, maxProducts); // Intelligent limiting based on query type
            
          enhanced.products = prioritizedProducts.map(product => {
            const salePrice = product.salePrice && product.salePrice > 0 ? product.salePrice : null;
            const regularPrice = product.regularPrice || product.price;
            const isOnSale = salePrice && salePrice < regularPrice;
            
            // Format price with proper currency symbols and sale indicators
            let priceHtml = '';
            if (isOnSale) {
              priceHtml = `<span class="sale-price">${product.currency || '$'}${salePrice}</span> <span class="regular-price">${product.currency || '$'}${regularPrice}</span> <span class="sale-badge">SALE</span>`;
            } else {
              priceHtml = `<span class="current-price">${product.currency || '$'}${product.price}</span>`;
            }
            
            // Generate rating HTML
            const rating = product.averageRating || 0;
            const fullStars = Math.floor(rating);
            const hasHalfStar = rating % 1 >= 0.5;
            let starsHtml = '';
            
            for (let i = 0; i < 5; i++) {
              if (i < fullStars) {
                starsHtml += '★';
              } else if (i === fullStars && hasHalfStar) {
                starsHtml += '☆';
              } else {
                starsHtml += '☆';
              }
            }
            
            return {
              id: product.id,
              name: product.name,
              price: product.price,
              price_html: priceHtml,
              currency: product.currency || 'USD',
              regular_price: regularPrice,
              sale_price: salePrice,
              on_sale: isOnSale,
              short_description: product.shortDescription || product.description?.substring(0, 180) || '',
              image_url: product.images && product.images.length > 0 ? product.images[0].src : '/wp-content/uploads/woocommerce-placeholder.png',
              permalink: product.permalink,
              rating: rating,
              rating_html: starsHtml,
              review_count: product.reviewCount || 0,
              in_stock: product.stockStatus === 'instock',
              stock_status: product.stockStatus,
              categories: product.categories ? product.categories.map(c => c.name).join(', ') : '',
              category_list: product.categories ? product.categories.map(c => c.name) : [],
              badge: isOnSale ? 'Sale' : (product.stockStatus !== 'instock' ? 'Out of Stock' : ''),
              availability_text: product.stockStatus === 'instock' ? 'In Stock' : 'Out of Stock'
            };
          }) as any; // Type assertion to resolve the mismatch
          
          logger.info('Enhanced products added to response', {
            productCount: enhanced.products.length,
            intent: analysis.intent,
            sampleProducts: enhanced.products.slice(0, 2).map(p => ({ id: p.id, name: p.name }))
          });
        }
      }

      // Generate coupon if user shows purchase intent
      if (analysis.intent === 'purchase_intent' && analysis.purchaseReadiness === 'ready_to_buy') {
        enhanced.coupons = await this.generateCouponIfEligible(context, analysis);
      }

      // Determine if conversation should end
      enhanced.shouldEndConversation = analysis.intent === 'goodbye' || 
        (analysis.intent === 'purchase_intent' && enhanced.coupons?.length > 0);

      return enhanced;

    } catch (error: any) {
      logger.warn('Response enhancement failed', {
        error: error.message,
        sessionId: context.sessionId
      });
      return response;
    }
  }

  private async getProductKnowledge(query: string, siteId: string): Promise<LangGraphNode[]> {
    const timer = createTimer('LangGraph knowledge retrieval');

    try {
      // Check cache first
      const cacheKey = `product_knowledge:${siteId}:${Buffer.from(query).toString('base64').substring(0, 20)}`;
      const cached = await redisCache.get<LangGraphNode[]>(cacheKey);
      if (cached) {
        timer.end({ source: 'cache', nodes: cached.length });
        return cached;
      }

      // Check if user is asking for ALL products/inventory
      const isRequestingAllProducts = /\b(all|every|entire|complete|whole)\s+(products?|inventory|catalog|items?|laptops?|computers?)\b/i.test(query) ||
        /\b(show|give|list)\s+(me\s+)?(all|every|everything)\b/i.test(query) ||
        /\binventory\b/i.test(query);

      let products: Product[] = [];
      
      if (isRequestingAllProducts) {
        // Import ProductService to use the new getAllProducts method
        const { ProductService } = await import('./ProductService');
        const productService = new ProductService();
        products = await productService.getAllProducts(siteId, true); // Include out of stock
        logger.info('User requested all products - returning complete inventory', {
          siteId,
          query,
          totalProducts: products.length
        });
      } else {
        // Search products in database with text search
        products = await ProductModel.searchProducts(siteId, query, { status: 'publish' });
      }
      
      // If no search results, try to get ALL products from the site as fallback
      if (products.length === 0) {
        products = await ProductModel.findBySite(siteId, { status: 'publish' }).exec();
        logger.info('No search results, showing all products as fallback', {
          siteId,
          query,
          fallbackCount: products.length
        });
      }
      
      // Debug logging
      logger.info('Product search results', {
        siteId,
        query,
        productCount: products.length,
        sampleProducts: products.slice(0, 3).map(p => ({ id: p.id, name: p.name }))
      });
      
      // Convert products to LangGraph nodes (process ALL products, no limits)
      const nodes: LangGraphNode[] = products.map(product => ({
        id: product.id,
        content: `${product.name}: ${product.description}. Price: ${product.currency}${product.price}. Categories: ${product.categories.map(c => c.name).join(', ')}. Rating: ${product.averageRating}/5 (${product.reviewCount} reviews).`,
        metadata: {
          type: 'product',
          id: product.id,
          name: product.name,
          price: product.price,
          currency: product.currency,
          categories: product.categories.map(c => c.name),
          rating: product.averageRating,
          reviewCount: product.reviewCount,
          inStock: product.stockStatus === 'instock',
          permalink: product.permalink,
          shortDescription: product.shortDescription || product.description?.substring(0, 150),
          imageUrl: product.images && product.images.length > 0 ? product.images[0].src : null,
          salePrice: product.salePrice,
          regularPrice: product.regularPrice,
          onSale: product.salePrice && product.salePrice < product.regularPrice
        },
        score: 1.0 // Placeholder for actual similarity score
      }));

      // Add category knowledge
      const categories = [...new Set(products.flatMap(p => p.categories.map(c => c.name)))];
      categories.forEach(category => {
        nodes.push({
          id: `category_${category}`,
          content: `Product category: ${category}. Available products in this category.`,
          metadata: {
            type: 'category',
            name: category
          },
          score: 0.8
        });
      });

      // Cache results
      await redisCache.set(cacheKey, nodes, config.caching.productCacheTtl);

      timer.end({ source: 'database', nodes: nodes.length });
      return nodes;

    } catch (error: any) {
      logger.error('LangGraph knowledge retrieval failed', {
        error: error.message,
        query,
        siteId
      });
      timer.end();
      return [];
    }
  }

  private buildSystemPrompt(siteId: string, analysis: any, productKnowledge: LangGraphNode[]): string {
    const knowledgeText = productKnowledge
      .map(node => node.content)
      .join('\n');

    return `You are an AI sales assistant for an e-commerce website. Your role is to help customers find products, answer questions, and guide them toward making purchases.

CONTEXT:
- Customer intent: ${analysis.intent}
- Customer sentiment: ${analysis.sentiment > 0 ? 'positive' : analysis.sentiment < 0 ? 'negative' : 'neutral'}
- Purchase readiness: ${analysis.purchaseReadiness}
- Urgency: ${analysis.urgency}

AVAILABLE PRODUCTS:
${knowledgeText}

GUIDELINES:
1. Be helpful, friendly, and knowledgeable about the products
2. Ask clarifying questions when needed
3. When recommending products, provide detailed information including features, benefits, and pricing
4. Use engaging language that highlights product value propositions
5. Always be honest about product limitations and suitability
6. Encourage customers to ask questions about specific features or requirements
7. When suggesting multiple products, explain the differences and help customers choose
8. Include product ratings and customer feedback when available
9. Mention any special offers, discounts, or promotions available
3. Recommend products based on customer needs
4. Highlight key features, benefits, and value propositions
5. Address any concerns or objections
6. Guide customers toward making a purchase decision
7. Offer alternatives if the exact product isn't available
8. Be honest about limitations and stock status
9. Use natural, conversational language
10. Keep responses concise but informative

SALES TECHNIQUES:
- Build rapport and trust
- Understand customer needs before recommending
- Present solutions, not just products
- Create urgency when appropriate
- Handle objections professionally
- Use social proof (reviews, ratings) when available
- Offer value-added services or bundles

Remember: Your goal is to provide excellent customer service while helping drive sales. Always prioritize the customer's needs and satisfaction.`;
  }

  private buildConversationMessages(previousMessages: ChatMessage[], currentMessage: string) {
    const messages: any[] = [];

    // Add recent conversation history (limit to last 10 messages to avoid token limits)
    const recentMessages = previousMessages.slice(-10);
    
    recentMessages.forEach(msg => {
      messages.push({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content
      });
    });

    // Add current message
    messages.push({
      role: 'user',
      content: currentMessage
    });

    return messages;
  }

  private getAvailableFunctions() {
    return [
      {
        name: 'search_products',
        description: 'Search for products based on customer query',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            category: { type: 'string', description: 'Product category' },
            maxPrice: { type: 'number', description: 'Maximum price' },
            minPrice: { type: 'number', description: 'Minimum price' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_product_details',
        description: 'Get detailed information about a specific product',
        parameters: {
          type: 'object',
          properties: {
            productId: { type: 'string', description: 'Product ID' }
          },
          required: ['productId']
        }
      },
      {
        name: 'generate_coupon',
        description: 'Generate a discount coupon for the customer',
        parameters: {
          type: 'object',
          properties: {
            discountType: { type: 'string', enum: ['percentage', 'fixed_cart'] },
            amount: { type: 'number', description: 'Discount amount' },
            products: { type: 'array', items: { type: 'string' }, description: 'Applicable product IDs' }
          },
          required: ['discountType', 'amount']
        }
      },
      {
        name: 'request_human_transfer',
        description: 'Transfer conversation to a human agent',
        parameters: {
          type: 'object',
          properties: {
            reason: { type: 'string', description: 'Reason for transfer' }
          },
          required: ['reason']
        }
      }
    ];
  }

  private async handleFunctionCall(functionCall: any, context: ConversationContext) {
    const actions: any[] = [];

    try {
      const functionName = functionCall.name;
      const parameters = JSON.parse(functionCall.arguments || '{}');

      switch (functionName) {
        case 'search_products':
          const products = await this.searchProducts(parameters, context.siteId);
          actions.push({
            type: 'show_products',
            payload: { products }
          });
          break;

        case 'get_product_details':
          const product = await ProductModel.findOne({ 
            id: parameters.productId, 
            siteId: context.siteId 
          });
          if (product) {
            actions.push({
              type: 'show_products',
              payload: { products: [product] }
            });
          }
          break;

        case 'generate_coupon':
          const coupon = await this.couponService.generateCouponForSession(
            context.sessionId,
            context.siteId,
            parameters
          );
          if (coupon) {
            actions.push({
              type: 'generate_coupon',
              payload: { coupon }
            });
          }
          break;

        case 'request_human_transfer':
          actions.push({
            type: 'transfer_human',
            payload: { reason: parameters.reason }
          });
          break;
      }

    } catch (error: any) {
      logger.error('Function call handling error', {
        error: error.message,
        functionCall,
        sessionId: context.sessionId
      });
    }

    return actions;
  }

  private async searchProducts(parameters: any, siteId: string): Promise<Product[]> {
    try {
      const filters: any = { status: 'publish' };

      if (parameters.minPrice || parameters.maxPrice) {
        filters.price = {};
        if (parameters.minPrice) filters.price.$gte = parameters.minPrice;
        if (parameters.maxPrice) filters.price.$lte = parameters.maxPrice;
      }

      if (parameters.category) {
        filters['categories.name'] = new RegExp(parameters.category, 'i');
      }

      const products = await ProductModel.searchProducts(siteId, parameters.query, filters);
      return products; // Return ALL results, no artificial limits

    } catch (error: any) {
      logger.error('Product search error', {
        error: error.message,
        parameters,
        siteId
      });
      return [];
    }
  }

  private async getRelevantProducts(analysis: any, context: ConversationContext): Promise<Product[]> {
    try {
      const { entities } = analysis;
      let products: Product[] = [];

      // Search based on extracted entities
      if (entities && entities.products && entities.products.length > 0) {
        for (const productName of entities.products) {
          const found = await ProductModel.searchProducts(context.siteId, productName, { status: 'publish' });
          // Get all matching products instead of limiting to 3
          products.push(...found);
        }
      }

      // Search by categories
      if (entities && entities.categories && entities.categories.length > 0) {
        for (const category of entities.categories) {
          const found = await ProductModel.findByCategory(context.siteId, category);
          // Get all products in category instead of limiting to 3
          products.push(...found);
        }
      }

      // Fallback to user interests
      if (products.length === 0 && context.userInterests.length > 0) {
        const query = context.userInterests.join(' ');
        products = await ProductModel.searchProducts(context.siteId, query, { status: 'publish' });
      }

      // If still no products and intent is unknown or product-related, get the most recent message and search
      if (products.length === 0 && (analysis.intent === 'unknown' || analysis.intent === 'product_inquiry')) {
        // Get the most recent user message
        const lastUserMessage = context.previousMessages
          .filter(msg => msg.type === 'user')
          .pop();
        
        if (lastUserMessage) {
          // Search for products based on the user's message
          products = await ProductModel.searchProducts(context.siteId, lastUserMessage.content, { status: 'publish' });
          
          // If no search results, get ALL products as fallback
          if (products.length === 0) {
            products = await ProductModel.findBySite(context.siteId, { status: 'publish' }).exec();
            logger.info('Using all products as fallback for unknown intent', {
              siteId: context.siteId,
              intent: analysis.intent,
              productCount: products.length
            });
          }
        }
      }

      // Remove duplicates and limit
      const uniqueProducts = products.filter((product, index, self) => 
        index === self.findIndex(p => p.id === product.id)
      );

      return uniqueProducts; // Return ALL unique products, no artificial limits

    } catch (error: any) {
      logger.error('Get relevant products error', {
        error: error.message,
        sessionId: context.sessionId
      });
      return [];
    }
  }

  private async generateCouponIfEligible(
    context: ConversationContext,
    analysis: any
  ): Promise<Coupon[]> {
    try {
      // Check if user is eligible for coupon
      const eligibility = await this.couponService.checkCouponEligibility(
        context.sessionId,
        context.siteId,
        context.userId
      );

      if (!eligibility.eligible) {
        return [];
      }

      // Generate coupon based on analysis and context
      const couponParams = {
        discountType: 'percentage' as const,
        amount: Math.min(eligibility.maxDiscount, 15), // Cap at 15%
        validityDays: 7
      };

      const coupon = await this.couponService.generateCouponForSession(
        context.sessionId,
        context.siteId,
        couponParams
      );

      return coupon ? [coupon] : [];

    } catch (error: any) {
      logger.error('Coupon generation error', {
        error: error.message,
        sessionId: context.sessionId
      });
      return [];
    }
  }

  private async extractUserInterests(messages: ChatMessage[]): Promise<string[]> {
    const interests = new Set<string>();
    
    // Simple keyword extraction (can be enhanced with NLP)
    const keywords = [
      'electronics', 'clothing', 'shoes', 'books', 'home', 'garden',
      'sports', 'fitness', 'beauty', 'health', 'toys', 'automotive',
      'cheap', 'expensive', 'quality', 'durable', 'fast', 'reliable'
    ];

    messages.forEach(message => {
      if (message.type === 'user') {
        const content = message.content.toLowerCase();
        keywords.forEach(keyword => {
          if (content.includes(keyword)) {
            interests.add(keyword);
          }
        });
      }
    });

    return Array.from(interests);
  }

  private async analyzeProductPreferences(messages: ChatMessage[]) {
    // Analyze user's product preferences from conversation history
    const preferences = {
      categories: [] as string[],
      priceRange: undefined as { min: number; max: number } | undefined,
      features: [] as string[]
    };

    // Extract mentioned categories, price ranges, and features
    // This is a simplified implementation
    messages.forEach(message => {
      if (message.type === 'user') {
        const content = message.content.toLowerCase();
        
        // Extract price mentions
        const priceMatches = content.match(/\$?(\d+(?:\.\d{2})?)/g);
        if (priceMatches) {
          const prices = priceMatches.map(p => parseFloat(p.replace('$', '')));
          if (prices.length >= 2) {
            preferences.priceRange = {
              min: Math.min(...prices),
              max: Math.max(...prices)
            };
          }
        }
      }
    });

    return preferences;
  }

  private inferIntentFromKeywords(message: string): string {
    const lowerMessage = message.toLowerCase();

    const intentPatterns = {
      greeting: /^(hi|hello|hey|good morning|good afternoon|good evening)/i,
      product_inquiry: /(looking for|need|want|show me|find|search|recommend|suggest)/i,
      price_question: /(price|cost|how much|expensive|cheap|afford|budget)/i,
      comparison: /(compare|versus|vs|difference|better|best|which)/i,
      purchase_intent: /(buy|purchase|order|checkout|add to cart)/i,
      complaint: /(problem|issue|wrong|broken|defective|return|complaint)/i,
      goodbye: /(bye|goodbye|thanks|thank you|that's all)/i
    };

    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(lowerMessage)) {
        return intent;
      }
    }

    return 'unknown';
  }

  private calculateSimpleSentiment(message: string): number {
    const positiveWords = ['good', 'great', 'excellent', 'love', 'like', 'amazing', 'perfect'];
    const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'disappointed', 'wrong', 'broken'];

    const words = message.toLowerCase().split(/\s+/);
    let score = 0;

    words.forEach(word => {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    });

    return Math.max(-1, Math.min(1, score / words.length * 10));
  }

  private async cacheResponse(request: AIRequest, response: AIResponse) {
    try {
      const cacheKey = `ai_response:${Buffer.from(request.message).toString('base64')}:${request.siteId}`;
      await redisCache.set(cacheKey, response, config.caching.aiResponseCacheTtl);
    } catch (error: any) {
      logger.warn('Failed to cache AI response', { error: error.message });
    }
  }

  private logInteraction(request: AIRequest, response: AIResponse, duration: number) {
    logAIInteraction(
      'GPT-4',
      response.metadata?.tokenUsage || 0,
      config.openai.model,
      duration
    );

    // Track analytics
    this.analyticsService.trackAIInteraction({
      sessionId: request.sessionId,
      siteId: request.siteId,
      intent: response.intent || 'unknown',
      sentiment: response.sentiment || 0,
      confidence: response.confidence || 0,
      responseTime: duration,
      tokenUsage: response.metadata?.tokenUsage || 0,
      timestamp: new Date()
    });
  }

  private async parseFunctionCallsFromContent(content: string, context: ConversationContext): Promise<any[]> {
    const actions: any[] = [];
    
    try {
      // Look for function call patterns in Claude's response
      // This is a simple implementation - could be enhanced with better parsing
      
      // Check for product search requests
      const searchMatch = content.match(/search[_\s]products?\s*[:\-]?\s*(.+?)(?:\n|$)/i);
      if (searchMatch) {
        const query = searchMatch[1].trim().replace(/['"]/g, '');
        const products = await this.searchProducts({ query }, context.siteId);
        actions.push({
          type: 'show_products',
          payload: { products }
        });
      }
      
      // Check for coupon generation requests
      if (content.match(/generate[_\s]coupon|discount|offer/i)) {
        const coupon = await this.couponService.generateCouponForSession(
          context.sessionId,
          context.siteId,
          { discountType: 'percentage', amount: 10 }
        );
        if (coupon) {
          actions.push({
            type: 'generate_coupon',
            payload: { coupon }
          });
        }
      }
      
      // Check for human transfer requests
      if (content.match(/transfer|human|agent|representative/i)) {
        actions.push({
          type: 'transfer_human',
          payload: { reason: 'Customer requested human assistance' }
        });
      }
      
    } catch (error: any) {
      logger.error('Error parsing function calls from content', {
        error: error.message,
        sessionId: context.sessionId
      });
    }
    
    return actions;
  }

  private getFallbackResponse(request: AIRequest, error: any): AIResponse {
    const fallbackMessages = [
      "I apologize, but I'm having some technical difficulties right now. Could you please rephrase your question?",
      "I'm sorry, I didn't quite understand that. Could you tell me more about what you're looking for?",
      "Let me help you find what you need. What specific product or information are you looking for today?",
      "I'm here to help you with your shopping needs. What can I assist you with?"
    ];

    const randomMessage = fallbackMessages[Math.floor(Math.random() * fallbackMessages.length)];

    return {
      message: randomMessage,
      intent: 'unknown',
      confidence: 0.1,
      sentiment: 0,
      actions: [],
      metadata: {
        fallback: true,
        error: error.message
      }
    };
  }
}