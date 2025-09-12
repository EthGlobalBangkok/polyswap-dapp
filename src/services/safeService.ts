import Safe from '@safe-global/protocol-kit';
import { MetaTransactionData, SafeTransactionDataPartial } from '@safe-global/types-kit';
import { ethers } from 'ethers';

export interface SafeTransactionRequest {
  to: string;
  data: string;
  value: string;
}

export interface SafeTransactionResult {
  safeTxHash: string;
  transactionHash?: string;
  executed: boolean;
}

export class SafeService {
  private safe: Safe | null = null;
  private provider: ethers.Provider | null = null;
  private signer: ethers.Signer | null = null;

  async initialize(safeAddress: string, provider: ethers.Provider, signer?: ethers.Signer): Promise<void> {
    this.provider = provider;
    this.signer = signer || null;
    
    // Initialize Safe SDK - the new version accepts provider directly
    this.safe = await Safe.create({
      provider: signer || provider,
      safeAddress: safeAddress,
    });
  }

  async createSafeTransaction(
    transactionRequest: SafeTransactionRequest
  ): Promise<SafeTransactionResult> {
    if (!this.safe) {
      throw new Error('Safe not initialized. Call initialize() first.');
    }

    // Create transaction data
    const safeTransactionData: SafeTransactionDataPartial = {
      to: transactionRequest.to,
      data: transactionRequest.data,
      value: transactionRequest.value,
    };

    try {
      // Create the Safe transaction
      const safeTransaction = await this.safe.createTransaction({
        transactions: [safeTransactionData]
      });

      // Get the Safe transaction hash
      const safeTxHash = await this.safe.getTransactionHash(safeTransaction);

      // Sign the transaction
      const signedSafeTransaction = await this.safe.signTransaction(safeTransaction);

      // Check if we can execute immediately (single owner or threshold met)
      const threshold = await this.safe.getThreshold();
      const signatures = signedSafeTransaction.signatures;
      
      let transactionHash: string | undefined;
      let executed = false;

      // Count valid signatures
      const signatureCount = Object.keys(signatures).length;
      
      if (signatureCount >= threshold) {
        // Execute the transaction
        const executeTxResponse = await this.safe.executeTransaction(signedSafeTransaction);
        transactionHash = executeTxResponse.hash;
        executed = true;
        
        // Wait for transaction confirmation
        if (this.provider && 'waitForTransaction' in this.provider) {
          await (this.provider as any).waitForTransaction(transactionHash);
        }
      }

      return {
        safeTxHash,
        transactionHash,
        executed
      };

    } catch (error) {
      console.error('Error creating Safe transaction:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create Safe transaction');
    }
  }

  async createBatchTransaction(
    transactionRequests: SafeTransactionRequest[]
  ): Promise<SafeTransactionResult> {
    if (!this.safe) {
      throw new Error('Safe not initialized. Call initialize() first.');
    }

    // Convert requests to MetaTransactionData format
    const transactions: MetaTransactionData[] = transactionRequests.map(request => ({
      to: request.to,
      data: request.data,
      value: request.value,
      operation: 0, // CALL operation
    }));

    try {
      // Create batch transaction
      const safeTransaction = await this.safe.createTransaction({
        transactions
      });

      // Get the Safe transaction hash
      const safeTxHash = await this.safe.getTransactionHash(safeTransaction);

      // Sign the transaction
      const signedSafeTransaction = await this.safe.signTransaction(safeTransaction);

      // Check if we can execute immediately
      const threshold = await this.safe.getThreshold();
      const signatures = signedSafeTransaction.signatures;
      
      let transactionHash: string | undefined;
      let executed = false;

      const signatureCount = Object.keys(signatures).length;
      
      if (signatureCount >= threshold) {
        // Execute the batch transaction
        const executeTxResponse = await this.safe.executeTransaction(signedSafeTransaction);
        transactionHash = executeTxResponse.hash;
        executed = true;
        
        // Wait for transaction confirmation
        if (this.provider && 'waitForTransaction' in this.provider) {
          await (this.provider as any).waitForTransaction(transactionHash);
        }
      }

      return {
        safeTxHash,
        transactionHash,
        executed
      };

    } catch (error) {
      console.error('Error creating batch Safe transaction:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to create batch Safe transaction');
    }
  }

  async getSafeInfo() {
    if (!this.safe) {
      throw new Error('Safe not initialized');
    }

    const safeAddress = await this.safe.getAddress();
    const owners = await this.safe.getOwners();
    const threshold = await this.safe.getThreshold();
    const nonce = await this.safe.getNonce();

    return {
      address: safeAddress,
      owners,
      threshold,
      nonce
    };
  }

  isInitialized(): boolean {
    return this.safe !== null;
  }
}

// Singleton instance
export const safeService = new SafeService();