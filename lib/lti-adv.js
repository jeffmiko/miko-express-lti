/*
  Video tutorial explaining LTI Advantage Launch, OIDC, service API
  https://www.youtube.com/watch?v=g3y4vwtP6vQ&list=PLb5mG7w3UZkPKHODmz5YCkIqnWQEsjMkd&index=3

  Creating JWT RS256 private and public keys
  https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9

  LTI Advantage Service API Security
  https://www.youtube.com/watch?v=PavmOAiMUzg&list=PLb5mG7w3UZkPKHODmz5YCkIqnWQEsjMkd&index=4

  LTI Assignment & Grading Service
  https://www.imsglobal.org/spec/lti-ags/v2p0

  LTI Name & Role Provisioning Service
  http://www.imsglobal.org/spec/lti-nrps/v2p0

  Generate RSA key pair
  https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9

*/
const crypto = require("crypto");
const axios = require("axios")
const jwt = require("jsonwebtoken")
const qs = require("querystring");


const LtiScopes = Object.freeze({
  members: "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly",
  result: "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly",
  lineitem: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly",
  edit: "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem",
  score: "https://purl.imsglobal.org/spec/lti-ags/scope/score",
})


class LtiAdvantage {
  #jwtopts = { algorithm: "RS256"  }
  #jwtkey = null
  #authurl = null
  #clientid = null
  #scopes = null
  authtoken = null

  // pass in jwtoptions (need kid)
  constructor({url, clientid, scopes, jwtkey, jwtopts, timeout} = {}) {
    if (!url) throw new TypeError("An authentication url is required")
    if (!clientid) throw new TypeError("An client identifier is required")
    if (!jwtkey || typeof jwtkey !== "string") throw new TypeError("A JWT key in PEM string format is required.")
    if (!scopes) throw new TypeError("One of more scopes are required.")
    this.#authurl = url 
    this.#clientid = clientid
    this.#jwtkey = jwtkey 
    if (isNaN(timeout)) this.timeout = 0
    else this.timeout = timeout
    if (jwtopts) this.#jwtopts = Object.assign(jwtopts, this.#jwtopts)
    else this.#jwtopts = { algorithm: "RS256"  }
    if (!Array.isArray(scopes)) this.#scopes = [scopes]
    else this.#scopes = scopes 
  }

  #createConfig() {
    return {
      sub: this.#clientid,
      iss: this.#clientid, 
      aud: this.#authurl,
      iat: Math.round(Date.now() / 1000),
      exp: Math.round(Date.now() / 1000) + 60,
      jti: crypto.randomBytes(32).toString("hex")
    }
  }

  #createMessage(config) {
    return {
      grant_type: "client_credentials",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: jwt.sign(config, this.#jwtkey, this.#jwtopts ),
      scope: this.#scopes.join(" ")
    }
  
  }

  async authorize({timeout} = {}) {
    let config = this.#createConfig()
    let message = this.#createMessage(config)
    if (isNaN(timeout)) timeout = this.timeout

    const now = Date.now()
    const res = await axios.post(this.#authurl, qs.stringify(message), {timeout})
    if (res && res.data) {
      if (res.data.expires_in) {
        res.data.expires_at = now+(res.data.expires_in*1000)
      }
      this.authtoken = res.data
      return res.data
    }
    throw new Error("Unable to acquire auth token.")
  
  }

  expiresAt() {
    if (this.authtoken == null) return Date.now()-60000
    return this.authtoken.expires_at
  }
 

}

module.exports = {
  LtiScopes, LtiAdvantage,
}



/**
 * @description Requests an LTI 1.3 authorization token for specific scopes that can be used with other methods
 * @param {Object}  options - Request options.
 * @param {String}  [options.url] - Platform auth token endpoint url.
 * @param {String}  [options.clientid] - The unique client identifier of tool on platform.
 * @param {String|Object}  [options.key] - The private key used to sign the request. Must be RSA256 PEM string or a JWK.
 * @param {String|Object}  [options.scopes] - The scopes being request. Either LTI spaced delimited uri's or object style.
 * @param {Object}  [options.scopes.score] - Require persmission to update resource scores.
 * @param {Object}  [options.scopes.members] - Require persmission to retrieve context or resource memebrship.
 * @param {Object}  [options.scopes.result] - Require persmission to view grade results.
 * @param {Object}  [options.scopes.lineitem] - Require persmissions to read lineitem.
 * @param {Object}  [options.scopes.edit] - Require persmission to edit lineitem.
 */
/*
async function authToken({url, clientid, key, scopes} = {}) {
  let realScopes = ""

  if (typeof scopes === "string") {
    realScopes = scopes
  } else if (typeof scopes === "object") {
    if (scopes.score) realScopes += "https://purl.imsglobal.org/spec/lti-ags/scope/score "
    if (scopes.members) realScopes += "https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly "
    if (scopes.result) realScopes += "https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly "
    if (scopes.lineitem) realScopes += "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly "
    if (scopes.edit) realScopes += "https://purl.imsglobal.org/spec/lti-ags/scope/lineitem "
    realScopes = realScopes.trimRight()
  } else {
    throw new Error("Expected scopes to be string or object.")
  }

  const confjwt = {
    sub: clientid,
    iss: clientid, 
    aud: url,
    iat: Math.round(Date.now() / 1000),
    exp: Math.round(Date.now() / 1000) + 60,
    jti: crypto.randomBytes(32).toString("hex")
  }
  const message = {
    grant_type: "client_credentials",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: "",
    scope: realScopes
  }

  if (typeof key === "string") {
    // assume RSA PEM
    message.client_assertion = jwt.sign(confjwt, key, { algorithm: "RS256"  })
  } else if (typeof key === "object") {
    // assume JWK 
    if (key.key) {
      if (key.kid) {
        message.client_assertion = jwt.sign(confjwt, await rasha.export(key.key), { algorithm: "RS256", keyid: key.kid})
      } else {
        message.client_assertion = jwt.sign(confjwt, await rasha.export(key.key), { algorithm: "RS256" })
      }
    }
  }

  const now = Date.now()
  const res = await axios.post(url, qs.stringify(message))
  if (res && res.data) {
    if (res.data.expires_in) 
      res.data.expires_at = now+res.data.expires_in
    return res.data
  }
  throw new Error("Unable to acquire auth token.")

}
*/


