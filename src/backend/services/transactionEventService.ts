import { ethers } from 'ethers';
import { ConditionalOrderParams } from '../interfaces/PolyswapOrder';

export interface TransactionEventDetails {
  blockNumber: number;
  logIndex: number;
  handler: string;
  appData: string;
  orderHash: string;
  staticInput: string;
  salt: string;
}

export class TransactionEventService {
  // Event ABI for ConditionalOrderCreated
  private static readonly CONDITIONAL_ORDER_CREATED_ABI = {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        name: "owner",
        type: "address"
      },
      {
        indexed: false,
        name: "params",
        type: "tuple",
        components: [
          { name: "handler", type: "address" },
          { name: "salt", type: "bytes32" },
          { name: "staticInput", type: "bytes" }
        ]
      }
    ],
    name: "ConditionalOrderCreated",
    type: "event"
  };

  private static readonly COMPOSABLE_COW_ADDRESS = process.env.COMPOSABLE_COW || '';
  private static readonly RPC_URL = process.env.RPC_URL || 'https://polygon-rpc.com/';

  /**
   * Fetch transaction event details from a transaction hash
   */
  static async getTransactionEventDetails(transactionHash: string): Promise<TransactionEventDetails | null> {
    try {
      const provider = new ethers.JsonRpcProvider(this.RPC_URL);
      const receipt = await provider.getTransactionReceipt(transactionHash);

      if (!receipt) {
        console.error(`Transaction receipt not found for hash: ${transactionHash}`);
        return null;
      }

      // Create contract interface for parsing logs
      const contractInterface = new ethers.Interface([this.CONDITIONAL_ORDER_CREATED_ABI]);

      // Find ConditionalOrderCreated events in the transaction
      let conditionalOrderEvent = null;

      for (const log of receipt.logs) {
        try {
          // Check if this log is from the ComposableCoW contract
          if (log.address.toLowerCase() !== this.COMPOSABLE_COW_ADDRESS.toLowerCase()) {
            continue;
          }

          // Try to parse the log as ConditionalOrderCreated event
          const parsedLog = contractInterface.parseLog({
            topics: log.topics,
            data: log.data
          });

          if (parsedLog?.name === 'ConditionalOrderCreated') {
            conditionalOrderEvent = {
              parsedLog,
              logIndex: log.index,
              blockNumber: receipt.blockNumber
            };
            break;
          }
        } catch (parseError) {
          // Log parsing failed, skip this log
          continue;
        }
      }

      if (!conditionalOrderEvent) {
        console.error(`No ConditionalOrderCreated event found in transaction: ${transactionHash}`);
        return null;
      }

      const { parsedLog, logIndex, blockNumber } = conditionalOrderEvent;
      const params = parsedLog.args.params as ConditionalOrderParams;
      const appData = this.extractAppDataFromStaticInput(params.staticInput);
      const orderHash = this.calculateOrderHash(params);

      const eventDetails: TransactionEventDetails = {
        blockNumber,
        logIndex,
        handler: params.handler,
        appData,
        orderHash,
        staticInput: params.staticInput,
        salt: params.salt
      };

      return eventDetails;

    } catch (error) {
      console.error(`Error fetching transaction event details:`, error);
      throw new Error(`Failed to fetch transaction event details: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract app_data from staticInput bytes
   */
  private static extractAppDataFromStaticInput(staticInput: string): string {
    try {
      const abiCoder = new ethers.AbiCoder();
      const dataLength = (staticInput.length - 2) / 2;
      const fieldsCount = Math.floor(dataLength / 32);

      if (fieldsCount === 8) {
        return "0x0000000000000000000000000000000000000000000000000000000000000000";
      } else if (fieldsCount === 9) {
        // 9 fields: full structure with appData
        const decoded = abiCoder.decode([
          "address", // sellToken
          "address", // buyToken
          "address", // receiver
          "uint256", // sellAmount
          "uint256", // minBuyAmount
          "uint256", // t0
          "uint256", // t
          "bytes32", // polymarketOrderHash
          "bytes32"  // appData
        ], staticInput);

        return decoded[8];
      } else {
        return "0x0000000000000000000000000000000000000000000000000000000000000000";
      }
    } catch (error) {
      console.error('Error extracting app_data from staticInput:', error);
      return "0x0000000000000000000000000000000000000000000000000000000000000000";
    }
  }

  /**
   * Calculate order hash from ConditionalOrderParams
   */
  private static calculateOrderHash(params: ConditionalOrderParams): string {
    try {
      const abiCoder = new ethers.AbiCoder();
      const encoded = abiCoder.encode([
        "tuple(address,bytes32,bytes)"
      ], [[params.handler, params.salt, params.staticInput]]);

      return ethers.keccak256(encoded);
    } catch (error) {
      console.error('Error calculating order hash:', error);
      throw error;
    }
  }
}