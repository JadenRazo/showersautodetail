import express from 'express';
import pool from '../config/database.js';

const router = express.Router();

const GOOGLE_API_URL = 'https://places.googleapis.com/v1/places';
const CACHE_HOURS = parseInt(process.env.GOOGLE_REVIEWS_CACHE_HOURS) || 24;

// Check if Google Reviews is configured
const isConfigured = () => {
  return !!(process.env.GOOGLE_MAPS_API_KEY && process.env.GOOGLE_PLACE_ID);
};

// Fetch reviews from Google Places API (New)
const fetchFromGoogle = async () => {
  const placeId = process.env.GOOGLE_PLACE_ID;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  const response = await fetch(`${GOOGLE_API_URL}/${placeId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'id,displayName,rating,userRatingCount,reviews'
    }
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Google API error: ${response.status} - ${error}`);
  }

  return response.json();
};

// Transform Google API response to our format
const transformReviews = (googleData) => {
  const reviews = (googleData.reviews || []).map(review => ({
    author_name: review.authorAttribution?.displayName || 'Anonymous',
    author_photo_url: review.authorAttribution?.photoUri || null,
    rating: review.rating || 5,
    text: review.text?.text || review.originalText?.text || '',
    relative_time: review.relativePublishTimeDescription || '',
    publish_time: review.publishTime || null,
    google_maps_uri: review.googleMapsUri || null
  }));

  return {
    overall_rating: googleData.rating || null,
    total_reviews: googleData.userRatingCount || 0,
    business_name: googleData.displayName?.text || '',
    reviews
  };
};

// Get cached reviews or fetch new ones
const getCachedOrFetch = async (forceRefresh = false) => {
  const placeId = process.env.GOOGLE_PLACE_ID;

  // Check cache first (unless force refresh)
  if (!forceRefresh) {
    const cacheResult = await pool.query(
      `SELECT * FROM google_reviews_cache
       WHERE place_id = $1
       AND cached_at > NOW() - INTERVAL '${CACHE_HOURS} hours'`,
      [placeId]
    );

    if (cacheResult.rows.length > 0) {
      const cached = cacheResult.rows[0];
      return {
        overall_rating: parseFloat(cached.overall_rating),
        total_reviews: cached.total_reviews,
        reviews: cached.reviews_data.reviews,
        business_name: cached.reviews_data.business_name,
        cached: true,
        cached_at: cached.cached_at
      };
    }
  }

  // Fetch fresh data from Google
  const googleData = await fetchFromGoogle();
  const transformed = transformReviews(googleData);

  // Upsert cache
  await pool.query(
    `INSERT INTO google_reviews_cache (place_id, overall_rating, total_reviews, reviews_data, cached_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (place_id) DO UPDATE SET
       overall_rating = EXCLUDED.overall_rating,
       total_reviews = EXCLUDED.total_reviews,
       reviews_data = EXCLUDED.reviews_data,
       cached_at = NOW()`,
    [placeId, transformed.overall_rating, transformed.total_reviews, JSON.stringify(transformed)]
  );

  return {
    ...transformed,
    cached: false,
    cached_at: new Date().toISOString()
  };
};

// GET /api/google-reviews - Get Google reviews (cached)
router.get('/', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.json({
        enabled: false,
        message: 'Google Reviews not configured',
        reviews: []
      });
    }

    const data = await getCachedOrFetch(false);

    res.json({
      enabled: true,
      ...data
    });
  } catch (error) {
    console.error('Error fetching Google reviews:', error);

    // Try to return stale cache on error
    try {
      const placeId = process.env.GOOGLE_PLACE_ID;
      const staleResult = await pool.query(
        'SELECT * FROM google_reviews_cache WHERE place_id = $1',
        [placeId]
      );

      if (staleResult.rows.length > 0) {
        const cached = staleResult.rows[0];
        return res.json({
          enabled: true,
          overall_rating: parseFloat(cached.overall_rating),
          total_reviews: cached.total_reviews,
          reviews: cached.reviews_data.reviews,
          business_name: cached.reviews_data.business_name,
          cached: true,
          stale: true,
          cached_at: cached.cached_at,
          error: 'Using stale cache due to API error'
        });
      }
    } catch (cacheError) {
      // Cache lookup also failed
    }

    res.status(500).json({
      enabled: true,
      error: 'Failed to fetch Google reviews',
      reviews: []
    });
  }
});

// GET /api/google-reviews/refresh - Force refresh cache
router.get('/refresh', async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(400).json({
        error: 'Google Reviews not configured'
      });
    }

    const data = await getCachedOrFetch(true);

    res.json({
      success: true,
      message: 'Cache refreshed successfully',
      ...data
    });
  } catch (error) {
    console.error('Error refreshing Google reviews:', error);
    res.status(500).json({
      error: 'Failed to refresh Google reviews',
      message: error.message
    });
  }
});

export default router;
