import { Elysia } from "elysia";
import { tokenRoutes } from "./routes/token";
import { searchRoutes } from "./routes/flights/search";
import { returnRoutes } from "./routes/flights/return";
import { cheapestRoutes } from "./routes/flights/cheapest";

const app = new Elysia()
  .get("/", () => ({ 
    name: "Clovis Flight API",
    version: "1.0.0",
    endpoints: [
      "GET /token - Get fresh authentication tokens",
      "GET /flights/search?from=XXX&to=XXX&departDate=YYYY-MM-DD&returnDate=YYYY-MM-DD - Search flights",
      "GET /flights/cheapest?from=XXX&to=XXX - Get cheapest round-trip pair",
      "POST /flights/return - Search return flights with selected outbound token",
    ],
  }))
  .use(tokenRoutes)
  .use(searchRoutes)
  .use(returnRoutes)
  .use(cheapestRoutes)
  .listen(3000);

console.log(`🦊 Clovis API is running at http://${app.server?.hostname}:${app.server?.port}`);