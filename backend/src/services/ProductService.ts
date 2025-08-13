import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { logger, createTimer } from '../utils/logger';
import { redisCache } from '../config/redis';
import { ProductModel } from '../models/Product';
import { Product } from '../types';

interface WooCommerceConfig {
  baseUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

interface SyncOptions {
  batchSize?: number;
  includeVariations?: boolean;
  includeReviews?: boolean;
  compressionEnabled?: boolean;
}

interface ProductSearchFilters {
  categories?: string[];
  tags?: string[];
  priceRange?: { min: number; max: number };
  stockStatus?: 'instock' | 'outofstock' | 'onbackorder';
  rating?: { min: number; max: number };
  onSale?: boolean;
}

interface WooCommerceProduct {
  id: number;
  name: string;
  slug: string;
  permalink: string;
  date_created: string;
  date_modified: string;
  type: string;
  status: 'publish' | 'draft' | 'private';
  featured: boolean;
  catalog_visibility: string;
  description: string;
  short_description: string;
  sku: string;
  price: string;
  regular_price: string;
  sale_price: string;
  date_on_sale_from: string | null;
  date_on_sale_to: string | null;
  price_html: string;
  on_sale: boolean;
  purchasable: boolean;
  total_sales: number;
  virtual: boolean;
  downloadable: boolean;
  downloads: any[];
  download_limit: number;
  download_expiry: number;
  external_url: string;
  button_text: string;
  tax_status: string;
  tax_class: string;
  manage_stock: boolean;
  stock_quantity: number | null;
  stock_status: 'instock' | 'outofstock' | 'onbackorder';
  backorders: string;
  backorders_allowed: boolean;
  backordered: boolean;
  sold_individually: boolean;
  weight: string;
  dimensions: {
    length: string;
    width: string;
    height: string;
  };
  shipping_required: boolean;
  shipping_taxable: boolean;
  shipping_class: string;
  shipping_class_id: number;
  reviews_allowed: boolean;
  average_rating: string;
  rating_count: number;
  related_ids: number[];
  upsell_ids: number[];
  cross_sell_ids: number[];
  parent_id: number;
  purchase_note: string;
  categories: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  tags: Array<{
    id: number;
    name: string;
    slug: string;
  }>;
  images: Array<{
    id: number;
    date_created: string;
    date_modified: string;
    src: string;
    name: string;
    alt: string;
    position: number;
  }>;
  attributes: Array<{
    id: number;
    name: string;
    position: number;
    visible: boolean;
    variation: boolean;
    options: string[];
  }>;
  default_attributes: any[];
  variations: number[];
  grouped_products: number[];
  menu_order: number;
  meta_data: any[];
}

export class ProductService {
  async syncProductsFromWooCommerce(
    siteId: string,
    config: WooCommerceConfig,
    options: SyncOptions = {}
  ): Promise<{ success: boolean; synced: number; errors: string[] }> {
    const timer = createTimer('WooCommerce product sync');
    const defaultOptions: Required<SyncOptions> = {
      batchSize: options.batchSize || 500,
      includeVariations: options.includeVariations ?? true,
      includeReviews: options.includeReviews ?? true,
      compressionEnabled: options.compressionEnabled ?? true
    };

    const errors: string[] = [];
    let totalSynced = 0;

    try {
      logger.info('Starting WooCommerce product sync', {
        siteId,
        baseUrl: config.baseUrl,
        batchSize: defaultOptions.batchSize
      });

      // First, get total count of products
      const totalCount = await this.getWooCommerceProductCount(config);
      logger.info(`Found ${totalCount} products to sync`, { siteId });

      // Sync in batches
      const totalPages = Math.ceil(totalCount / defaultOptions.batchSize);

      for (let page = 1; page <= totalPages; page++) {
        try {
          const products = await this.fetchWooCommerceProducts(config, {
            page,
            per_page: defaultOptions.batchSize,
            status: 'any'
          });

          logger.info(`Processing batch ${page}/${totalPages} (${products.length} products)`, {
            siteId
          });

          // Transform and save products
          const transformedProducts = await Promise.all(
            products.map(product => this.transformWooCommerceProduct(product, siteId))
          );

          // Bulk upsert products
          const syncedCount = await this.bulkUpsertProducts(transformedProducts);
          totalSynced += syncedCount;

          // Sync reviews if enabled
          if (defaultOptions.includeReviews) {
            await this.syncProductReviews(siteId, config, products);
          }

          logger.info(`Batch ${page}/${totalPages} completed`, {
            siteId,
            syncedInBatch: syncedCount
          });

          // Add delay between batches to avoid overwhelming the WooCommerce server
          if (page < totalPages) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (batchError: any) {
          const errorMsg = `Batch ${page} failed: ${batchError.message}`;
          errors.push(errorMsg);
          logger.error('Batch sync error', {
            error: batchError.message,
            page,
            siteId
          });
        }
      }

      // Update sync timestamp
      await this.updateSyncTimestamp(siteId);

      // Clear product cache
      await this.clearProductCache(siteId);

      timer.end({ synced: totalSynced, errors: errors.length });

      logger.info('WooCommerce sync completed', {
        siteId,
        totalSynced,
        errors: errors.length,
        duration: timer.end()
      });

      return {
        success: errors.length === 0 || totalSynced > 0,
        synced: totalSynced,
        errors
      };

    } catch (error: any) {
      timer.end();
      logger.error('WooCommerce sync failed', {
        error: error.message,
        siteId
      });

      return {
        success: false,
        synced: totalSynced,
        errors: [error.message]
      };
    }
  }

  async searchProducts(
    siteId: string,
    query: string,
    filters: ProductSearchFilters = {},
    limit: number = 20,
    offset: number = 0
  ): Promise<Product[]> {
    const timer = createTimer('Product search');

    try {
      // Build search query
      const searchQuery: any = {
        siteId,
        status: 'publish'
      };

      // Add text search
      if (query.trim()) {
        searchQuery.$text = { $search: query };
      }

      // Add category filter
      if (filters.categories && filters.categories.length > 0) {
        searchQuery['categories.name'] = { $in: filters.categories };
      }

      // Add tag filter
      if (filters.tags && filters.tags.length > 0) {
        searchQuery.tags = { $in: filters.tags };
      }

      // Add price range filter
      if (filters.priceRange) {
        searchQuery.price = {};
        if (filters.priceRange.min) searchQuery.price.$gte = filters.priceRange.min;
        if (filters.priceRange.max) searchQuery.price.$lte = filters.priceRange.max;
      }

      // Add stock status filter
      if (filters.stockStatus) {
        searchQuery.stockStatus = filters.stockStatus;
      }

      // Add rating filter
      if (filters.rating) {
        searchQuery.averageRating = {};
        if (filters.rating.min) searchQuery.averageRating.$gte = filters.rating.min;
        if (filters.rating.max) searchQuery.averageRating.$lte = filters.rating.max;
      }

      // Add on sale filter
      if (filters.onSale) {
        searchQuery.salePrice = { $exists: true, $ne: null };
        searchQuery.$expr = { $lt: ['$salePrice', '$regularPrice'] };
      }

      // Execute search
      const products = await ProductModel.find(searchQuery)
        .sort(query.trim() ? { score: { $meta: 'textScore' }, averageRating: -1 } : { averageRating: -1, createdAt: -1 })
        .skip(offset)
        .limit(limit);

      timer.end({ results: products.length });

      return products.map(product => product.toObject() as Product);

    } catch (error: any) {
      timer.end();
      logger.error('Product search failed', {
        error: error.message,
        siteId,
        query
      });
      return [];
    }
  }

  async getProductById(productId: string, siteId: string): Promise<Product | null> {
    try {
      // Check cache first
      const cacheKey = `product:${siteId}:${productId}`;
      const cached = await redisCache.get<Product>(cacheKey);
      if (cached) {
        return cached;
      }

      // Get from database
      const product = await ProductModel.findOne({ id: productId, siteId });
      if (!product) {
        return null;
      }

      const productObject = product.toObject() as Product;

      // Cache for future requests
      await redisCache.set(cacheKey, productObject, 1800); // 30 minutes

      return productObject;

    } catch (error: any) {
      logger.error('Failed to get product by ID', {
        error: error.message,
        productId,
        siteId
      });
      return null;
    }
  }

  async getProductsByCategory(
    siteId: string,
    categoryId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<Product[]> {
    try {
      const products = await ProductModel.findByCategory(siteId, categoryId)
        .skip(offset)
        .limit(limit);

      return products.map(product => product.toObject() as Product);

    } catch (error: any) {
      logger.error('Failed to get products by category', {
        error: error.message,
        siteId,
        categoryId
      });
      return [];
    }
  }

  async getRelatedProducts(siteId: string, productId: string, limit: number = 5): Promise<Product[]> {
    try {
      const products = await ProductModel.findRelated(siteId, productId, limit);
      return products.map(product => product.toObject() as Product);

    } catch (error: any) {
      logger.error('Failed to get related products', {
        error: error.message,
        siteId,
        productId
      });
      return [];
    }
  }

  async getTopRatedProducts(siteId: string, limit: number = 10): Promise<Product[]> {
    try {
      const cacheKey = `top_rated:${siteId}:${limit}`;
      const cached = await redisCache.get<Product[]>(cacheKey);
      if (cached) {
        return cached;
      }

      const products = await ProductModel.findTopRated(siteId, limit);
      const productObjects = products.map(product => product.toObject() as Product);

      // Cache for 1 hour
      await redisCache.set(cacheKey, productObjects, 3600);

      return productObjects;

    } catch (error: any) {
      logger.error('Failed to get top rated products', {
        error: error.message,
        siteId
      });
      return [];
    }
  }

  async getOnSaleProducts(siteId: string, limit: number = 20, offset: number = 0): Promise<Product[]> {
    try {
      const products = await ProductModel.findOnSale(siteId)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit);

      return products.map(product => product.toObject() as Product);

    } catch (error: any) {
      logger.error('Failed to get on sale products', {
        error: error.message,
        siteId
      });
      return [];
    }
  }

  async getAllProducts(siteId: string, includeOutOfStock: boolean = true): Promise<Product[]> {
    try {
      const query: any = { siteId, status: 'publish' };
      
      // Optionally filter out out-of-stock products
      if (!includeOutOfStock) {
        query.stockStatus = { $ne: 'outofstock' };
      }
      
      const products = await ProductModel.find(query)
        .sort({ name: 1 }); // Sort by name alphabetically
      
      logger.info('Retrieved all products', {
        siteId,
        totalProducts: products.length,
        includeOutOfStock
      });

      return products.map(product => product.toObject() as Product);

    } catch (error: any) {
      logger.error('Failed to get all products', {
        error: error.message,
        siteId
      });
      return [];
    }
  }

  async updateProductStock(productId: string, siteId: string, stockQuantity: number): Promise<void> {
    try {
      await ProductModel.updateOne(
        { id: productId, siteId },
        {
          $set: {
            stockQuantity,
            stockStatus: stockQuantity > 0 ? 'instock' : 'outofstock',
            updatedAt: new Date()
          }
        }
      );

      // Clear cache
      const cacheKey = `product:${siteId}:${productId}`;
      await redisCache.del(cacheKey);

      logger.info('Product stock updated', {
        productId,
        siteId,
        stockQuantity
      });

    } catch (error: any) {
      logger.error('Failed to update product stock', {
        error: error.message,
        productId,
        siteId
      });
    }
  }

  async bulkImportProducts(shopId: string, products: any[]): Promise<{ imported: number; updated: number; failed: number }> {
    const timer = createTimer('Bulk product import');
    let imported = 0;
    let updated = 0;
    let failed = 0;

    try {
      logger.info('Starting bulk product import', {
        shopId,
        productCount: products.length
      });

      // Transform products to our Product format
      const transformedProducts = products.map(product => {
        try {
          return {
            id: product.id?.toString() || uuidv4(),
            siteId: shopId, // Use shopId as siteId for consistency
            name: product.name || 'Untitled Product',
            description: product.description || '',
            shortDescription: product.short_description || product.excerpt || '',
            price: parseFloat(product.price || product.regular_price || '0'),
            regularPrice: parseFloat(product.regular_price || product.price || '0'),
            salePrice: product.sale_price ? parseFloat(product.sale_price) : undefined,
            currency: product.currency || 'USD',
            sku: product.sku || '',
            slug: product.slug || product.name?.toLowerCase().replace(/\s+/g, '-') || '',
            status: product.status || 'publish',
            stockStatus: product.stock_status || (product.stock_quantity > 0 ? 'instock' : 'outofstock'),
            stockQuantity: parseInt(product.stock_quantity) || 0,
            categories: Array.isArray(product.categories) ? product.categories.map((cat: any) => ({
              id: cat.id?.toString() || uuidv4(),
              name: cat.name || 'Uncategorized',
              slug: cat.slug || cat.name?.toLowerCase().replace(/\s+/g, '-') || 'uncategorized',
              parent: cat.parent?.toString()
            })) : [],
            tags: Array.isArray(product.tags) ? product.tags.map((tag: any) => 
              typeof tag === 'string' ? tag : tag.name || ''
            ) : [],
            images: Array.isArray(product.images) ? product.images.map((img: any) => ({
              id: img.id?.toString() || uuidv4(),
              src: img.src || img.url || '',
              alt: img.alt || '',
              position: img.position || 0
            })) : [],
            attributes: Array.isArray(product.attributes) ? product.attributes.map((attr: any) => ({
              id: attr.id?.toString() || uuidv4(),
              name: attr.name || '',
              option: Array.isArray(attr.options) ? attr.options.join(', ') : (attr.option || ''),
              variation: attr.variation || false
            })) : [],
            reviews: [], // Empty for now, can be populated later
            averageRating: parseFloat(product.average_rating || '0'),
            reviewCount: parseInt(product.rating_count || '0'),
            permalink: product.permalink || '',
            weight: product.weight ? parseFloat(product.weight) : undefined,
            dimensions: product.dimensions ? {
              length: parseFloat(product.dimensions.length || '0'),
              width: parseFloat(product.dimensions.width || '0'),
              height: parseFloat(product.dimensions.height || '0')
            } : undefined,
            relatedProducts: Array.isArray(product.related_ids) ? product.related_ids.map((id: any) => id.toString()) : [],
            crossSellProducts: Array.isArray(product.cross_sell_ids) ? product.cross_sell_ids.map((id: any) => id.toString()) : [],
            upsellProducts: Array.isArray(product.upsell_ids) ? product.upsell_ids.map((id: any) => id.toString()) : [],
            createdAt: product.date_created ? new Date(product.date_created) : new Date(),
            updatedAt: product.date_modified ? new Date(product.date_modified) : new Date(),
            lastSyncAt: new Date()
          };
        } catch (transformError: any) {
          logger.error('Failed to transform product', {
            error: transformError.message,
            product: product.id || 'unknown'
          });
          failed++;
          return null;
        }
      }).filter(Boolean) as Product[];

      // Use existing bulkUpsertProducts method
      const upsertedCount = await this.bulkUpsertProducts(transformedProducts);
      
      // Determine imported vs updated (simplified approach)
      imported = Math.min(upsertedCount, transformedProducts.length);
      updated = Math.max(0, upsertedCount - imported);

      // Clear cache for this shop
      await this.clearProductCache(shopId);

      timer.end({ imported, updated, failed });

      logger.info('Bulk product import completed', {
        shopId,
        imported,
        updated,
        failed,
        total: products.length,
        duration: timer.end()
      });

      return { imported, updated, failed };

    } catch (error: any) {
      timer.end();
      logger.error('Bulk product import failed', {
        error: error.message,
        shopId,
        productCount: products.length
      });
      
      return { imported, updated, failed: products.length };
    }
  }

  // Private helper methods
  private async getWooCommerceProductCount(config: WooCommerceConfig): Promise<number> {
    try {
      const response = await axios.get(`${config.baseUrl}/wp-json/wc/v3/products`, {
        auth: {
          username: config.consumerKey,
          password: config.consumerSecret
        },
        params: {
          per_page: 1,
          status: 'any'
        }
      });

      const totalHeader = response.headers['x-wp-total'];
      return totalHeader ? parseInt(totalHeader) : 0;

    } catch (error: any) {
      logger.error('Failed to get WooCommerce product count', {
        error: error.message,
        baseUrl: config.baseUrl
      });
      throw error;
    }
  }

  private async fetchWooCommerceProducts(
    config: WooCommerceConfig,
    params: any
  ): Promise<WooCommerceProduct[]> {
    try {
      const response = await axios.get(`${config.baseUrl}/wp-json/wc/v3/products`, {
        auth: {
          username: config.consumerKey,
          password: config.consumerSecret
        },
        params
      });

      return response.data;

    } catch (error: any) {
      logger.error('Failed to fetch WooCommerce products', {
        error: error.message,
        params
      });
      throw error;
    }
  }

  private async transformWooCommerceProduct(wcProduct: WooCommerceProduct, siteId: string): Promise<Product> {
    return {
      id: wcProduct.id.toString(),
      siteId,
      name: wcProduct.name,
      description: wcProduct.description,
      shortDescription: wcProduct.short_description,
      price: parseFloat(wcProduct.price) || 0,
      regularPrice: parseFloat(wcProduct.regular_price) || 0,
      salePrice: wcProduct.sale_price ? parseFloat(wcProduct.sale_price) : undefined,
      currency: 'USD', // Assume USD, you might want to fetch this from WooCommerce settings
      sku: wcProduct.sku,
      slug: wcProduct.slug,
      status: wcProduct.status,
      stockStatus: wcProduct.stock_status,
      stockQuantity: wcProduct.stock_quantity,
      categories: wcProduct.categories.map(cat => ({
        id: cat.id.toString(),
        name: cat.name,
        slug: cat.slug,
        parent: undefined // You might want to fetch parent category info
      })),
      tags: wcProduct.tags.map(tag => tag.name),
      images: wcProduct.images.map(img => ({
        id: img.id.toString(),
        src: img.src,
        alt: img.alt,
        position: img.position
      })),
      attributes: wcProduct.attributes.map(attr => ({
        id: attr.id.toString(),
        name: attr.name,
        option: attr.options.join(', '),
        variation: attr.variation
      })),
      reviews: [], // Will be populated separately
      averageRating: parseFloat(wcProduct.average_rating) || 0,
      reviewCount: wcProduct.rating_count || 0,
      permalink: wcProduct.permalink,
      weight: wcProduct.weight ? parseFloat(wcProduct.weight) : undefined,
      dimensions: wcProduct.dimensions ? {
        length: parseFloat(wcProduct.dimensions.length) || 0,
        width: parseFloat(wcProduct.dimensions.width) || 0,
        height: parseFloat(wcProduct.dimensions.height) || 0
      } : undefined,
      relatedProducts: wcProduct.related_ids.map(id => id.toString()),
      crossSellProducts: wcProduct.cross_sell_ids.map(id => id.toString()),
      upsellProducts: wcProduct.upsell_ids.map(id => id.toString()),
      createdAt: new Date(wcProduct.date_created),
      updatedAt: new Date(wcProduct.date_modified),
      lastSyncAt: new Date()
    };
  }

  private async bulkUpsertProducts(products: Product[]): Promise<number> {
    try {
      if (products.length === 0) return 0;

      // Use bulk operations for better performance
      const bulkOps = products.map(product => ({
        updateOne: {
          filter: { id: product.id, siteId: product.siteId },
          update: { $set: product },
          upsert: true
        }
      }));

      const result = await ProductModel.bulkWrite(bulkOps, { ordered: false });
      
      return result.upsertedCount + result.modifiedCount;

    } catch (error: any) {
      logger.error('Bulk upsert failed', {
        error: error.message,
        productCount: products.length
      });
      throw error;
    }
  }

  private async syncProductReviews(
    siteId: string,
    config: WooCommerceConfig,
    products: WooCommerceProduct[]
  ): Promise<void> {
    try {
      // This would fetch and sync product reviews from WooCommerce
      // Implementation depends on WooCommerce REST API for reviews
      logger.debug('Review sync not implemented yet', { siteId });

    } catch (error: any) {
      logger.error('Failed to sync reviews', {
        error: error.message,
        siteId
      });
    }
  }

  private async updateSyncTimestamp(siteId: string): Promise<void> {
    try {
      await redisCache.set(`sync_timestamp:${siteId}`, Date.now(), 86400); // 24 hours
    } catch (error: any) {
      logger.error('Failed to update sync timestamp', {
        error: error.message,
        siteId
      });
    }
  }

  private async clearProductCache(siteId: string): Promise<void> {
    try {
      const cacheKeys = await redisCache.keys(`product:${siteId}:*`);
      if (cacheKeys.length > 0) {
        await Promise.all(cacheKeys.map(key => redisCache.del(key)));
      }

      // Also clear related cache keys
      const relatedKeys = await redisCache.keys(`top_rated:${siteId}:*`);
      if (relatedKeys.length > 0) {
        await Promise.all(relatedKeys.map(key => redisCache.del(key)));
      }

    } catch (error: any) {
      logger.error('Failed to clear product cache', {
        error: error.message,
        siteId
      });
    }
  }

  /**
   * Delete a product
   */
  async deleteProduct(productId: string, siteId: string): Promise<void> {
    try {
      await ProductModel.deleteOne({ id: productId, siteId });
      
      // Clear related cache
      await redisCache.del(`product:${siteId}:${productId}`);
      await this.clearProductCache(siteId);
      
      logger.info('Product deleted successfully', { productId, siteId });
    } catch (error: any) {
      logger.error('Failed to delete product', {
        error: error.message,
        productId,
        siteId
      });
      throw error;
    }
  }

  /**
   * Invalidate all product caches for a site
   */
  async invalidateProductCaches(siteId: string): Promise<void> {
    try {
      await this.clearProductCache(siteId);
      logger.info('Product caches invalidated', { siteId });
    } catch (error: any) {
      logger.error('Failed to invalidate product caches', {
        error: error.message,
        siteId
      });
      throw error;
    }
  }

  /**
   * Perform a full product sync
   */
  async fullProductSync(shopId: string, config: WooCommerceConfig): Promise<void> {
    try {
      // Clear existing cache first
      await this.invalidateProductCaches(shopId);
      
      // Perform full sync
      const result = await this.syncProductsFromWooCommerce(shopId, config, {
        batchSize: 100,
        includeVariations: true,
        includeReviews: true
      });
      
      logger.info('Full product sync completed', { 
        shopId, 
        synced: result.synced,
        success: result.success 
      });
    } catch (error: any) {
      logger.error('Full product sync failed', {
        error: error.message,
        shopId
      });
      throw error;
    }
  }

  /**
   * Single product sync method (alias for backward compatibility)
   */
  async syncProductFromWooCommerce(shopId: string, config: WooCommerceConfig, productId?: string): Promise<any> {
    if (productId) {
      // Sync specific product
      try {
        const response = await axios.get(`${config.baseUrl}/wp-json/wc/v3/products/${productId}`, {
          auth: {
            username: config.consumerKey,
            password: config.consumerSecret
          }
        });
        
        const product = await this.transformWooCommerceProduct(response.data, shopId);
        await this.bulkUpsertProducts([product]);
        
        return { success: true, synced: 1, errors: [] };
      } catch (error: any) {
        logger.error('Failed to sync single product', { error: error.message, productId, shopId });
        throw error;
      }
    } else {
      // Fallback to full sync
      return await this.syncProductsFromWooCommerce(shopId, config);
    }
  }
}