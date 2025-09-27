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
      
      return true;
    } catch (error) {
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
        
        const fromAddress = await this.signer.getAddress();
        
        // Simplified transaction request - remove problematic fields
        const rawTxRequest = {
          from: fromAddress,
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value || '0x0',
        };


        // Add small delay between retries
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }

        // Send via the provider's JSON-RPC directly
        const txHash = await (this.provider as any).send('eth_sendTransaction', [rawTxRequest]);
        

        return {
          transactionHash: txHash,
          success: true
        };

      } catch (error) {
        
        if (attempt === retries) {
          // Last attempt failed
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

    if (!this.provider) {
      throw new Error('Provider not initialized. Call initialize() first.');
    }

    try {
      const startTime = Date.now();

      const receipt = await Promise.race([
        this.provider.waitForTransaction(transactionHash),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction confirmation timeout')), timeoutMs)
        )
      ]);


      return receipt;
    } catch (error) {
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

    if (!this.signer) {
      throw new Error('Signer not initialized. Call initialize() first.');
    }

    try {

      // Prepare transaction - let Safe handle gas estimation
      const txRequest = {
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
      };


      // Get signer address for logging

      const startTime = Date.now();

      // Send transaction to Safe via WalletConnect
      // For Safe + WalletConnect, we treat successful signature as success
      const tx = await this.signer.sendTransaction(txRequest);


      if (!tx) {
        throw new Error('Transaction result is null - signing may have failed');
      }

      if (!tx.hash) {
        throw new Error('Transaction result missing hash - signing may have failed');
      }


      // For Safe wallets with WalletConnect:
      // - tx.hash indicates the transaction was successfully signed and submitted
      // - We don't wait for on-chain execution as that can be delayed (queued transactions)
      // - The Safe handles execution timing internally

      const result = {
        transactionHash: tx.hash,
        success: true
      };


      return result;

    } catch (error) {

      // Enhanced error handling for user rejection and common Safe errors
      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        // User rejection patterns
        if (errorMsg.includes('user rejected') ||
            errorMsg.includes('denied') ||
            errorMsg.includes('user denied') ||
            errorMsg.includes('user cancelled') ||
            errorMsg.includes('transaction was cancelled') ||
            errorMsg.includes('action_rejected') ||
            (error as any).code === 4001) {
          throw new Error('Transaction signing was refused by user');
        }

        // Safe-specific rejection patterns
        if (errorMsg.includes('safe transaction was rejected') ||
            errorMsg.includes('transaction rejected by safe') ||
            errorMsg.includes('user rejected the safe transaction')) {
          throw new Error('Transaction signing was refused in Safe wallet');
        }

        // Network/technical errors
        if (errorMsg.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction');
        }
        if (errorMsg.includes('gas')) {
          throw new Error('Gas estimation failed - check contract parameters');
        }
        if (errorMsg.includes('nonce')) {
          throw new Error('Transaction nonce error - please retry');
        }
        if (errorMsg.includes('replacement')) {
          throw new Error('Transaction replacement error - please wait and retry');
        }
        if (errorMsg.includes('network') || errorMsg.includes('connection')) {
          throw new Error('Network connection issue - please check your connection and retry');
        }
      }

      // Check for error codes that indicate user rejection
      if ((error as any)?.code === 4001 || (error as any)?.code === 'ACTION_REJECTED') {
        throw new Error('Transaction signing was refused by user');
      }

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

    if (!this.signer || !this.provider) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const results: WalletConnectSafeTransactionResult[] = [];
    const totalTxs = transactions.length;

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      const currentTx = i + 1;


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


      // Call progress callback before starting transaction
      if (onProgress) {
        onProgress(currentTx - 1, totalTxs, txType);
      }

      try {
        const result = await this.sendTransaction(tx);

        results.push(result);


        // Update progress after successful transaction signature
        if (onProgress) {
          onProgress(currentTx, totalTxs, txType, result.transactionHash);
        }

        // Small delay between transactions to avoid overwhelming the Safe app
        if (i < transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {

        // Stop the process and throw the error - don't continue with remaining transactions
        const errorMessage = `Transaction ${currentTx} (${txType}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new Error(errorMessage);
      }
    }

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

    if (!this.signer || !this.provider) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const results: WalletConnectSafeTransactionResult[] = [];
    const totalTxs = batchRequest.transactions.length;


    for (let i = 0; i < batchRequest.transactions.length; i++) {
      const tx = batchRequest.transactions[i];
      const currentTx = i + 1;


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


      // Call progress callback before starting transaction
      if (onProgress) {
        onProgress(currentTx - 1, totalTxs, txType);
      }

      try {
        const result = await this.sendTransaction(tx);

        results.push(result);


        // Update progress after successful transaction signature
        if (onProgress) {
          onProgress(currentTx, totalTxs, txType);
        }

        // Small delay between transactions to avoid overwhelming the Safe app
        if (i < batchRequest.transactions.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {

        // Stop the process and throw the error - don't continue with remaining transactions
        const errorMessage = `Transaction ${currentTx} (${txType}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        throw new Error(errorMessage);
      }
    }

    return results;
  }

  isInitialized(): boolean {
    return this.signer !== null && this.provider !== null;
  }
}

// Singleton instance
export const walletConnectSafeService = new WalletConnectSafeService();