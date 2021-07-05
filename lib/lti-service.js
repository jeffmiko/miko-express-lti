/*
  The LTI middleware requires an object that implements these methods
*/

class LtiService {

  /**
   * @description Finds a platform record based on a set of parameters
   * @param {Object}  params - Parameters object used to identify tool consumer (aka LMS)
   * @param {Boolean} [params.url] - The URL for LTI 1.3 tool consumers 
   * @param {Boolean} [params.clientid] - The client Id for LTI 1.3 tool consumers
   * @param {Boolean} [params.deploymentid] - The deployment Id for LTI 1.3 tool consumers (optional)
   * @param {Boolean} [params.consumerkey] - The unique consumer key for a LTI 1.0/1.1 tool consumer
   * @returns {Object} - 
   */
  async findPlatform(params) {
  }

  async findDeployment(params) {
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
