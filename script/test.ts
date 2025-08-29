import { config as dotenvConfig } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { polymarketOrderService } from "../src/backend/services/polymarketOrderService";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenvConfig({ path: resolve(__dirname, "../.env") });

async function testPolymarketOrder() {
    try {
        console.log("🧪 Testing Polymarket Order Service...\n");

        // Initialize the service with your credentials
        console.log("🔑 Initializing Polymarket Order Service...");
        await polymarketOrderService.initialize();
        
        if (!polymarketOrderService.isReady()) {
            throw new Error("Failed to initialize Polymarket Order Service");
        }
        
        console.log("✅ Service initialized successfully!\n");

        console.log(JSON.stringify(await polymarketOrderService.getOrder("0x47581ac47c554343de6d34f9853b25a345fa4fe2a36e04163883975b2c867002")))
        // console.log(JSON.stringify(await polymarketOrderService.cancelAllOrders()))

        // Test GTD Order creation with hardcoded values
        // console.log("📝 Creating GTD Order...");

        // // expiration is UTC seconds timestamp
        // const expiration = Math.floor(Date.now() / 1000) + (5 * 60) // Expires in 5 minutes
        // // HARDCODED VALUES - REPLACE THESE FOR TESTING
        // const testOrder = {
        //     tokenID: "104173557214744537570424345347209544585775842950109756851652855913015295701992", // YES token ID
        //     price: 0.80, // Price in USD
        //     side: "SELL" as const, // BUY or SELL
        //     size: 5, // Number of shares
        //     feeRateBps: 0, // Fee rate in basis points
        //     expiration: expiration
        // };

        // console.log("📋 Order Details:");
        // console.log(`   Token ID: ${testOrder.tokenID}`);
        // console.log(`   Price: $${testOrder.price}`);
        // console.log(`   Side: ${testOrder.side}`);
        // console.log(`   Size: ${testOrder.size} shares`);
        // console.log(`   Fee Rate: ${testOrder.feeRateBps} bps`);
        // console.log(`   Expiration: ${new Date(testOrder.expiration * 1000).toISOString()}\n`);

        // // Create the GTD order
        // const order = await polymarketOrderService.postGTDOrder({
        //     tokenID: testOrder.tokenID,
        //     price: testOrder.price,
        //     side: testOrder.side,
        //     size: testOrder.size,
        //     feeRateBps: testOrder.feeRateBps,
        //     expiration: testOrder.expiration
        // });

        // console.log("🎉 GTD Order Created and posted Successfully!");
        // console.log("=" .repeat(60));
        // console.log("📋 Response:", JSON.stringify(order.response, null, 2));
        // console.log("=" .repeat(60));

        // console.log("\n✅ Order posted successfully!");
    } catch (error: any) {
        console.error("\n💥 Error during test:");
        console.error(`   ${error.message}`);
        
        if (error.response) {
            console.error("📋 Response details:", JSON.stringify(error.response.data, null, 2));
        }
        
        process.exit(1);
    }
}

// Run the test
testPolymarketOrder();
