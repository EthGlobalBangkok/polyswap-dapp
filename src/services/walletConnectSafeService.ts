import { ethers } from 'ethers';

export interface WalletConnectSafeTransactionRequest {
  to: string;
  data: string;
  value: string;
}

export interface WalletConnectSafeBatchTransactionRequest {
  transactions: WalletConnectSafeTransactionRequest[];
}

export interface WalletConnectSafeTransactionResult {
  transactionHash: string;
  success: boolean;
}

/**
 * Service for handling Safe wallet transactions via WalletConnect
 * This is a simplified approach that sends transactions directly to the Safe
 * The Safe mobile/desktop app handles the multi-sig logic internally
 */
export class WalletConnectSafeService {
  private signer: ethers.Signer | null = null;
  private provider: ethers.Provider | null = null;

  initialize(signer: ethers.Signer, provider: ethers.Provider): void {
    this.signer = signer;
    this.provider = provider;
  }

  /**
   * Check WalletConnect connection health
   */
  async checkConnection(): Promise<boolean> {
    try {
      if (!this.signer || !this.provider) return false;
      
      // Try a simple call to check connection
      const address = await this.signer.getAddress();
      const balance = await this.provider.getBalance(address);
      
      console.log('Connection check passed - address:', address, 'balance:', balance.toString());
      return true;
    } catch (error) {
      console.error('Connection check failed:', error);
      return false;
    }
  }

