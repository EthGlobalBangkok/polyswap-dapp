import { ethers } from 'ethers';
import { ERC20ApprovalService, ApprovalCheck } from './erc20ApprovalService';

export interface BatchTransactionRequest {
  to: string;
  data: string;
  value: string;
}

export interface BatchTransactionResult {
  transactions: BatchTransactionRequest[];
  needsApproval: boolean;
  approvalTransaction?: BatchTransactionRequest;
  mainTransaction: BatchTransactionRequest;
}

export class SafeBatchService {
  
  /**
   * Prepare a batch of transactions including approval if needed
   */
  static async prepareBatchTransaction(
    tokenAddress: string,
    ownerAddress: string,
    sellAmount: string,
    mainTransaction: BatchTransactionRequest,
    provider: ethers.Provider
  ): Promise<BatchTransactionResult> {
    try {
      console.log('Preparing batch transaction with approval check:', {
        tokenAddress,
        ownerAddress,
        sellAmount,
        mainTransaction
      });

      // Check if approval is needed
      const approvalCheck = await ERC20ApprovalService.checkApproval(
        tokenAddress,
        ownerAddress,
        sellAmount,
        provider
      );

      console.log('Approval check result:', approvalCheck);

      const transactions: BatchTransactionRequest[] = [];

      // Add approval transaction if needed
      if (approvalCheck.needsApproval && approvalCheck.approvalData) {
        const approvalTransaction: BatchTransactionRequest = {
          to: tokenAddress,
          data: approvalCheck.approvalData,
          value: '0'
        };
        
        transactions.push(approvalTransaction);
        console.log('Added approval transaction to batch');

        // Return batch with approval + main transaction
        transactions.push(mainTransaction);
        
        return {
          transactions,
          needsApproval: true,
          approvalTransaction,
          mainTransaction
        };
      } else {
        // Only main transaction needed
        transactions.push(mainTransaction);
        
        return {
          transactions,
          needsApproval: false,
          mainTransaction
        };
      }

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
    summary: string[];
  } {
    const summary: string[] = [];
    
    if (batchResult.needsApproval) {
      summary.push('1. Approve ERC20 token spending (unlimited approval)');
      summary.push('2. Execute conditional order transaction');
    } else {
      summary.push('1. Execute conditional order transaction');
    }

    return {
      transactionCount: batchResult.transactions.length,
      hasApproval: batchResult.needsApproval,
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
}

export default SafeBatchService;