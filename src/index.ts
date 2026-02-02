import { Elysia } from "elysia";
import { tokenRoutes } from "./routes/token";
import { searchRoutes } from "./routes/flights/search";
import { returnRoutes } from "./routes/flights/return";
import { cheapestRoutes } from "./routes/flights/cheapest";
import { oneWayRoutes } from "./routes/flights/explore";

const app = new Elysia()
  .get("/", () => ({ 
    name: "Clovis Flight API",
    version: "1.0.0",
    endpoints: [
      "GET /token - Get fresh authentication tokens",
      "GET /flights/search/roundTrip?from=XXX&to=XXX - Search round-trip flights (all results)",
      "GET /flights/cheapest?from=XXX&to=XXX - Get cheapest round-trip pair",
      "GET /flights/search/oneWay?from=XXX&to=XXX&departDate=YYYY-MM-DD - One-way flights",
      "POST /flights/return - Search return flights with selected outbound token",
    ],
  }))
  .use(tokenRoutes)
  .use(searchRoutes)
  .use(returnRoutes)
  .use(cheapestRoutes)
  .use(oneWayRoutes)
  .listen(3000);

console.log(`🦊 Clovis API is running at http://${app.server?.hostname}:${app.server?.port}`);