  /**
   * Alternative method using eth_sendTransaction directly with retry logic
   */
  async sendTransactionRaw(
    transactionRequest: WalletConnectSafeTransactionRequest,
    retries: number = 2
  ): Promise<WalletConnectSafeTransactionResult> {
    if (!this.signer) {
      throw new Error('Signer not initialized. Call initialize() first.');
    }

    // Check connection first
    const connectionOk = await this.checkConnection();
    if (!connectionOk) {
      throw new Error('WalletConnect connection is not healthy. Please reconnect your wallet.');
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`Sending raw Safe transaction via WalletConnect (attempt ${attempt + 1}):`, transactionRequest);
        
        const fromAddress = await this.signer.getAddress();
        
        // Simplified transaction request - remove problematic fields
        const rawTxRequest = {
          from: fromAddress,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value || '0x0',
        };

        console.log('Raw transaction request:', rawTxRequest);

        // Add small delay between retries
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Send via the provider's JSON-RPC directly
        const txHash = await (this.provider as any).send('eth_sendTransaction', [rawTxRequest]);
        
        console.log('Raw transaction sent successfully, hash:', txHash);

        return {
          transactionHash: txHash,
          success: true
        };

      } catch (error) {
        console.error(`Attempt ${attempt + 1} failed:`, error);
        
        if (attempt === retries) {
          // Last attempt failed
          console.error('All attempts failed, throwing error');
          throw error;
        }
        
        // Check if it's a connection issue
        const connectionStillOk = await this.checkConnection();
        if (!connectionStillOk) {
          throw new Error('WalletConnect connection lost. Please reconnect your wallet.');
        }
      }
    }

    throw new Error('Transaction failed after all retries');
  }

  /**
   * Wait for transaction to be confirmed on-chain
   * Used when we need to ensure the transaction is indexed before calling backend
   */
  async waitForTransactionConfirmation(
    transactionHash: string,
    timeoutMs: number = 60000 // 1 minute default timeout
  ): Promise<any> {
    console.log('🚀 [WC-WAIT] waitForTransactionConfirmation START');
    console.log('🔍 [WC-WAIT] Transaction hash:', transactionHash);
    console.log('🔍 [WC-WAIT] Timeout:', timeoutMs, 'ms');

    if (!this.provider) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      console.log('⏳ [WC-WAIT] Waiting for transaction confirmation...');
      const startTime = Date.now();

      const receipt = await Promise.race([
        this.provider.waitForTransaction(transactionHash),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)
        )
      ]);

      const endTime = Date.now();
      console.log(`✅ [WC-WAIT] Transaction confirmed in ${endTime - startTime}ms`);
      console.log('📋 [WC-WAIT] Receipt:', JSON.stringify(receipt, null, 2));
      console.log('🏁 [WC-WAIT] waitForTransactionConfirmation END - SUCCESS');

      return receipt;
    } catch (error) {
      console.error('💥 [WC-WAIT] Transaction confirmation failed:', error);
      console.log('🏁 [WC-WAIT] waitForTransactionConfirmation END - ERROR');
      throw error;
    }
  }

  /**
   * Send transaction via WalletConnect to Safe
   * The Safe app will handle the multi-sig requirements internally
   * Returns immediately after successful signature, not waiting for execution
   */
  async sendTransaction(
    transactionRequest: WalletConnectSafeTransactionRequest
  ): Promise<WalletConnectSafeTransactionResult> {
    console.log('🚀 [WC-SAFE] sendTransaction START');
    console.log('🔍 [WC-SAFE] Transaction request:', JSON.stringify(transactionRequest, null, 2));
    console.log('🔍 [WC-SAFE] Signer initialized:', !!this.signer);
    console.log('🔍 [WC-SAFE] Provider initialized:', !!this.provider);

    if (!this.signer) {
      console.error('❌ [WC-SAFE] Signer not initialized');
      throw new Error('Signer not initialized. Call initialize() first.');
    }

    try {
      console.log('📝 [WC-SAFE] Preparing transaction request...');

      // Prepare transaction - let Safe handle gas estimation
      const txRequest = {
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
      };

      console.log('📋 [WC-SAFE] Final transaction params:', JSON.stringify(txRequest, null, 2));
      console.log('⏳ [WC-SAFE] About to call signer.sendTransaction()...');
      console.log('🔍 [WC-SAFE] Signer type:', this.signer.constructor.name);

      // Get signer address for logging
      try {
        const signerAddress = await this.signer.getAddress();
        console.log('👤 [WC-SAFE] Signer address:', signerAddress);
      } catch (addressError) {
        console.warn('⚠️ [WC-SAFE] Could not get signer address:', addressError);
      }

      console.log('🔄 [WC-SAFE] CALLING signer.sendTransaction() NOW...');
      const startTime = Date.now();

      // Send transaction to Safe via WalletConnect
      // For Safe + WalletConnect, we treat successful signature as success
      const tx = await this.signer.sendTransaction(txRequest);

      const endTime = Date.now();
      console.log(`✅ [WC-SAFE] signer.sendTransaction() COMPLETED in ${endTime - startTime}ms`);
      console.log('🔍 [WC-SAFE] Transaction result type:', typeof tx);
      console.log('🔍 [WC-SAFE] Transaction result keys:', Object.keys(tx || {}));
      console.log('📋 [WC-SAFE] Full transaction result:', JSON.stringify(tx, null, 2));

      if (!tx) {
        console.error('❌ [WC-SAFE] Transaction result is null/undefined');
        throw new Error('Transaction result is null - signing may have failed');
      }

      if (!tx.hash) {
        console.error('❌ [WC-SAFE] Transaction result missing hash');
        console.log('🔍 [WC-SAFE] Available tx properties:', Object.keys(tx));
        throw new Error('Transaction result missing hash - signing may have failed');
      }

      console.log('🎉 [WC-SAFE] Transaction hash received:', tx.hash);
      console.log('🔍 [WC-SAFE] Transaction hash type:', typeof tx.hash);
      console.log('🔍 [WC-SAFE] Transaction hash length:', tx.hash?.length);

      // For Safe wallets with WalletConnect:
      // - tx.hash indicates the transaction was successfully signed and submitted
      // - We don't wait for on-chain execution as that can be delayed (queued transactions)
      // - The Safe handles execution timing internally

      const result = {
        transactionHash: tx.hash,
        success: true
      };

      console.log('✅ [WC-SAFE] Returning success result:', JSON.stringify(result, null, 2));
      console.log('🏁 [WC-SAFE] sendTransaction END - SUCCESS');

      return result;

    } catch (error) {
      console.error('💥 [WC-SAFE] sendTransaction ERROR occurred');
      console.error('🔍 [WC-SAFE] Error type:', typeof error);
      console.error('🔍 [WC-SAFE] Error constructor:', error?.constructor?.name);
      console.error('🔍 [WC-SAFE] Error message:', error instanceof Error ? error.message : String(error));
      console.error('🔍 [WC-SAFE] Error code:', (error as any)?.code);
      console.error('🔍 [WC-SAFE] Error details:', (error as any)?.details);
      console.error('🔍 [WC-SAFE] Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

      // Enhanced error handling for user rejection and common Safe errors
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        console.log('🔍 [WC-SAFE] Processing error message (lowercase):', errorMsg);

        // User rejection patterns
        if (errorMsg.includes('user rejected') ||
            errorMsg.includes('denied') ||
            errorMsg.includes('user denied') ||
            errorMsg.includes('user cancelled') ||
            errorMsg.includes('transaction was cancelled') ||
            errorMsg.includes('action_rejected') ||
            (error as any).code === 4001) {
          console.log('❌ [WC-SAFE] Detected user rejection');
          throw new Error('Transaction signing was refused by user');
        }

        // Safe-specific rejection patterns
        if (errorMsg.includes('safe transaction was rejected') ||
            errorMsg.includes('transaction rejected by safe') ||
            errorMsg.includes('user rejected the safe transaction')) {
          console.log('❌ [WC-SAFE] Detected Safe-specific rejection');
          throw new Error('Transaction signing was refused in Safe wallet');
        }

        // Network/technical errors
        if (errorMsg.includes('insufficient funds')) {
          console.log('❌ [WC-SAFE] Detected insufficient funds error');
          throw new Error('Insufficient funds for transaction');
        }
        if (errorMsg.includes('gas')) {
          console.log('❌ [WC-SAFE] Detected gas estimation error');
          throw new Error('Gas estimation failed - check contract parameters');
        }
        if (errorMsg.includes('nonce')) {
          console.log('❌ [WC-SAFE] Detected nonce error');
          throw new Error('Transaction nonce error - please retry');
        }
        if (errorMsg.includes('replacement')) {
          console.log('❌ [WC-SAFE] Detected replacement error');
          throw new Error('Transaction replacement error - please wait and retry');
        }
        if (errorMsg.includes('network') || errorMsg.includes('connection')) {
          console.log('❌ [WC-SAFE] Detected network/connection error');
          throw new Error('Network connection issue - please check your connection and retry');
        }
      }

      // Check for error codes that indicate user rejection
      if ((error as any)?.code === 4001 || (error as any)?.code === 'ACTION_REJECTED') {
        console.log('❌ [WC-SAFE] Detected user rejection by error code');
        throw new Error('Transaction signing was refused by user');
      }

      console.log('❌ [WC-SAFE] Unhandled error - re-throwing original');
      console.log('🏁 [WC-SAFE] sendTransaction END - ERROR');
      throw new Error(error instanceof Error ? error.message : 'Failed to send transaction');
    }
  }

  /**
   * Check if the connected wallet is a Safe wallet
   * This is a heuristic check based on the address format and behavior
   */
  async isSafeWallet(address: string): Promise<boolean> {
    if (!this.provider) {
      return false;
    }

    try {
      // Check if the address has code (is a contract)
      const code = await this.provider.getCode(address);
      
      // Safe wallets are smart contracts, so they have bytecode
      if (code === '0x') {
        return false; // EOA wallet
      }

      // Additional check: try to call a Safe-specific method
      // This is a simple heuristic - Safe wallets typically have specific method signatures
      const safeInterface = new ethers.Interface([
        'function getThreshold() view returns (uint256)',
        'function getOwners() view returns (address[])'
      ]);

      try {
        const contract = new ethers.Contract(address, safeInterface, this.provider);
        await contract.getThreshold();
        return true; // If this succeeds, it's likely a Safe
      } catch {
        // If the Safe methods don't exist, it might still be a Safe or another smart wallet
        // Return true for any contract wallet when connected via WalletConnect to be safe
        return true;
      }
    } catch (error) {
      console.error('Error checking if wallet is Safe:', error);
      return false;
    }
  }

  /**
   * Get Safe wallet information if possible
   */
  async getSafeInfo(address: string): Promise<{
    isSafe: boolean;
    threshold?: number;
    owners?: string[];
  }> {
    if (!this.provider) {
      return { isSafe: false };
    }

    try {
      const isSafe = await this.isSafeWallet(address);
      
      if (!isSafe) {
        return { isSafe: false };
      }

      // Try to get Safe-specific information
      const safeInterface = new ethers.Interface([
        'function getThreshold() view returns (uint256)',
        'function getOwners() view returns (address[])'
      ]);

      const contract = new ethers.Contract(address, safeInterface, this.provider);
      
      try {
        const [threshold, owners] = await Promise.all([
          contract.getThreshold(),
          contract.getOwners()
        ]);

        return {
          isSafe: true,
          threshold: Number(threshold),
          owners: owners
        };
      } catch {
        // If we can't get Safe info, still return as Safe
        return { isSafe: true };
      }
    } catch (error) {
      console.error('Error getting Safe info:', error);
      return { isSafe: false };
    }
  }

  /**
   * Send multiple transactions sequentially to Safe via WalletConnect
   * Each transaction is signed individually and executed one by one
   */
  async sendMultipleTransactions(
    transactions: WalletConnectSafeTransactionRequest[],
    onProgress?: (current: number, total: number, txType: string, txHash?: string) => void
  ): Promise<WalletConnectSafeTransactionResult[]> {
    console.log('🚀 [WC-MULTI] sendMultipleTransactions START');
    console.log('🔍 [WC-MULTI] Transactions to send:', transactions.length);
    console.log('📋 [WC-MULTI] Transaction list:', JSON.stringify(transactions, null, 2));

    if (!this.signer || !this.provider) {
      console.error('❌ [WC-MULTI] Service not initialized');
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const results: WalletConnectSafeTransactionResult[] = [];
    const totalTxs = transactions.length;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const currentTx = i + 1;

      console.log(`🔄 [WC-MULTI] Processing transaction ${currentTx}/${totalTxs}`);
      console.log('📋 [WC-MULTI] Transaction details:', JSON.stringify(tx, null, 2));

      // Determine transaction type for better UX
      let txType = 'Transaction';
      if (totalTxs > 1) {
        if (tx.data.startsWith('0xf08a0323')) {
          txType = 'Set Fallback Handler';
        } else if (tx.data.startsWith('0x095ea7b3')) {
          txType = 'Token Approval';
        } else {
          txType = 'Conditional Order';
        }
      }

      console.log(`🏷️ [WC-MULTI] Transaction type determined: ${txType}`);

      // Call progress callback before starting transaction
      if (onProgress) {
        console.log('📊 [WC-MULTI] Calling progress callback (before):', currentTx - 1, totalTxs, txType);
        onProgress(currentTx - 1, totalTxs, txType);
      }

      try {
        console.log(`🔄 [WC-MULTI] Calling sendTransaction for ${currentTx}/${totalTxs}...`);
        const result = await this.sendTransaction(tx);
        console.log(`✅ [WC-MULTI] Transaction ${currentTx} completed:`, JSON.stringify(result, null, 2));

        results.push(result);

        console.log(`🎉 [WC-MULTI] Transaction ${currentTx} (${txType}) signed successfully:`, result.transactionHash);

        // Update progress after successful transaction signature
        if (onProgress) {
          console.log('📊 [WC-MULTI] Calling progress callback (after):', currentTx, totalTxs, txType, result.transactionHash);
          onProgress(currentTx, totalTxs, txType, result.transactionHash);
        }

        // Small delay between transactions to avoid overwhelming the Safe app
        if (i < transactions.length - 1) {
          console.log('⏳ [WC-MULTI] Waiting 1 second before next transaction...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`💥 [WC-MULTI] Transaction ${currentTx} (${txType}) failed:`, error);
        console.error('🔍 [WC-MULTI] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        // Stop the process and throw the error - don't continue with remaining transactions
        const errorMessage = `Transaction ${currentTx} (${txType}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌ [WC-MULTI] Throwing error:', errorMessage);
        throw new Error(errorMessage);
      }
    }

    console.log(`🎉 [WC-MULTI] All ${totalTxs} transactions signed successfully`);
    console.log('📋 [WC-MULTI] Final results:', JSON.stringify(results, null, 2));
    console.log('🏁 [WC-MULTI] sendMultipleTransactions END - SUCCESS');
    return results;
  }


  /**
   * Send transactions sequentially for Safe wallets
   * Each transaction is signed individually and treated as successful upon signature
   */
  async sendTransactionsSequentially(
    batchRequest: WalletConnectSafeBatchTransactionRequest,
    onProgress?: (current: number, total: number, txType: string) => void
  ): Promise<WalletConnectSafeTransactionResult[]> {
    console.log('🚀 [WC-BATCH] sendTransactionsSequentially START');
    console.log('🔍 [WC-BATCH] Batch request:', JSON.stringify(batchRequest, null, 2));
    console.log('🔍 [WC-BATCH] Service initialized:', !!this.signer, !!this.provider);

    if (!this.signer || !this.provider) {
      console.error('❌ [WC-BATCH] Service not initialized');
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const results: WalletConnectSafeTransactionResult[] = [];
    const totalTxs = batchRequest.transactions.length;

    console.log('🔍 [WC-BATCH] Total transactions to process:', totalTxs);

    for (let i = 0; i < batchRequest.transactions.length; i++) {
      const tx = batchRequest.transactions[i];
      const currentTx = i + 1;

      console.log(`🔄 [WC-BATCH] Processing transaction ${currentTx}/${totalTxs}`);
      console.log('📋 [WC-BATCH] Transaction details:', JSON.stringify(tx, null, 2));

      // Determine transaction type for better UX
      let txType = 'Transaction';
      if (totalTxs > 1) {
        if (tx.data.startsWith('0xf08a0323')) {
          txType = 'Set Fallback Handler';
        } else if (tx.data.startsWith('0x095ea7b3')) {
          txType = 'Token Approval';
        } else {
          txType = 'Conditional Order';
        }
      }

      console.log(`🏷️ [WC-BATCH] Transaction type determined: ${txType}`);

      // Call progress callback before starting transaction
      if (onProgress) {
        console.log('📊 [WC-BATCH] Calling progress callback (before):', currentTx - 1, totalTxs, txType);
        onProgress(currentTx - 1, totalTxs, txType);
      }

      try {
        console.log(`🔄 [WC-BATCH] Calling sendTransaction for ${currentTx}/${totalTxs}...`);
        const result = await this.sendTransaction(tx);
        console.log(`✅ [WC-BATCH] Transaction ${currentTx} completed:`, JSON.stringify(result, null, 2));

        results.push(result);

        console.log(`🎉 [WC-BATCH] Transaction ${currentTx} (${txType}) signed successfully:`, result.transactionHash);

        // Update progress after successful transaction signature
        if (onProgress) {
          console.log('📊 [WC-BATCH] Calling progress callback (after):', currentTx, totalTxs, txType);
          onProgress(currentTx, totalTxs, txType);
        }

        // Small delay between transactions to avoid overwhelming the Safe app
        if (i < batchRequest.transactions.length - 1) {
          console.log('⏳ [WC-BATCH] Waiting 1 second before next transaction...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`💥 [WC-BATCH] Transaction ${currentTx} (${txType}) failed:`, error);
        console.error('🔍 [WC-BATCH] Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));

        // Stop the process and throw the error - don't continue with remaining transactions
        const errorMessage = `Transaction ${currentTx} (${txType}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error('❌ [WC-BATCH] Throwing error:', errorMessage);
        throw new Error(errorMessage);
      }
    }

    console.log(`🎉 [WC-BATCH] All ${totalTxs} transactions signed successfully`);
    console.log('📋 [WC-BATCH] Final results:', JSON.stringify(results, null, 2));
    console.log('🏁 [WC-BATCH] sendTransactionsSequentially END - SUCCESS');
    return results;
  }

  isInitialized(): boolean {
    return this.signer !== null && this.provider !== null;
  }
}

// Singleton instance
export const walletConnectSafeService = new WalletConnectSafeService();