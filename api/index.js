// Vercel serverless entry: re-export the Express app from server.mjs.
// Vercel serves this file as a Node serverless function; vercel.json rewrites
// all paths here. server.mjs only calls app.listen() when run directly, so
// importing it does not bind a port.
import app from "../server.mjs";

export default app;
