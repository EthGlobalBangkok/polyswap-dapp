import { ethers } from 'ethers';
import { ERC20ApprovalService } from './erc20ApprovalService';
import { SafeFallbackHandlerService } from './safeFallbackHandlerService';

export interface BatchTransactionRequest {
  to: string;
  data: string;
  value: string;
}

export interface BatchTransactionResult {
  transactions: BatchTransactionRequest[];
  needsApproval: boolean;
  approvalTransaction?: BatchTransactionRequest;
  needsFallbackHandler: boolean;
  fallbackHandlerTransaction?: BatchTransactionRequest;
  mainTransaction: BatchTransactionRequest;
}

export class SafeBatchService {
  
  /**
   * Prepare a batch of transactions including fallback handler, approval, and main transaction
   */
  static async prepareBatchTransaction(
    tokenAddress: string,
    ownerAddress: string,
    sellAmount: string,
    mainTransaction: BatchTransactionRequest,
    provider: ethers.Provider
  ): Promise<BatchTransactionResult> {
    try {
      console.log('Preparing batch transaction with fallback handler and approval checks:', {
        tokenAddress,
        ownerAddress,
        sellAmount,
        mainTransaction
      });

      const transactions: BatchTransactionRequest[] = [];
      let needsFallbackHandler = false;
      let fallbackHandlerTransaction: BatchTransactionRequest | undefined;

      // Step 1: Check if Safe fallback handler needs to be set
      try {
        const fallbackTx = await SafeFallbackHandlerService.checkAndCreateFallbackHandlerTransaction(
          ownerAddress,
          provider
        );

        console.log('🔍 AFTER FALLBACK CHECK:', {
          ownerAddress,
          fallbackTx: fallbackTx,
          fallbackTxTruthy: !!fallbackTx,
          fallbackTxNull: fallbackTx === null
        });

        if (fallbackTx) {
          console.log('🚨 ADDING FALLBACK HANDLER TO BATCH - THIS SHOULD NOT HAPPEN!');
          needsFallbackHandler = true;
          fallbackHandlerTransaction = {
            to: fallbackTx.to,
            data: fallbackTx.data,
            value: fallbackTx.value
          };
          transactions.push(fallbackHandlerTransaction);
        }
      } catch (error) {
        console.warn('Could not check fallback handler (may not be a Safe wallet):', error);
        // Continue without fallback handler check - this is normal for EOA wallets
      }

      // Step 2: Check if approval is needed
      const approvalCheck = await ERC20ApprovalService.checkApproval(
        tokenAddress,
        ownerAddress,
        sellAmount,
        provider
      );

      console.log('Approval check result:', approvalCheck);

      let needsApproval = false;
      let approvalTransaction: BatchTransactionRequest | undefined;

      // Add approval transaction if needed
      if (approvalCheck.needsApproval && approvalCheck.approvalData) {
        needsApproval = true;
        approvalTransaction = {
          to: tokenAddress,
          data: approvalCheck.approvalData,
          value: '0'
        };

        transactions.push(approvalTransaction);
      }

      // Step 3: Add the main transaction
      transactions.push(mainTransaction);

      return {
        transactions,
        needsApproval,
        approvalTransaction,
        needsFallbackHandler,
        fallbackHandlerTransaction,
        mainTransaction
      };

    } catch (error) {
      console.error('Error preparing batch transaction:', error);
      throw new Error(`Failed to prepare batch transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that the user has sufficient balance for the transaction
   */
  static async validateUserBalance(
    tokenAddress: string,
    ownerAddress: string,
    requiredAmount: string,
    provider: ethers.Provider
  ): Promise<{
    isValid: boolean;
    balance: string;
    required: string;
    formatted: {
      balance: string;
      required: string;
    };
  }> {
    try {
      // Get balance info with decimals
      const balanceInfo = await ERC20ApprovalService.getTokenBalance(
        tokenAddress,
        ownerAddress,
        provider
      );

      const balance = BigInt(balanceInfo.balance);
      const required = BigInt(requiredAmount);

      // Format amounts for display
      const formattedRequired = ethers.formatUnits(required, balanceInfo.decimals);

      return {
        isValid: balance >= required,
        balance: balance.toString(),
        required: required.toString(),
        formatted: {
          balance: balanceInfo.formattedBalance,
          required: formattedRequired
        }
      };

    } catch (error) {
      console.error('Error validating user balance:', error);
      throw new Error(`Failed to validate balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create transaction summary for user display
   */
  static createTransactionSummary(batchResult: BatchTransactionResult): {
    transactionCount: number;
    hasApproval: boolean;
    hasFallbackHandler: boolean;
    summary: string[];
  } {
    const summary: string[] = [];
    let step = 1;

    if (batchResult.needsFallbackHandler) {
      summary.push(`${step}. Set Safe fallback handler to PolySwap handler`);
      step++;
    }

    if (batchResult.needsApproval) {
      summary.push(`${step}. Approve ERC20 token spending (unlimited approval)`);
      step++;
    }

    summary.push(`${step}. Execute conditional order transaction`);

    return {
      transactionCount: batchResult.transactions.length,
      hasApproval: batchResult.needsApproval,
      hasFallbackHandler: batchResult.needsFallbackHandler,
      summary
    };
  }

  /**
   * Estimate total gas for the batch transaction
   */
  static async estimateBatchGas(
    batchResult: BatchTransactionResult,
    provider: ethers.Provider,
    fromAddress: string
  ): Promise<{
    totalGasEstimate: bigint;
    individualEstimates: bigint[];
    estimatedCost: string; // in ETH
  }> {
    try {
      const estimates: bigint[] = [];
      
      for (const tx of batchResult.transactions) {
        try {
          const gasEstimate = await provider.estimateGas({
            to: tx.to,
            data: tx.data,
            value: tx.value,
            from: fromAddress
          });
          estimates.push(gasEstimate);
        } catch (error) {
          console.warn('Gas estimation failed for transaction, using default:', error);
          // Use reasonable defaults for different transaction types
          const defaultGas = tx.data.startsWith('0xa9059cbb') ? BigInt(65000) : BigInt(200000); // transfer vs complex
          estimates.push(defaultGas);
        }
      }

      const totalGasEstimate = estimates.reduce((sum, gas) => sum + gas, BigInt(0));
      
      // Get current gas price for cost estimation
      const gasPrice = await provider.getFeeData();
      const effectiveGasPrice = gasPrice.gasPrice || BigInt(20000000000); // 20 gwei fallback
      
      const estimatedCost = ethers.formatEther(totalGasEstimate * effectiveGasPrice);

      return {
        totalGasEstimate,
        individualEstimates: estimates,
        estimatedCost
      };

    } catch (error) {
      console.error('Error estimating batch gas:', error);
      // Return conservative estimates
      const defaultTotal = BigInt(batchResult.transactions.length * 200000);
      return {
        totalGasEstimate: defaultTotal,
        individualEstimates: batchResult.transactions.map(() => BigInt(200000)),
        estimatedCost: '0.01' // Conservative estimate
      };
    }
  }

  /**
   * Get comprehensive Safe wallet information including fallback handler status
   */
  static async getSafeWalletInfo(
    walletAddress: string,
    provider: ethers.Provider
  ): Promise<{
    isValidSafe: boolean;
    threshold?: number;
    owners?: string[];
    fallbackHandler: string;
    fallbackHandlerCheck: {
      currentHandler: string;
      expectedHandler: string;
      isCorrect: boolean;
      needsUpdate: boolean;
    };
    needsFallbackHandlerUpdate: boolean;
  }> {
    try {
      const safeInfo = await SafeFallbackHandlerService.getSafeInfo(walletAddress, provider);

      return {
        isValidSafe: safeInfo.isValidSafe,
        threshold: safeInfo.threshold,
        owners: safeInfo.owners,
        fallbackHandler: safeInfo.fallbackHandler,
        fallbackHandlerCheck: safeInfo.fallbackHandlerCheck,
        needsFallbackHandlerUpdate: safeInfo.fallbackHandlerCheck.needsUpdate
      };
    } catch (error) {
      console.error('Error getting Safe wallet info:', error);
      throw new Error(`Failed to get Safe wallet info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the given address is a Safe wallet that needs fallback handler setup
   */
  static async requiresFallbackHandlerSetup(
    walletAddress: string,
    provider: ethers.Provider
  ): Promise<boolean> {
    try {
      const safeInfo = await this.getSafeWalletInfo(walletAddress, provider);
      return safeInfo.isValidSafe && safeInfo.needsFallbackHandlerUpdate;
    } catch (error) {
      console.warn('Could not check fallback handler requirements:', error);
      return false; // Assume no setup needed if we can't check
    }
  }
}

export default SafeBatchService;