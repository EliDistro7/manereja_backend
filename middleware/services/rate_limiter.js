// middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
//const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');



// Rate limiter factory
const createRateLimiter = (windowMs, max, keyGenerator) => {
  const config = {
    windowMs,
    max,
    keyGenerator,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message: 'Too many requests, please try again later',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  };

  // Use Redis store if available
 // if (redisClient) {
 //   config.store = new RedisStore({
 //     client: redisClient,
 //     prefix: 'rate_limit:'
 //   });
//  }

  return rateLimit(config);
};

// Different rate limiters for different endpoints
const rateLimiters = {
  // General API rate limiting
  general: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // requests per window
    (req) => `${req.user.userId}:general`
  ),

  // Usage increment rate limiting (more restrictive)
  usage: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    50, // requests per window
    (req) => `${req.user.userId}:usage:${req.params.serviceId}`
  ),

  // Service stats rate limiting
  stats: createRateLimiter(
    5 * 60 * 1000, // 5 minutes
    20, // requests per window
    (req) => `${req.user.userId}:stats`
  ),

  // Settings update rate limiting
  settings: createRateLimiter(
    10 * 60 * 1000, // 10 minutes
    10, // requests per window
    (req) => `${req.user.userId}:settings`
  )
};

// Factory function to get rate limiter
const getRateLimiter = (type) => {
  return rateLimiters[type] || rateLimiters.general;
};

// Custom rate limiter middleware
const rateLimiter = (type, max, windowMinutes) => {
  if (rateLimiters[type]) {
    return rateLimiters[type];
  }

  // Create custom rate limiter
  return createRateLimiter(
    windowMinutes * 60 * 1000,
    max,
    (req) => `${req.user.userId}:${type}`
  );
};

// IP-based rate limiting for authentication endpoints
const authRateLimiter = createRateLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // requests per window
  (req) => req.ip
);

// Cleanup function for Redis connections
const cleanup = () => {
 // if (redisClient) {
 //   redisClient.disconnect();
//  
 // }
  console.log('Rate limiter cleanup completed');
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

module.exports = {
  rateLimiter,
  getRateLimiter,
  authRateLimiter,
  cleanup
};