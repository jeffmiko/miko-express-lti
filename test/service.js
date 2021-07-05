const fs = require("fs")

// needs these 5 methods
const ltiservice = {
  nonces: {},

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

    return {

      // required for all LTI versions
      url: "http://mymoodle.local/moodle",
      // required for LTI 1.3
      deploymentid: "5",
      clientid: "cHpMWgNeSqketCZ",
      keytype: "JWK_SET",
      keyval: "http://mymoodle.local/moodle/mod/lti/certs.php",
      authurl: "http://mymoodle.local/moodle/mod/lti/auth.php",
      tokenurl: "http://mymoodle.local/moodle/mod/lti/token.php",
      jwksurl: "http://mymoodle.local/moodle/mod/lti/certs.php",

      privatepem: fs.readFileSync("./test/keys/private.pem", "utf8"),
      // LTI 1.0/1.1
      secret: "e439f1bf4af3a47a81fb9387ef2c",
      consumerkey: "miko-lti-poc",
    }

    // needs to match your LMS
    return {
      // required for all LTI versions
      url: "http://mymoodle.local/moodle",
      // LTI 1.3
      deploymentid: "5",
      clientid: "cHpMWgNeSqketCZ",
      keytype: "JWK_SET",
      keyval: "http://mymoodle.local/moodle/mod/lti/certs.php",
      authurl: "http://mymoodle.local/moodle/mod/lti/auth.php",
      tokenurl: "http://mymoodle.local/moodle/mod/lti/token.php",
      jwksurl: "http://mymoodle.local/moodle/mod/lti/certs.php",
      privatepem: fs.readFileSync("./test/keys/private.pem", "utf8"),
      // LTI 1.0/1.1
      secret: "e439f1bf4af3a47a81fb9387ef2c",
      consumerkey: "miko-lti-poc",
    }
  },

  async useNonce(nonce, platform) {
    // using in memory dictionary, but better to use database
    let now = new Date()
    if (!this.nonces[nonce]) throw "Nonce does not exist"
    if (this.nonces[nonce].used) throw "Nonce has already been used"
    if (this.nonces[nonce].expires < now) throw "Nonce has expired"
    this.nonces[nonce].used = true
  },

  async addNonce(nonce, platform) {
    // using in memory dictionary, but better to use database
    let now = new Date()
    let expires = new Date(now.getTime() + 10*60000); // 10 minutes
    if (this.nonces[nonce]) throw "Nonce already exists"
    this.nonces[nonce] = {
      expires, used: false
    }
  },

  async getCache(key) {
  },

  async setCache(key, value, ttl) { 
  },

}

module.exports = ltiservice