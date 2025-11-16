import { ethers } from 'ethers';

export interface DomainVerifierTransaction {
  to: string;
  data: string;
  value: string;
}

/**
 * Service for setting Safe domain verifier for CoW Protocol conditional orders
 * Sets the domain verifier by calling setDomainVerifier(bytes32 domainSeparator, address verifier)
 * on the Safe contract with the ComposableCoW domain separator and address
 */
export class SafeDomainVerifierService {
  // ComposableCoW contract address
  private static readonly COMPOSABLE_COW_ADDRESS = process.env.NEXT_PUBLIC_COMPOSABLE_COW || '0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74';

  /**
   * Fetch the domain separator from the ComposableCoW contract
   */
  static async getDomainSeparator(provider: ethers.Provider): Promise<string> {
    try {
      // ComposableCoW domainSeparator() function signature
      const composableCowInterface = new ethers.Interface([
        'function domainSeparator() view returns (bytes32)'
      ]);

      const contract = new ethers.Contract(
        this.COMPOSABLE_COW_ADDRESS,
        composableCowInterface,
        provider
      );

      return await contract.domainSeparator();
    } catch (error) {
      console.error('Error fetching domain separator from ComposableCoW:', error);
      throw new Error(`Failed to fetch domain separator: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a transaction to set the domain verifier on the Safe
   * Calls setDomainVerifier(bytes32 domainSeparator, address verifier) on the Safe
   *
   * @param safeAddress - The Safe wallet address
   * @param domainSeparator - The domain separator from ComposableCoW contract
   * @param verifierAddress - The verifier address (ComposableCoW address)
   */
  static createSetDomainVerifierTransaction(
    safeAddress: string,
    domainSeparator: string,
    verifierAddress?: string
  ): DomainVerifierTransaction {
    try {
      const verifier = verifierAddress || this.COMPOSABLE_COW_ADDRESS;

      // Safe's setDomainVerifier function signature
      const safeInterface = new ethers.Interface([
        'function setDomainVerifier(bytes32 domainSeparator, address verifier)'
      ]);

      // Encode the function call
      const data = safeInterface.encodeFunctionData('setDomainVerifier', [
        domainSeparator,
        verifier
      ]);

      return {
        to: safeAddress,
        data: data,
        value: '0'
      };
    } catch (error) {
      console.error('Error creating setDomainVerifier transaction:', error);
      throw new Error(`Failed to create transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a domain verifier transaction by fetching the domain separator from ComposableCoW
   * This is the main method to use when adding domain verifier setup to batch transactions
   *
   * Since we cannot check if domain verifier is already set, this will always create the transaction
   * when called (typically when fallback handler is not set up)
   */
  static async createDomainVerifierTransaction(
    safeAddress: string,
    provider: ethers.Provider,
    verifierAddress?: string
  ): Promise<DomainVerifierTransaction> {
    try {
      // Fetch domain separator from ComposableCoW contract
      const domainSeparator = await this.getDomainSeparator(provider);

      return this.createSetDomainVerifierTransaction(
        safeAddress,
        domainSeparator,
        verifierAddress
      );
    } catch (error) {
      console.error('Error creating domain verifier transaction:', error);
      throw new Error(`Failed to create domain verifier transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default SafeDomainVerifierService;
