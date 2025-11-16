import { ethers } from 'ethers';

// Standard ERC20 ABI for allowance and approve functions
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export interface ApprovalCheck {
  needsApproval: boolean;
  currentAllowance: string;
  requiredAmount: string;
  approvalData?: string; // encoded approval transaction data
}

export interface ApprovalTransaction {
  to: string;
  data: string;
  value: string;
}

export class ERC20ApprovalService {
  private static readonly SPENDER_ADDRESS = process.env.SPENDER || process.env.COMPOSABLE_COW || '';
  
  /**
   * Check if approval is needed for a token transfer
   */
  static async checkApproval(
    tokenAddress: string,
    ownerAddress: string,
    amount: string,
    provider: ethers.Provider
  ): Promise<ApprovalCheck> {
    try {
      if (!this.SPENDER_ADDRESS) {
        throw new Error('SPENDER address not configured in environment variables');
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      const currentAllowance = await tokenContract.allowance(ownerAddress, this.SPENDER_ADDRESS);
      const requiredAmount = BigInt(amount);
      const needsApproval = currentAllowance < requiredAmount;
      
      let approvalData: string | undefined;
      if (needsApproval) {
        // Create approval transaction data for the required amount
        // Use MAX_UINT256 for unlimited approval to avoid future approval transactions
        const approvalAmount = ethers.MaxUint256;
        const tokenInterface = new ethers.Interface(ERC20_ABI);
        approvalData = tokenInterface.encodeFunctionData('approve', [
          this.SPENDER_ADDRESS,
          approvalAmount
        ]);
      }

      return {
        needsApproval,
        currentAllowance: currentAllowance.toString(),
        requiredAmount: requiredAmount.toString(),
        approvalData
      };

    } catch (error) {
      console.error('Error checking ERC20 approval:', error);
      throw new Error(`Failed to check approval: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create an approval transaction
   */
  static createApprovalTransaction(
    tokenAddress: string,
    amount?: string
  ): ApprovalTransaction {
    if (!this.SPENDER_ADDRESS) {
      throw new Error('SPENDER address not configured in environment variables');
    }

    // Use provided amount or MAX_UINT256 for unlimited approval
    const approvalAmount = amount ? BigInt(amount) : ethers.MaxUint256;
    
    const tokenInterface = new ethers.Interface(ERC20_ABI);
    const approvalData = tokenInterface.encodeFunctionData('approve', [
      this.SPENDER_ADDRESS,
      approvalAmount
    ]);

    return {
      to: tokenAddress,
      data: approvalData,
      value: '0'
    };
  }

  /**
   * Get token balance for an address
   */
  static async getTokenBalance(
    tokenAddress: string,
    ownerAddress: string,
    provider: ethers.Provider
  ): Promise<{
    balance: string;
    decimals: number;
    formattedBalance: string;
  }> {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
      
      const [balance, decimals] = await Promise.all([
        tokenContract.balanceOf(ownerAddress),
        tokenContract.decimals()
      ]);

      const formattedBalance = ethers.formatUnits(balance, decimals);

      return {
        balance: balance.toString(),
        decimals: Number(decimals),
        formattedBalance
      };

    } catch (error) {
      console.error('Error getting token balance:', error);
      throw new Error(`Failed to get token balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate that the user has sufficient token balance
   */
  static async validateBalance(
    tokenAddress: string,
    ownerAddress: string,
    requiredAmount: string,
    provider: ethers.Provider
  ): Promise<{
    hasSufficientBalance: boolean;
    balance: string;
    required: string;
  }> {
    try {
      const balanceInfo = await this.getTokenBalance(tokenAddress, ownerAddress, provider);
      const balance = BigInt(balanceInfo.balance);
      const required = BigInt(requiredAmount);

      return {
        hasSufficientBalance: balance >= required,
        balance: balance.toString(),
        required: required.toString()
      };

    } catch (error) {
      console.error('Error validating token balance:', error);
      throw new Error(`Failed to validate balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default ERC20ApprovalService;