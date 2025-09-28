import { ethers } from 'ethers';

export interface FallbackHandlerCheck {
  currentHandler: string;
  expectedHandler: string;
  isCorrect: boolean;
  needsUpdate: boolean;
}

export interface FallbackHandlerTransaction {
  to: string;
  data: string;
  value: string;
}

/**
 * Service for checking and setting Safe fallback handlers
 * Based on the Foundry commands:
 * cast storage <safe_address> 0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5 --rpc-url https://polygon-rpc.com
 * cast parse-bytes32-address <result>
 */
export class SafeFallbackHandlerService {
  // Storage slot for fallback handler in Safe contracts
  private static readonly FALLBACK_HANDLER_STORAGE_SLOT = '0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5';

  // Expected PolySwap handler address
  private static readonly EXPECTED_HANDLER = process.env.EXTENSIBLE_FALLBACK_HANDLER || '0x2f55e8b20D0B9FEFA187AA7d00B6Cbe563605bF5';

  /**
   * Get the current fallback handler for a Safe address
   */
  static async getCurrentFallbackHandler(
    safeAddress: string,
    provider: ethers.Provider
  ): Promise<string> {
    try {
      // Read the storage slot directly
      const storageValue = await provider.getStorage(
        safeAddress,
        this.FALLBACK_HANDLER_STORAGE_SLOT
      );

      // Parse the bytes32 value to get the address
      // Remove leading zeros and format as address
      const fallbackHandler = ethers.getAddress('0x' + storageValue.slice(-40));

      console.log('getCurrentFallbackHandler result:', {
        safeAddress,
        storageValue,
        parsedHandler: fallbackHandler
      });

      return fallbackHandler;
    } catch (error) {
      console.error('Error reading fallback handler storage:', error);
      throw new Error(`Failed to read fallback handler: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the Safe has the correct fallback handler set
   */
  static async checkFallbackHandler(
    safeAddress: string,
    provider: ethers.Provider,
    expectedHandler?: string
  ): Promise<FallbackHandlerCheck> {
    try {
      const expected = expectedHandler || this.EXPECTED_HANDLER;
      const current = await this.getCurrentFallbackHandler(safeAddress, provider);

      // Normalize addresses for comparison (both to lowercase)
      const currentNormalized = current.toLowerCase();
      const expectedNormalized = expected.toLowerCase();

      const isCorrect = currentNormalized === expectedNormalized;
      const needsUpdate = !isCorrect;

      // Debug logging
      console.log('Fallback handler check:', {
        safeAddress,
        current,
        expected,
        currentNormalized,
        expectedNormalized,
        isCorrect,
        needsUpdate
      });

      return {
        currentHandler: current,
        expectedHandler: expected,
        isCorrect,
        needsUpdate
      };
    } catch (error) {
      console.error('Error checking fallback handler:', error);
      throw new Error(`Failed to check fallback handler: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a transaction to set the fallback handler
   * Calls setFallbackHandler(address handler) on the Safe
   */
  static createSetFallbackHandlerTransaction(
    safeAddress: string,
    handlerAddress?: string
  ): FallbackHandlerTransaction {
    try {
      const handler = handlerAddress || this.EXPECTED_HANDLER;

      // Safe's setFallbackHandler function signature
      const safeInterface = new ethers.Interface([
        'function setFallbackHandler(address handler)'
      ]);

      // Encode the function call
      const data = safeInterface.encodeFunctionData('setFallbackHandler', [handler]);

      const transaction: FallbackHandlerTransaction = {
        to: safeAddress,
        data: data,
        value: '0'
      };

      return transaction;
    } catch (error) {
      console.error('Error creating setFallbackHandler transaction:', error);
      throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a fallback handler transaction is needed and create it if required
   * Returns null if no transaction is needed
   */
  static async checkAndCreateFallbackHandlerTransaction(
    safeAddress: string,
    provider: ethers.Provider,
    expectedHandler?: string
  ): Promise<FallbackHandlerTransaction | null> {
    try {
      const check = await this.checkFallbackHandler(safeAddress, provider, expectedHandler);

      console.log('🔍 BEFORE RETURN - checkAndCreateFallbackHandlerTransaction:', {
        safeAddress,
        needsUpdate: check.needsUpdate,
        willCreateTransaction: check.needsUpdate
      });

      if (check.needsUpdate) {
        const transaction = this.createSetFallbackHandlerTransaction(safeAddress, check.expectedHandler);
        console.log('🚨 CREATING FALLBACK HANDLER TRANSACTION:', transaction);
        return transaction;
      } else {
        console.log('✅ NO FALLBACK HANDLER TRANSACTION NEEDED');
        return null;
      }
    } catch (error) {
      console.error('Error checking and creating fallback handler transaction:', error);
      throw new Error(`Failed to check/create fallback handler transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that the provided address is a valid Safe contract
   */
  static async validateSafeContract(
    safeAddress: string,
    provider: ethers.Provider
  ): Promise<boolean> {
    try {
      // Check if the address has code (is a contract)
      const code = await provider.getCode(safeAddress);

      if (code === '0x') {
        return false;
      }

      // Try to call a Safe-specific method to confirm it's a Safe
      const safeInterface = new ethers.Interface([
        'function getThreshold() view returns (uint256)'
      ]);

      const contract = new ethers.Contract(safeAddress, safeInterface, provider);

      try {
        await contract.getThreshold();
        return true;
      } catch {
        return false;
      }
    } catch (error) {
      console.error('Error validating Safe contract:', error);
      return false;
    }
  }

  /**
   * Get detailed information about the Safe and its fallback handler
   */
  static async getSafeInfo(
    safeAddress: string,
    provider: ethers.Provider
  ): Promise<{
    isValidSafe: boolean;
    threshold?: number;
    owners?: string[];
    fallbackHandler: string;
    fallbackHandlerCheck: FallbackHandlerCheck;
  }> {
    try {
      const isValidSafe = await this.validateSafeContract(safeAddress, provider);
      const fallbackHandlerCheck = await this.checkFallbackHandler(safeAddress, provider);

      let threshold: number | undefined;
      let owners: string[] | undefined;

      if (isValidSafe) {
        try {
          const safeInterface = new ethers.Interface([
            'function getThreshold() view returns (uint256)',
            'function getOwners() view returns (address[])'
          ]);

          const contract = new ethers.Contract(safeAddress, safeInterface, provider);

          const [thresholdResult, ownersResult] = await Promise.all([
            contract.getThreshold(),
            contract.getOwners()
          ]);

          threshold = Number(thresholdResult);
          owners = ownersResult;
        } catch (error) {
          console.warn('Could not get Safe threshold/owners:', error);
        }
      }

      return {
        isValidSafe,
        threshold,
        owners,
        fallbackHandler: fallbackHandlerCheck.currentHandler,
        fallbackHandlerCheck
      };
    } catch (error) {
      console.error('Error getting Safe info:', error);
      throw new Error(`Failed to get Safe info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default SafeFallbackHandlerService;