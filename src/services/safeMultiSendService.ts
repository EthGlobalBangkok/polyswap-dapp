import { ethers } from 'ethers';

export interface MultiSendTransaction {
  to: string;
  data: string;
  value: string;
}

/**
 * Service for encoding transactions for Safe's MultiSend contract
 * MultiSend allows executing multiple transactions atomically in a single Safe transaction
 * 
 * MultiSend contract addresses:
 * - Mainnet/Polygon: 0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761 (MultiSendCallOnly - recommended)
 * - Alternative: 0x40A2aCCbd92BCA938b02010E17A5b8929b49130D (original MultiSend)
 */
export class SafeMultiSendService {
  // MultiSendCallOnly contract - only allows CALL operations (not DELEGATECALL)
  // This is the recommended version for most use cases
  private static readonly MULTISEND_CALL_ONLY_ADDRESS = 
    process.env.NEXT_PUBLIC_MULTISEND_CALL_ONLY || '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761';

  /**
   * Encode multiple transactions for MultiSend
   * Format: 0x8d80ff0a + encoded transactions
   * 
   * Each transaction is encoded as:
   * - operation (1 byte): 0 = Call, 1 = DelegateCall
   * - to (20 bytes): target address
   * - value (32 bytes): ETH value to send
   * - dataLength (32 bytes): length of data
   * - data (dynamic): transaction data
   */
  static encodeMultiSend(transactions: MultiSendTransaction[]): { to: string; data: string; value: string } {
    if (transactions.length === 0) {
      throw new Error('No transactions to encode');
    }

    // If only one transaction, return it directly (no need for MultiSend)
    if (transactions.length === 1) {
      return transactions[0];
    }

    // Encode each transaction
    const encodedTransactions = transactions.map(tx => {
      // Operation: 0 = Call (we always use Call, not DelegateCall)
      const operation = '00'; // No 0x prefix - we're building raw hex string
      
      // Target address (20 bytes)
      const to = ethers.getAddress(tx.to).toLowerCase().replace('0x', '');
      
      // Value (32 bytes)
      const value = ethers.zeroPadValue(ethers.toBeHex(tx.value || '0'), 32).replace('0x', '');
      
      // Data
      const data = tx.data.replace('0x', '');
      const dataLength = ethers.zeroPadValue(ethers.toBeHex(data.length / 2), 32).replace('0x', '');
      
      // Concatenate: operation + to + value + dataLength + data
      return operation + to + value + dataLength + data;
    });

    // Concatenate all encoded transactions
    const packedTransactions = '0x' + encodedTransactions.join('');

    // MultiSend function signature: multiSend(bytes)
    const multiSendInterface = new ethers.Interface([
      'function multiSend(bytes transactions)'
    ]);

    // Encode the multiSend call
    const multiSendData = multiSendInterface.encodeFunctionData('multiSend', [packedTransactions]);

    return {
      to: this.MULTISEND_CALL_ONLY_ADDRESS,
      data: multiSendData,
      value: '0' // MultiSend itself doesn't receive value
    };
  }

  /**
   * Check if a transaction is a MultiSend transaction
   */
  static isMultiSendTransaction(to: string, data: string): boolean {
    const isMultiSendAddress = to.toLowerCase() === this.MULTISEND_CALL_ONLY_ADDRESS.toLowerCase();
    const isMultiSendCall = data.startsWith('0x8d80ff0a'); // multiSend function selector
    return isMultiSendAddress && isMultiSendCall;
  }

  /**
   * Get the MultiSend contract address
   */
  static getMultiSendAddress(): string {
    return this.MULTISEND_CALL_ONLY_ADDRESS;
  }

  /**
   * Validate that all transactions are valid for MultiSend
   */
  static validateTransactions(transactions: MultiSendTransaction[]): { valid: boolean; error?: string } {
    if (transactions.length === 0) {
      return { valid: false, error: 'No transactions provided' };
    }

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      
      // Validate address
      if (!ethers.isAddress(tx.to)) {
        return { valid: false, error: `Transaction ${i}: Invalid target address` };
      }

      // Validate data
      if (!tx.data.startsWith('0x')) {
        return { valid: false, error: `Transaction ${i}: Data must start with 0x` };
      }

      // Validate value (must be a valid hex string or number)
      try {
        BigInt(tx.value || '0');
      } catch {
        return { valid: false, error: `Transaction ${i}: Invalid value` };
      }
    }

    return { valid: true };
  }

  /**
   * Create a human-readable summary of the MultiSend transaction
   */
  static createTransactionSummary(transactions: MultiSendTransaction[]): {
    count: number;
    types: string[];
    totalValue: string;
  } {
    const types: string[] = [];
    let totalValue = 0n;

    for (const tx of transactions) {
      // Determine transaction type by function selector
      const selector = tx.data.slice(0, 10);
      
      let txType = 'Unknown';
      switch (selector) {
        case '0xf08a0323':
          txType = 'Set Fallback Handler';
          break;
        case '0x3365582c':
          txType = 'Set Domain Verifier';
          break;
        case '0x095ea7b3':
          txType = 'Token Approval';
          break;
        case '0x0d0d9800':
          txType = 'Conditional Order';
          break;
        default:
          txType = 'Contract Call';
      }
      
      types.push(txType);
      totalValue += BigInt(tx.value || '0');
    }

    return {
      count: transactions.length,
      types,
      totalValue: totalValue.toString()
    };
  }
}

export default SafeMultiSendService;

