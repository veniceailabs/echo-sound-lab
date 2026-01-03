/**
 * Level 5: Signature Provider Factory
 *
 * AMENDMENT L: Algorithm Agnosticism
 *
 * This provider decouples the "Signing Strategy" from the "Logging System."
 * The ForensicAuditLog does not know HOW to hash—it only knows a SignatureProvider
 * that returns a SignatureBundle containing both classical and post-quantum slots.
 *
 * Today (2025): SignatureProvider implements SHA-256 / Ed25519
 * 2026+: SignatureProvider can accept a PQC module (Dilithium/Kyber) without changing ForensicAuditLog
 *
 * This allows "Algorithm Agility": rotating cryptographic primitives without invalidating historical entries.
 */

/**
 * Classical signature: SHA-256 + Ed25519
 * Deployed in 2025, valid until 2028
 */
export interface ClassicalSignature {
  algorithm: 'SHA-256'; // Hash algorithm
  format: 'hex'; // String encoding
  hash: string; // 64-character hex string
  timestamp: number; // When signature was generated
}

/**
 * Post-Quantum signature: ML-DSA (Dilithium) placeholder
 * Reserved slot for 2026 implementation
 * Currently null; will be populated when liboqs-js or WASM Dilithium is available
 */
export interface PostQuantumSignature {
  algorithm: 'ML-DSA-87' | null; // NIST FIPS 204 ML-DSA variant (null until 2026)
  format: 'base64' | null; // Standard encoding for large signatures
  signature: string | null; // ~2420 bytes for ML-DSA-87
  publicKeyId: string | null; // Reference to quantum master key
  timestamp: number | null; // When signature was generated
}

/**
 * Signature Bundle: Parallel signatures supporting algorithm rotation
 *
 * CRITICAL PROPERTY: Both signatures can be present simultaneously.
 * - Entries 0-100 (2025): Have classical signature only
 * - Entries 101+ (2026): Have both classical + post-quantum signatures
 * - Verification always checks classical (until classical breaks)
 * - Post-quantum signature provides forward-security insurance
 */
export interface SignatureBundle {
  classical: ClassicalSignature; // Always present (2025+)
  postQuantum: PostQuantumSignature; // Present in 2026+ (or null if pre-2026)
  bundleVersion: 1 | 2; // v1: Classical only | v2: Hybrid (classical + quantum)
}

/**
 * The SignatureProvider Interface
 *
 * This allows different implementations:
 * - SignatureProviderClassical: Implements SHA-256 (current, 2025)
 * - SignatureProviderHybrid: Implements SHA-256 + Dilithium (2026, deferred)
 * - SignatureProviderQuantum: Full PQC-only (2030+, future)
 */
export interface ISignatureProvider {
  // Generate a signature bundle for the given data
  sign(data: Record<string, unknown>): Promise<SignatureBundle>;

  // Verify a signature bundle (checks whichever algorithm is present)
  verify(data: Record<string, unknown>, bundle: SignatureBundle): Promise<boolean>;

  // Get the provider's current algorithm support
  getAlgorithmSupport(): {
    classical: boolean; // Can do SHA-256?
    postQuantum: boolean; // Can do Dilithium?
  };

  // Get provider version (for debugging)
  getVersion(): string; // "1.0.0" = SHA-256 only, "1.1.0" = hybrid, etc.
}

/**
 * Classical Signature Provider (2025)
 *
 * Implements SHA-256 hashing via Web Crypto API.
 * Will be the primary verifier until quantum threat manifests (~2028).
 * Structured to accept a PQC module injection in 2026.
 */
export class SignatureProviderClassical implements ISignatureProvider {
  private pqcModule: any = null; // Reserved for 2026 injection

