// Centralized Configuration for Backend
// Change these values here instead of scattered throughout the code

module.exports = {
  // Server Configuration
  HOST: process.env.SERVER_HOST || 'localhost',
  PORT: process.env.SERVER_PORT || 5000,
  
  // Get full server URL
  getServerUrl() {
    return `http://${this.HOST}:${this.PORT}`;
  },
};
