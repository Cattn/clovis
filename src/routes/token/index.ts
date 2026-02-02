import { Elysia } from "elysia";
import { getFlightTokens } from "../../utils/token";

export const tokenRoutes = new Elysia({ prefix: "/token" })
  .get("/", async () => {
    try {
      const tokens = await getFlightTokens();
      return {
        success: true,
        data: tokens,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch tokens",
      };
    }
  });