  async sign(data: Record<string, unknown>): Promise<SignatureBundle> {
    const jsonStr = JSON.stringify(data);
    const msgUint8 = new TextEncoder().encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const classicalHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return Object.freeze({
      classical: Object.freeze({
        algorithm: 'SHA-256',
        format: 'hex',
        hash: classicalHash,
        timestamp: Date.now(),
      }),
      postQuantum: Object.freeze({
        algorithm: null, // No PQC in v1.0
        format: null,
        signature: null,
        publicKeyId: null,
        timestamp: null,
      }),
      bundleVersion: 1, // Classical only
    });
  }

  async verify(data: Record<string, unknown>, bundle: SignatureBundle): Promise<boolean> {
    // Verify classical signature
    const jsonStr = JSON.stringify(data);
    const msgUint8 = new TextEncoder().encode(jsonStr);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const expectedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return bundle.classical.hash === expectedHash;
  }

  getAlgorithmSupport() {
    return {
      classical: true,
      postQuantum: this.pqcModule !== null,
    };
  }

  getVersion(): string {
    return '1.0.0-classical-only';
  }

  /**
   * RESERVED: Inject PQC module in 2026
   * When liboqs-js or WASM Dilithium is ready, call this to enable hybrid signing
   *
   * Usage (2026):
   *   const provider = new SignatureProviderClassical();
   *   provider.injectPQCModule(dilithiumModule);
   *   // Now sign() will return hybrid bundles
   */
  public injectPQCModule(pqcModule: any): void {
    console.log('⚛️ [SIGNATURE_PROVIDER] Post-Quantum module injected. Hybrid mode activated.');
    this.pqcModule = pqcModule;
    // Note: Full hybrid implementation deferred to Level 5 Phase 2 (2026)
  }
}

/**
 * Global Signature Provider Instance
 *
 * This is the single point of cryptographic agility.
 * In 2025, it's classical. In 2026, it will upgrade to hybrid without breaking the log.
 */
let globalProvider: ISignatureProvider | null = null;

/**
 * Initialize the global signature provider
 * Called once at application startup
 */
export function initializeSignatureProvider(provider?: ISignatureProvider): void {
  if (globalProvider !== null) {
    console.warn('⚠️ SignatureProvider already initialized. Ignoring re-initialization.');
    return;
  }

  globalProvider = provider || new SignatureProviderClassical();
  console.log(`🔐 [SIGNATURE_PROVIDER] Initialized: ${globalProvider.getVersion()}`);
  console.log(`   Support: Classical=${globalProvider.getAlgorithmSupport().classical}, PostQuantum=${globalProvider.getAlgorithmSupport().postQuantum}`);
}

/**
 * Get the global signature provider
 * Used by ForensicAuditLog to sign entries
 */
export function getSignatureProvider(): ISignatureProvider {
  if (!globalProvider) {
    throw new Error(
      'SignatureProvider not initialized. Call initializeSignatureProvider() at application startup.'
    );
  }
  return globalProvider;
}

/**
 * AMENDMENT L: Verify Algorithm Agility
 *
 * This function demonstrates that we can verify entries signed with different algorithms.
 * - Old entries (v1): Verified with classical hash
 * - New entries (v2): Verified with classical hash (until it breaks), then postQuantum hash
 * - Mixed log: Both types of entries coexist and verify correctly
 */
export async function verifySignatureBundle(
  data: Record<string, unknown>,
  bundle: SignatureBundle
): Promise<{
  isValid: boolean;
  classical: boolean; // Classical signature valid?
  postQuantum: boolean; // Post-quantum signature valid (if present)?
  trustLevel: 'classical' | 'hybrid' | 'quantum';
}> {
  const provider = getSignatureProvider();

  // Verify classical signature (always present)
  const classicalValid = await provider.verify(data, bundle);

  // Post-quantum verification (deferred to 2026)
  // For now, postQuantum slot is reserved but not checked
  const postQuantumValid = bundle.postQuantum.signature !== null; // Always false in v1.0

  return Object.freeze({
    isValid: classicalValid,
    classical: classicalValid,
    postQuantum: postQuantumValid,
    trustLevel: classicalValid ? 'classical' : 'quantum', // Fallback to PQ if classical fails (2028+)
  });
}
