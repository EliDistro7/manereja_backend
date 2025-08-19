

// controllers/systemMetrics-controller.js
const SystemMetrics = require('../models/systemMetricsSchema.js'); // Import the schema

// Function to increment the total number of posts
const incrementTotalPosts = async () => {
  try {
    const metrics = await SystemMetrics.findOneAndUpdate(
      {}, // Assuming there's only one metrics document
      { $inc: { 'systemMetrics.totalPosts': 1 } },
      { new: true }
    );

    if (!metrics) {
     // console.log('System metrics document not found.');
    } else {
    // console.log('Total posts count updated:', metrics.systemMetrics.totalPosts);
    }
  } catch (error) {
    console.error('Error updating total posts count:', error);
  }
};

module.exports = { incrementTotalPosts };
