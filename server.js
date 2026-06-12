
import express from "express";
import cors from "cors";
import { META, ANIME } from "@consumet/extensions";

const app = express();
const PORT = process.env.PORT || 6969;

// Enable CORS for frontend local development
app.use(cors());

// Serve static frontend files from public directory
app.use(express.static("public"));

// Helper function to resolve the Anilist instance with the desired backing provider
const getAnilistInstance = (providerName) => {
  const name = String(providerName || "saturn").toLowerCase();
  if (name === "unity") {
    return new META.Anilist(new ANIME.AnimeUnity());
  }
  // Default to AnimeSaturn because it contains the complete episode lists
  return new META.Anilist(new ANIME.AnimeSaturn());
};

// Search endpoint
app.get("/api/search", async (req, res) => {
  const query = req.query.q;
  const provider = req.query.provider;
  const page = parseInt(req.query.page || "1");

  if (!query) {
    return res.status(400).json({ error: "Query parameter 'q' is required" });
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Searching for "${query}" using provider: ${provider || "saturn"} (page ${page})...`);
    const results = await anilist.search(query, page);
    res.json(results);
  } catch (error) {
    console.error("[API Error] Search failed:", error);
    res.status(500).json({ error: "Failed to search anime", details: error.message });
  }
});

// Trending / Popular endpoint
app.get("/api/trending", async (req, res) => {
  const provider = req.query.provider;
  const page = parseInt(req.query.page || "1");

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Fetching trending anime using provider: ${provider || "saturn"} (page ${page})...`);
    // fetchRecentEpisodes or advancedSearch with POPULARITY_DESC
    const results = await anilist.advancedSearch(undefined, "ANIME", page, 15, undefined, ["POPULARITY_DESC"]);
    res.json(results);
  } catch (error) {
    console.error("[API Error] Fetching trending failed:", error);
    res.status(500).json({ error: "Failed to fetch trending anime", details: error.message });
  }
});

// Anime Info endpoint
app.get("/api/info/:id", async (req, res) => {
  const id = req.params.id;
  const provider = req.query.provider;

  if (!id) {
    return res.status(400).json({ error: "Anime ID is required" });
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Fetching info for ID: ${id} using provider: ${provider || "saturn"}...`);
    const info = await anilist.fetchAnimeInfo(id);
    res.json(info);
  } catch (error) {
    console.error(`[API Error] Fetching info for ${id} failed:`, error);
    res.status(500).json({ error: "Failed to fetch anime details", details: error.message });
  }
});

// Streaming Sources endpoint
app.get("/api/sources", async (req, res) => {
  const episodeId = req.query.episodeId;
  const provider = req.query.provider;

  if (!episodeId) {
    return res.status(400).json({ error: "Episode ID query parameter 'episodeId' is required" });
  }

  try {
    const anilist = getAnilistInstance(provider);
    console.log(`[API] Fetching sources for Episode ID: ${episodeId} using provider: ${provider || "saturn"}...`);
    const sources = await anilist.fetchEpisodeSources(episodeId);
    res.json(sources);
  } catch (error) {
    console.error(`[API Error] Fetching sources for ${episodeId} failed:`, error);
    res.status(500).json({ error: "Failed to fetch streaming sources", details: error.message });
  }
});

// Fallback index.html route for SPA client routing
app.get("*", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`  Anime Proxy Server running at http://localhost:${PORT}`);
  console.log(`  Serving static files and API routes`);
  console.log(`===================================================`);
});
