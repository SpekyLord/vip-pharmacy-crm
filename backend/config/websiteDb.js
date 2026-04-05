/**
 * Website Database Connection
 *
 * This file creates a separate connection to the VIP Pharmacy website database
 * to read products from the existing product catalog.
 *
 * The CRM reads products from the website DB (read-only)
 * while maintaining its own database for visits, assignments, etc.
 */

const mongoose = require('mongoose');

let websiteConnection = null;

const connectWebsiteDB = async () => {
  try {
    // Create a separate connection to the website database
    // Use WEBSITE_DB_NAME env var for dev/prod isolation (defaults to 'vip-pharmacy')
    const websiteDbName = process.env.WEBSITE_DB_NAME || 'vip-pharmacy';
    const websiteUri = process.env.MONGO_URI.replace(
      /\/[^/?]+(\?|$)/,
      `/${websiteDbName}$1`
    );

    websiteConnection = mongoose.createConnection(websiteUri);

    websiteConnection.on('connected', () => {
      console.log(`Website DB Connected: ${websiteDbName}`);
    });

    websiteConnection.on('error', (err) => {
      console.error('Website DB connection error:', err.message);
    });

    websiteConnection.on('disconnected', () => {
      console.warn('Website DB disconnected');
    });

    return websiteConnection;
  } catch (error) {
    console.error('Website DB connection failed:', error.message);
    throw error;
  }
};

const getWebsiteConnection = () => {
  if (!websiteConnection) {
    throw new Error('Website database not connected. Call connectWebsiteDB first.');
  }
  return websiteConnection;
};

module.exports = {
  connectWebsiteDB,
  getWebsiteConnection,
};
