/*
  The LTI middleware requires an object that implements these methods
*/

class LtiService {


  async findPlatform(params) {
  }

  async useNonce(nonce, platform) {
  }

  async addNonce(nonce, platform) {
  }

  async getCache(key) {
  }

  async setCache(key, value, ttl) {
  }

  async delCache(key) {
  }

}

module.exports = LtiService
module.exports.LtiService = LtiService
