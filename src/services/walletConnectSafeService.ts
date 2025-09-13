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
        const txHash = await this.provider!.send('eth_sendTransaction', [rawTxRequest]);
        
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
      
      // Send transaction to Safe via WalletConnect
      // The Safe mobile/desktop app will handle the signing and execution
      const tx = await this.signer.sendTransaction(txRequest);

      console.log('Transaction sent, hash:', tx.hash);

      // For Safe wallets, the transaction might be queued and not immediately executed
      // We'll wait for it but with a timeout
      try {
        const receipt = await Promise.race([
          tx.wait(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), 60000)
          )
        ]) as any;
        
        if (receipt && receipt.status === 1) {
          console.log('Transaction confirmed:', receipt.hash);
          return {
            transactionHash: receipt.hash,
            success: true
          };
        } else {
          console.log('Transaction was sent but may be pending additional signatures');
          return {
            transactionHash: tx.hash,
            success: true
          };
        }
      } catch (waitError) {
        console.log('Transaction sent but confirmation timeout - this is normal for Safe multi-sig');
        // For Safe wallets, this is often normal - the transaction is queued
        return {
          transactionHash: tx.hash,
          success: true
        };
      }

    } catch (error) {
      console.error('Error sending Safe transaction via WalletConnect:', error);
      
      // Check if it's a user rejection
      if (error instanceof Error) {
        if (error.message.includes('User rejected') || error.message.includes('denied')) {
          throw new Error('Transaction was rejected by user');
        }
        if (error.message.includes('insufficient funds')) {
          throw new Error('Insufficient funds for transaction');
        }
        if (error.message.includes('gas')) {
          throw new Error('Gas estimation failed - check contract parameters');
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
   * Uses MultiSend contract for batching multiple transactions, or direct transaction for single transaction
   */
  async sendBatchTransaction(
    batchRequest: WalletConnectSafeBatchTransactionRequest
  ): Promise<WalletConnectSafeTransactionResult> {
    if (!this.signer || !this.provider) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    try {
      console.log('Sending Safe batch transaction via WalletConnect:', batchRequest);

      // If there's only one transaction, send it directly instead of using MultiSend
      if (batchRequest.transactions.length === 1) {
        console.log('Single transaction detected, sending directly without MultiSend');
        return await this.sendTransaction(batchRequest.transactions[0]);
      }

      // For multiple transactions, use MultiSend
      console.log('Multiple transactions detected, using MultiSend');
      
      // For WalletConnect with Safe, we can try using MultiSend
      // MultiSend allows batching multiple transactions into one
      const MULTISEND_ADDRESS = '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761'; // Ethereum mainnet MultiSend
      
      // Encode batch transaction data for MultiSend
      const batchData = await this.encodeBatchTransactionData(batchRequest.transactions);
      
      const multisendTransaction: WalletConnectSafeTransactionRequest = {
        to: MULTISEND_ADDRESS,
        data: batchData,
        value: '0'
      };

      // Send the batched transaction via MultiSend
      return await this.sendTransaction(multisendTransaction);

    } catch (error) {
      console.error('Error sending batch Safe transaction via WalletConnect:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to send batch transaction');
    }
  }

  /**
   * Encode multiple transactions for MultiSend contract
   */
  private async encodeBatchTransactionData(transactions: WalletConnectSafeTransactionRequest[]): Promise<string> {
    try {
      // MultiSend ABI for multiSend function
      const multisendInterface = new ethers.Interface([
        'function multiSend(bytes transactions)'
      ]);

      // Encode each transaction for MultiSend format
      // Each transaction: operation (1 byte) + to (20 bytes) + value (32 bytes) + dataLength (32 bytes) + data (dataLength bytes)
      let encodedTransactions = '0x';
      
      for (const tx of transactions) {
        const operation = '00'; // CALL operation
        const to = tx.to.slice(2).padStart(40, '0'); // Remove 0x and pad to 20 bytes
        const value = BigInt(tx.value || '0').toString(16).padStart(64, '0'); // 32 bytes
        const dataLength = ((tx.data.length - 2) / 2).toString(16).padStart(64, '0'); // 32 bytes
        const data = tx.data.slice(2); // Remove 0x
        
        encodedTransactions += operation + to + value + dataLength + data;
      }

      // Encode the multiSend call
      return multisendInterface.encodeFunctionData('multiSend', [encodedTransactions]);

    } catch (error) {
      console.error('Error encoding batch transaction data:', error);
      throw new Error('Failed to encode batch transaction data');
    }
  }

  /**
   * Fallback: send transactions sequentially if batch fails
   */
  async sendTransactionsSequentially(
    batchRequest: WalletConnectSafeBatchTransactionRequest
  ): Promise<WalletConnectSafeTransactionResult[]> {
    if (!this.signer || !this.provider) {
      throw new Error('Service not initialized. Call initialize() first.');
    }

    const results: WalletConnectSafeTransactionResult[] = [];
    
    for (let i = 0; i < batchRequest.transactions.length; i++) {
      const tx = batchRequest.transactions[i];
      console.log(`Sending transaction ${i + 1}/${batchRequest.transactions.length}:`, tx);
      
      try {
        const result = await this.sendTransaction(tx);
        results.push(result);
      } catch (error) {
        console.error(`Transaction ${i + 1} failed:`, error);
        // Continue with remaining transactions
        results.push({
          transactionHash: '',
          success: false
        });
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