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
   * Send transaction via WalletConnect to Safe
   * The Safe app will handle the multi-sig requirements internally
   */
  async sendTransaction(
    transactionRequest: WalletConnectSafeTransactionRequest
  ): Promise<WalletConnectSafeTransactionResult> {
    if (!this.signer) {
      throw new Error('Signer not initialized. Call initialize() first.');
    }

    try {
      console.log('Sending Safe transaction via WalletConnect:', transactionRequest);
      
      // First, estimate gas to make sure the transaction is valid
      let gasEstimate: bigint;
      try {
        gasEstimate = await this.provider!.estimateGas({
          to: transactionRequest.to,
          data: transactionRequest.data,
          value: transactionRequest.value,
          from: await this.signer.getAddress()
        });
        console.log('Gas estimate:', gasEstimate.toString());
      } catch (estimateError) {
        console.error('Gas estimation failed:', estimateError);
        // Use a reasonable default gas limit for Safe transactions
        gasEstimate = BigInt(200000);
      }

      // Prepare transaction - let Safe handle gas estimation
      const txRequest = {
        to: transactionRequest.to,
        data: transactionRequest.data,
        value: transactionRequest.value,
        // Remove gas fields - let Safe estimate these
      };

      console.log('Sending transaction with params:', txRequest);

      // Send transaction to Safe via WalletConnect with timeout
      // The Safe mobile/desktop app will handle the signing and execution
      console.log('⏳ Waiting for user to sign transaction in Safe app...');

      const tx = await Promise.race([
        this.signer.sendTransaction(txRequest),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Transaction signing timeout - user may have rejected or closed the Safe app')), 300000) // 5 minutes
        )
      ]) as any;

      console.log('Transaction sent, hash:', tx.hash);

      // For Safe wallets, we don't rely on tx.wait() as it's unreliable
      // Safe transactions are often queued and may not immediately execute
      // If we got a transaction hash, the transaction was successfully submitted

      console.log('Safe transaction submitted successfully');

      // Try to get confirmation with a short timeout, but don't fail if it times out
      try {
        console.log('Attempting to get transaction confirmation (optional)...');
        const receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Quick confirmation timeout')), 30000) // Short 30-second timeout
          )
        ]) as any;

        console.log('Received receipt:', receipt);

        if (receipt && receipt.status === 1) {
          console.log('Transaction confirmed quickly:', receipt.hash);
          return {
            transactionHash: receipt.hash,
            success: true
          };
        }
      } catch (waitError) {
        console.log('Quick confirmation timeout - this is normal for Safe transactions');
      }

      // Always return success if we have a transaction hash from Safe
      // The transaction was successfully submitted to the Safe
      console.log('Returning success with Safe transaction hash');
      return {
        transactionHash: tx.hash,
        success: true
      };

    } catch (error) {
      console.error('Error sending Safe transaction via WalletConnect:', error);
      
      // Enhanced error handling for user rejection and common Safe errors
      if (error instanceof Error) {
        // Check for timeout errors first - these should not be treated as user rejection
        if (error.message.includes('Transaction signing timeout') ||
            error.message.includes('Transaction confirmation timeout')) {
          throw error; // Re-throw timeout errors as-is
        }

        // User rejection patterns (only for actual rejections, not timeouts)
        if (error.message.includes('User rejected') ||
            error.message.includes('denied') ||
            error.message.includes('User denied') ||
            error.message.includes('User cancelled') ||
            error.message.includes('Transaction was cancelled') ||
            error.message.includes('ACTION_REJECTED') ||
            (error as any).code === 4001) {
          throw new Error('Transaction signing was refused by user');
        }

        // Safe-specific rejection patterns
        if (error.message.includes('Safe transaction was rejected') ||
            error.message.includes('Transaction rejected by Safe') ||
            error.message.includes('User rejected the Safe transaction')) {
          throw new Error('Transaction signing was refused in Safe wallet');
        }

        // Other common errors
        if (error.message.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction');
        }
        if (error.message.includes('gas')) {
          throw new Error('Gas estimation failed - check contract parameters');
        }
        if (error.message.includes('nonce')) {
          throw new Error('Transaction nonce error - please retry');
        }
        if (error.message.includes('replacement')) {
          throw new Error('Transaction replacement error - please wait and retry');
        }
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
   * Send a batch of transactions to Safe via WalletConnect
   * Safe WalletConnect doesn't support direct MultiSend calls, so we fall back to sequential transactions
   */
  async sendBatchTransaction(
    batchRequest: WalletConnectSafeBatchTransactionRequest
  ): Promise<WalletConnectSafeTransactionResult> {
    if (!this.signer || !this.provider) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    try {
      console.log('Sending Safe batch transaction via WalletConnect:', batchRequest);

      // If there's only one transaction, send it directly
      if (batchRequest.transactions.length === 1) {
        console.log('Single transaction detected, sending directly');
        return await this.sendTransaction(batchRequest.transactions[0]);
      }

      // For Safe WalletConnect, batch transactions through MultiSend don't work reliably
      // because the MultiSend contract requires delegatecall which WalletConnect can't handle properly
      console.log('Multiple transactions detected - Safe WalletConnect requires sequential execution');

      // Use sequential transactions as the primary method for Safe WalletConnect
      // This will now throw an error if any transaction fails, stopping the process
      const results = await this.sendTransactionsSequentially(batchRequest);

      // If we get here, all transactions succeeded
      const lastSuccessfulResult = results[results.length - 1];
      return lastSuccessfulResult;

    } catch (error) {
      console.error('Error sending Safe transactions via WalletConnect:', error);
      throw new Error(`Safe transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  /**
   * Fallback: send transactions sequentially if batch fails
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

      console.log(`Sending transaction ${currentTx}/${totalTxs} (${txType}):`, tx);

      // Call progress callback
      if (onProgress) {
        onProgress(currentTx - 1, totalTxs, txType); // -1 because we're about to start this transaction
      }

      try {
        const result = await this.sendTransaction(tx);
        results.push(result);

        // Update progress after successful transaction
        if (onProgress) {
          onProgress(currentTx, totalTxs, txType);
        }
      } catch (error) {
        console.error(`Transaction ${currentTx} (${txType}) failed:`, error);

        // Stop the process and throw the error - don't continue with remaining transactions
        throw new Error(`Transaction ${currentTx} (${txType}) failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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