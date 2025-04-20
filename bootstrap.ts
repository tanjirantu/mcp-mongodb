import { runClient } from "./src/client";

runClient().catch(error => {
    console.error("Client failed to start or encountered a fatal error:", error);
    process.exit(1);
});