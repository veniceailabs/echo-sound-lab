/**
 * Marketplace Service — Buy/sell beats, presets, stems
 *
 * Enables creators to monetize their work with:
 * - Product listings (beats, presets, stem packs)
 * - Shopping cart & checkout
 * - Royalty split tracking
 * - Creator earnings dashboard
 * - Licensing terms (personal, commercial, exclusive)
 */

export type ProductType = 'beat' | 'preset' | 'stems';
export type LicenseType = 'personal' | 'commercial' | 'exclusive';

export interface MarketplaceProduct {
  id: string;
  type: ProductType;
  title: string;
  description: string;
  creatorId: string;
  creatorName: string;
  price: number; // in USD
  licenses: {
    [key in LicenseType]: {
      price: number;
      commercialUse: boolean;
      exclusiveUse: boolean;
    };
  };
  audioUrl: string; // Preview/sample
  audioFile?: Blob; // Full file (on download)
  tags: string[];
  bpm?: number;
  key?: string;
  genre: string;
  createdAt: Date;
  downloads: number;
  rating: number; // 0-5
  reviews: Review[];
  isActive: boolean;
}

export interface Review {
  id: string;
  buyerId: string;
  buyerName: string;
  rating: number;
  text: string;
  createdAt: Date;
}

export interface CartItem {
  productId: string;
  licenseType: LicenseType;
  quantity: number;
}

export interface PurchaseOrder {
  id: string;
  buyerId: string;
  buyerEmail: string;
  items: CartItem[];
  totalPrice: number;
  royaltySplits: RoyaltySplit[];
  status: 'pending' | 'completed' | 'refunded';
  createdAt: Date;
  completedAt?: Date;
}

export interface RoyaltySplit {
  recipientId: string;
  recipientName: string;
  recipientEmail: string;
  amount: number; // USD
  percentage: number; // of total price
}

export interface CreatorEarnings {
  creatorId: string;
  totalEarnings: number;
  monthlyEarnings: number;
  totalSales: number;
  topProducts: MarketplaceProduct[];
  pendingPayout: number;
  lastPayout?: Date;
}

class MarketplaceEngine {
  private products: Map<string, MarketplaceProduct> = new Map();
  private cart: CartItem[] = [];
  private orders: Map<string, PurchaseOrder> = new Map();
  private creatorEarnings: Map<string, CreatorEarnings> = new Map();

  // Dummy product data
  constructor() {
    this.initializeDummyProducts();
  }

  private initializeDummyProducts(): void {
    const dummyProducts: MarketplaceProduct[] = [
      {
        id: 'beat-trap-1',
        type: 'beat',
        title: '808 Trap Banger',
        description: 'Hard-hitting trap beat with 808s and ambient pads',
        creatorId: 'creator-1',
        creatorName: 'Beat Wizard',
        price: 24.99,
        licenses: {
          personal: { price: 9.99, commercialUse: false, exclusiveUse: false },
          commercial: { price: 24.99, commercialUse: true, exclusiveUse: false },
          exclusive: { price: 99.99, commercialUse: true, exclusiveUse: true },
        },
        audioUrl: 'https://example.com/preview-trap-1.mp3',
        tags: ['trap', 'dark', 'aggressive', '140bpm'],
        bpm: 140,
        key: 'C',
        genre: 'Hip-Hop',
        createdAt: new Date('2026-03-15'),
        downloads: 245,
        rating: 4.8,
        reviews: [],
        isActive: true,
      },
      {
        id: 'preset-vocal-1',
        type: 'preset',
        title: 'Drake Vocal Chain',
        description: 'EQ, compression, and effects matched to Drake vocal style',
        creatorId: 'creator-2',
        creatorName: 'Pro Engineer',
        price: 19.99,
        licenses: {
          personal: { price: 9.99, commercialUse: false, exclusiveUse: false },
          commercial: { price: 19.99, commercialUse: true, exclusiveUse: false },
          exclusive: { price: 79.99, commercialUse: true, exclusiveUse: true },
        },
        audioUrl: 'https://example.com/preview-vocal-1.mp3',
        tags: ['vocal', 'rappers', 'hiphop', 'pro'],
        genre: 'Hip-Hop',
        createdAt: new Date('2026-03-10'),
        downloads: 512,
        rating: 4.9,
        reviews: [],
        isActive: true,
      },
      {
        id: 'stems-lofi-1',
        type: 'stems',
        title: 'Lofi Study Session - Stems',
        description: '4 individual stems: drums, bass, melody, pad (for remixing)',
        creatorId: 'creator-3',
        creatorName: 'Sample Pack King',
        price: 34.99,
        licenses: {
          personal: { price: 14.99, commercialUse: false, exclusiveUse: false },
          commercial: { price: 34.99, commercialUse: true, exclusiveUse: false },
          exclusive: { price: 149.99, commercialUse: true, exclusiveUse: true },
        },
        audioUrl: 'https://example.com/preview-lofi-1.mp3',
        tags: ['lofi', 'stems', 'chill', 'study'],
        bpm: 85,
        key: 'D',
        genre: 'Lofi Hip-Hop',
        createdAt: new Date('2026-02-28'),
        downloads: 189,
        rating: 4.7,
        reviews: [],
        isActive: true,
      },
    ];

    dummyProducts.forEach((product) => {
      this.products.set(product.id, product);
    });
  }

