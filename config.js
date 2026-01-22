// Centralized Configuration for Backend
// Change these values here instead of scattered throughout the code

module.exports = {
  // Server Configuration
  HOST: process.env.SERVER_HOST || 'localhost',
  PORT: process.env.SERVER_PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // Get full server URL
  getServerUrl() {
    const protocol = this.NODE_ENV === 'production' ? 'https' : 'http';
    // For production on EC2, return the CloudFront HTTPS domain
    if (this.NODE_ENV === 'production') {
      return 'https://dj4haaiis0la7.cloudfront.net';
    }
    return `${protocol}://${this.HOST}:${this.PORT}`;
  },
};
