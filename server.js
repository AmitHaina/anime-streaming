
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { LRUCache } from "lru-cache";
import { META, ANIME } from "@consumet/extensions";

const app = express();
const PORT = process.env.PORT || 6969;

// Security headers (CSP disabled so external CDNs/players keep working as before)
app.use(helmet({ contentSecurityPolicy: false }));

// Request logging
app.use(morgan("dev"));

// Enable CORS for frontend local development
app.use(cors());

// Rate limit the API to protect the upstream scraper from abuse
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." }
});
app.use("/api", apiLimiter);

// Serve static frontend files from public directory
app.use(express.static("public"));

// In-memory LRU cache for details requests (capped to avoid unbounded growth)
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
const infoCache = new LRUCache({ max: 500, ttl: CACHE_DURATION });

// Wrap a provider promise with a timeout and a single retry on failure
const PROVIDER_TIMEOUT = 15000; // 15 seconds
const withTimeout = (promiseFactory, label) => {
  const attempt = () =>
    Promise.race([
      promiseFactory(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${PROVIDER_TIMEOUT}ms`)), PROVIDER_TIMEOUT)
      )
    ]);
  return attempt().catch((err) => {
    console.warn(`[Provider Retry] ${label} failed (${err.message}). Retrying once...`);
    return attempt();
  });
};

// Helper function to resolve the Anilist instance with the desired backing provider
const getAnilistInstance = (providerName) => {
  const name = String(providerName || "unity").toLowerCase();
  if (name === "saturn") {
    return new META.Anilist(new ANIME.AnimeSaturn());
  }
  // Default to AnimeUnity
  return new META.Anilist(new ANIME.AnimeUnity());
};

// Search endpoint
app.get("/api/search", async (req, res, next) => {
  const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const provider = req.query.provider;
  const page = Number.parseInt(req.query.page, 10);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;

  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Searching for "${query}" using provider: ${provider || "unity"} (page ${safePage})...`);
    const results = await withTimeout(() => anilist.search(query, safePage), "search");
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Trending / Popular endpoint
app.get("/api/trending", async (req, res, next) => {
  const provider = req.query.provider;
  const page = Number.parseInt(req.query.page, 10);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Fetching trending anime using provider: ${provider || "unity"} (page ${safePage})...`);
    // fetchRecentEpisodes or advancedSearch with POPULARITY_DESC
    const results = await withTimeout(
      () => anilist.advancedSearch(undefined, "ANIME", safePage, 15, undefined, ["POPULARITY_DESC"]),
      "trending"
    );
    res.json(results);
  } catch (error) {
    next(error);
  }
});

// Anime Info endpoint
app.get("/api/info/:id", async (req, res, next) => {
  const id = req.params.id;
  const provider = req.query.provider;
  const cacheKey = `${provider || "unity"}:${id}`;

  if (!id) {
    return res.status(400).json({ error: "Anime ID is required" });
  }

  // Check cache first
  const cached = infoCache.get(cacheKey);
  if (cached) {
    console.log(`[Cache Hit] Serving Info for ${cacheKey}`);
    return res.json(cached);
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API Cache Miss] Fetching info for ID: ${id} using provider: ${provider || "unity"}...`);
    const info = await withTimeout(() => anilist.fetchAnimeInfo(id), "fetchAnimeInfo");

    // If provider is AnimeUnity and there are multiple pages of episodes, fetch and merge them
    if (String(provider || "unity").toLowerCase() === "unity" && info.episodes && info.episodes.length > 0) {
      const totalEpisodesCount = info.totalEpisodes || info.episodes.length;
      const totalPages = Math.ceil(totalEpisodesCount / 120);
      
      if (totalPages > 1) {
        try {
          const firstEp = info.episodes[0];
          const mappedId = firstEp.id.split("/")[0];
          console.log(`[API Pagination] AnimeUnity calculated total pages: ${totalPages}. Fetching pages 2 to ${totalPages} for mapped ID "${mappedId}"...`);
          
          // Fetch all remaining pages in parallel
          const pagePromises = [];
          for (let p = 2; p <= totalPages; p++) {
            pagePromises.push(anilist.provider.fetchAnimeInfo(mappedId, p));
          }
          
          const pagesResults = await Promise.all(pagePromises);
          pagesResults.forEach((pageInfo) => {
            if (pageInfo && pageInfo.episodes) {
              info.episodes = info.episodes.concat(pageInfo.episodes);
            }
          });
          
          // Deduplicate and sort episodes numerically to ensure correct ordering
          info.episodes = Array.from(new Set(info.episodes.map(e => JSON.stringify(e)))).map(s => JSON.parse(s));
          info.episodes.sort((a, b) => a.number - b.number);
          console.log(`[API Pagination] Successfully merged all pages. Total episodes: ${info.episodes.length}`);
        } catch (paginateError) {
          console.error("[API Pagination Error] Failed to fetch additional pages:", paginateError.message);
        }
      }
    }

    // Save to cache
    infoCache.set(cacheKey, info);

    res.json(info);
  } catch (error) {
    next(error);
  }
});

// Streaming Sources endpoint
app.get("/api/sources", async (req, res, next) => {
  const episodeId = typeof req.query.episodeId === "string" ? req.query.episodeId.trim() : "";
  const provider = req.query.provider;

  if (!episodeId) {
    return res.status(400).json({ error: "Episode ID query parameter 'episodeId' is required" });
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Fetching sources for Episode ID: ${episodeId} using provider: ${provider || "unity"}...`);
    const sources = await withTimeout(() => anilist.fetchEpisodeSources(episodeId), "fetchEpisodeSources");
    res.json(sources);
  } catch (error) {
    next(error);
  }
});

// Unknown API routes should return JSON 404, not the SPA shell
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// Fallback index.html route for SPA client routing
app.get("*", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error(`[API Error] ${req.method} ${req.originalUrl}:`, err.message);
  res.status(500).json({ error: "Request failed", details: err.message });
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  Anime Proxy Server running at http://localhost:${PORT}`);
  console.log(`  Serving static files and API routes`);
  console.log(`===================================================`);
});