  getProducts(filters?: { genre?: string; type?: ProductType; priceMax?: number }): MarketplaceProduct[] {
    let results = Array.from(this.products.values()).filter((p) => p.isActive);

    if (filters?.genre) {
      results = results.filter((p) => p.genre.toLowerCase().includes(filters.genre!.toLowerCase()));
    }
    if (filters?.type) {
      results = results.filter((p) => p.type === filters.type);
    }
    if (filters?.priceMax) {
      results = results.filter((p) => p.licenses.commercial.price <= filters.priceMax!);
    }

    return results;
  }

  getProduct(id: string): MarketplaceProduct | undefined {
    return this.products.get(id);
  }

  addToCart(productId: string, licenseType: LicenseType, quantity: number = 1): void {
    const existing = this.cart.find((item) => item.productId === productId && item.licenseType === licenseType);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({ productId, licenseType, quantity });
    }
  }

  removeFromCart(productId: string, licenseType: LicenseType): void {
    this.cart = this.cart.filter((item) => !(item.productId === productId && item.licenseType === licenseType));
  }

  getCart(): CartItem[] {
    return [...this.cart];
  }

  getCartTotal(): number {
    return this.cart.reduce((total, item) => {
      const product = this.products.get(item.productId);
      if (!product) return total;
      const price = product.licenses[item.licenseType].price;
      return total + price * item.quantity;
    }, 0);
  }

  checkout(buyerId: string, buyerEmail: string): PurchaseOrder {
    const totalPrice = this.getCartTotal();
    const order: PurchaseOrder = {
      id: Math.random().toString(36).slice(2),
      buyerId,
      buyerEmail,
      items: [...this.cart],
      totalPrice,
      royaltySplits: this.calculateRoyaltySplits(this.cart),
      status: 'completed', // In real app, wait for Stripe confirmation
      createdAt: new Date(),
      completedAt: new Date(),
    };

    this.orders.set(order.id, order);
    this.recordEarnings(order);
    this.cart = []; // Clear cart

    return order;
  }

  private calculateRoyaltySplits(items: CartItem[]): RoyaltySplit[] {
    const splits = new Map<string, { name: string; email: string; total: number }>();

    items.forEach((item) => {
      const product = this.products.get(item.productId);
      if (!product) return;

      const itemPrice = product.licenses['commercial'].price * item.quantity;
      const creatorEarn = itemPrice * 0.7; // Creator gets 70%
      const platformEarn = itemPrice * 0.3; // Platform gets 30%

      if (!splits.has(product.creatorId)) {
        splits.set(product.creatorId, {
          name: product.creatorName,
          email: `${product.creatorId}@echo-sound-lab.local`,
          total: 0,
        });
      }
      const split = splits.get(product.creatorId)!;
      split.total += creatorEarn;
    });

    return Array.from(splits.entries()).map(([id, data]) => ({
      recipientId: id,
      recipientName: data.name,
      recipientEmail: data.email,
      amount: data.total,
      percentage: (data.total / this.getCartTotal()) * 100,
    }));
  }

  private recordEarnings(order: PurchaseOrder): void {
    order.royaltySplits.forEach((split) => {
      const existing = this.creatorEarnings.get(split.recipientId) || {
        creatorId: split.recipientId,
        totalEarnings: 0,
        monthlyEarnings: 0,
        totalSales: 0,
        topProducts: [],
        pendingPayout: 0,
      };

      existing.totalEarnings += split.amount;
      existing.monthlyEarnings += split.amount;
      existing.totalSales += 1;
      existing.pendingPayout += split.amount;

      this.creatorEarnings.set(split.recipientId, existing);
    });
  }

  getCreatorEarnings(creatorId: string): CreatorEarnings | undefined {
    return this.creatorEarnings.get(creatorId);
  }

  createProduct(product: Omit<MarketplaceProduct, 'id' | 'createdAt' | 'downloads' | 'rating' | 'reviews'>): MarketplaceProduct {
    const newProduct: MarketplaceProduct = {
      ...product,
      id: Math.random().toString(36).slice(2),
      createdAt: new Date(),
      downloads: 0,
      rating: 0,
      reviews: [],
    };

    this.products.set(newProduct.id, newProduct);
    return newProduct;
  }
}

let engine: MarketplaceEngine | null = null;

function getEngine(): MarketplaceEngine {
  if (!engine) {
    engine = new MarketplaceEngine();
  }
  return engine;
}

export const marketplaceService = {
  /**
   * Get marketplace products with optional filters
   */
  getProducts(filters?: any): MarketplaceProduct[] {
    return getEngine().getProducts(filters);
  },

  /**
   * Get single product
   */
  getProduct(id: string): MarketplaceProduct | undefined {
    return getEngine().getProduct(id);
  },

  /**
   * Add to cart
   */
  addToCart(productId: string, licenseType: LicenseType, quantity?: number): void {
    getEngine().addToCart(productId, licenseType, quantity);
  },

  /**
   * Remove from cart
   */
  removeFromCart(productId: string, licenseType: LicenseType): void {
    getEngine().removeFromCart(productId, licenseType);
  },

  /**
   * Get cart items
   */
  getCart(): CartItem[] {
    return getEngine().getCart();
  },

  /**
   * Get cart total
   */
  getCartTotal(): number {
    return getEngine().getCartTotal();
  },

  /**
   * Checkout (integrate with Stripe)
   */
  checkout(buyerId: string, buyerEmail: string): PurchaseOrder {
    return getEngine().checkout(buyerId, buyerEmail);
  },

  /**
   * Get creator earnings
   */
  getCreatorEarnings(creatorId: string): CreatorEarnings | undefined {
    return getEngine().getCreatorEarnings(creatorId);
  },

  /**
   * Create a new product
   */
  createProduct(product: any): MarketplaceProduct {
    return getEngine().createProduct(product);
  },
};
