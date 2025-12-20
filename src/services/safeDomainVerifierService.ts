import { ethers } from "ethers";
import { SafeFallbackHandlerService } from "./safeFallbackHandlerService";

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
  private static readonly COMPOSABLE_COW_ADDRESS =
    process.env.NEXT_PUBLIC_COMPOSABLE_COW || "0xfdaFc9d1902f4e0b84f65F49f244b32b31013b74";

  /**
   * Fetch the domain separator from the ComposableCoW contract
   */
  static async getDomainSeparator(provider: ethers.Provider): Promise<string> {
    try {
      // ComposableCoW domainSeparator() function signature
      const composableCowInterface = new ethers.Interface([
        "function domainSeparator() view returns (bytes32)",
      ]);

      const contract = new ethers.Contract(
        this.COMPOSABLE_COW_ADDRESS,
        composableCowInterface,
        provider
      );

      return await contract.domainSeparator();
    } catch (error) {
      console.error("Error fetching domain separator from ComposableCoW:", error);
      throw new Error(
        `Failed to fetch domain separator: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Get the current domain verifier for a Safe address
   * Calls domainVerifiers(address safe, bytes32 domainSeparator) on the Safe's fallback handler
   */
  static async getCurrentDomainVerifier(
    safeAddress: string,
    domainSeparator: string,
    provider: ethers.Provider
  ): Promise<string> {
    try {
      // Get the actual fallback handler set on this Safe
      const handlerAddress = await SafeFallbackHandlerService.EXPECTED_HANDLER;

      // ExtensibleFallbackHandler domainVerifiers mapping signature
      const handlerInterface = new ethers.Interface([
        "function domainVerifiers(address, bytes32) view returns (address)",
      ]);

      const contract = new ethers.Contract(handlerAddress, handlerInterface, provider);

      const verifier = await contract.domainVerifiers(safeAddress, domainSeparator);
      return verifier;
    } catch (error) {
      console.error("Error reading domain verifier:", error);
      throw new Error(
        `Failed to read domain verifier: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Check if the Safe has the correct domain verifier set
   * Returns true if domain verifier is correctly set, false if it needs update
   */
  static async isDomainVerifierCorrect(
    safeAddress: string,
    domainSeparator: string,
    provider: ethers.Provider
  ): Promise<boolean> {
    try {
      const expected = this.COMPOSABLE_COW_ADDRESS.toLowerCase();
      const current = await this.getCurrentDomainVerifier(safeAddress, domainSeparator, provider);

      return current.toLowerCase() === expected;
    } catch (error) {
      console.error("Error checking domain verifier:", error);
      // If we can't check, assume it needs to be set
      return false;
    }
  }

  /**
   * Create a transaction to set the domain verifier on the Safe
   * Calls setDomainVerifier(bytes32 domainSeparator, address verifier) on the Safe
   */
  static createSetDomainVerifierTransaction(
    safeAddress: string,
    domainSeparator: string
  ): DomainVerifierTransaction {
    try {
      // Safe's setDomainVerifier function signature
      const safeInterface = new ethers.Interface([
        "function setDomainVerifier(bytes32 domainSeparator, address verifier)",
      ]);

      // Encode the function call
      const data = safeInterface.encodeFunctionData("setDomainVerifier", [
        domainSeparator,
        this.COMPOSABLE_COW_ADDRESS,
      ]);

      return {
        to: safeAddress,
        data: data,
        value: "0",
      };
    } catch (error) {
      console.error("Error creating setDomainVerifier transaction:", error);
      throw new Error(
        `Failed to create transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  /**
   * Check if a domain verifier transaction is needed and create it if required
   * Returns object with needsDomainVerifier flag and transaction (if needed)
   *
   * This is the main method to use when adding domain verifier setup to batch transactions
   */
  static async checkAndCreateDomainVerifierTransaction(
    safeAddress: string,
    provider: ethers.Provider
  ): Promise<{ needsDomainVerifier: boolean; domainVerifierTx?: DomainVerifierTransaction }> {
    try {
      // Fetch domain separator from ComposableCoW contract
      const domainSeparator = await this.getDomainSeparator(provider);

      // Check if domain verifier is already set correctly
      const isCorrect = await this.isDomainVerifierCorrect(safeAddress, domainSeparator, provider);

      if (isCorrect) {
        return { needsDomainVerifier: false };
      }

      // Create the transaction if needed
      const domainVerifierTx = this.createSetDomainVerifierTransaction(
        safeAddress,
        domainSeparator
      );

      return {
        needsDomainVerifier: true,
        domainVerifierTx,
      };
    } catch (error) {
      console.error("Error checking and creating domain verifier transaction:", error);
      throw new Error(
        `Failed to check/create domain verifier transaction: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }
}

export default SafeDomainVerifierService;
