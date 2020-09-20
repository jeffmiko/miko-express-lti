/*
  Video tutorial explaining LTI Advantage Launch, OIDC, service API
  https://www.youtube.com/watch?v=g3y4vwtP6vQ&list=PLb5mG7w3UZkPKHODmz5YCkIqnWQEsjMkd&index=3

  Creating JWT RS256 private and public keys
  https://gist.github.com/ygotthilf/baa58da5c3dd1f69fae9

  LTI Assignment & Grading Service
  https://www.imsglobal.org/spec/lti-ags/v2p0

  LTI Name & Role Provisioning Service
  http://www.imsglobal.org/spec/lti-nrps/v2p0

*/
const qs = require('querystring');
const jwt = require("jsonwebtoken")
const crypto = require('crypto');
const axios = require("axios")
const rasha = require("rasha")
const parselink = require('parse-link-header');

const oidcCookiePrefix = "oidcstate"
const defaultOptions = {
  cookies: {
    secure: false,
    httpOnly: true,
    signed: true,
    maxAge: 60 * 1000   
  }, 
}

const activityProgresses = {
  initialized: "Initialized",
  started: "Started",
  inprogress: "InProgress",
  submitted: "Submitted",
  completed: "Completed" ,
  Initialized: "Initialized",
  Started: "Started",
  InProgress: "InProgress",
  Submitted: "Submitted",
  Completed: "Completed" ,
}

const gradingProgresses = {
  fullygraded: "FullyGraded",
  pending: "Pending",
  pendingmanual: "PendingManual",
  failed: "Failed",
  notready: "NotReady",
  FullyGraded: "FullyGraded",
  Pending: "Pending",
  PendingManual: "PendingManual",
  Failed: "Failed",
  NotReady: "NotReady",
}



async function hashUpdate(hash, value) {
  let type = typeof value
  if (type === "object") {
    let keys = Object.keys(value)
    keys.sort()
    for(let k of keys) {
      await hashUpdate(hash, value[k])
    }
  } else {
    await hash.update(value.toString())
  }
}

async function hashObject(value) {
  const hash = crypto.createHash('md5');
  await hashUpdate(hash, value)
  return hash.digest('hex')
}

function parseRoles(roles) {
  let result = {}
  for(let role of roles) {
    let parts = role.split("#")
    switch(parts[parts.length-1]) {
      case "Learner":
      case "Student":
        result.learner = true
        break
      case "Instructor":
      case "Member":
      case "Faculty":
        result.instructor = false
        break
      case "ContentDeveloper":
      case "Creator":
        result.developer = true
        break
      case "Mentor":
        result.mentor = true
        break
      case "Staff":
      case "Observer":
        result.staff = true
        break
      case "Administrator":
        result.admin = true
        break
      default:
        break
    }
  }
  return result  
}

function parseContextRoles(roles) {
  let result = {}
  for(let role of roles) {
    let parts = role.split("#")
    switch(parts[0]) {
      case "Learner":
        result.learner = true
        break
      case "Instructor":
        if (parts.length > 1 && parts[1].includes("Assistant")) {
          result.assistant = true 
          result.instructor = false
        } else if (!result.assistant) {
          result.instructor = true
        }
        break
      case "ContentDeveloper":
        result.developer = true
        break
      case "Mentor":
        result.mentor = true
        break
      case "Administrator":
        result.admin = true
        break
      default:
        break
    }
  }
  return result
}

/**
 * @description Handles the initial LTI 1.3 OpenID Connect login process
 * @param {Object}  service - An object implementing the OidcService
 * @param {Object}  cache - An object implementing caching with get/set methods (redis, node-cache, etc.)
 * @param {Object}  cookies - Specifies hhow to handle cookies.
 * @param {Booelan} [cookies.secure] - Marks the cookies to be used with HTTPS only. Default is false.
 * @param {Booelan} [cookies.httpOnly] - Flags the cookies to be accessible only by the web server. Default is true.
 * @param {Booelan} [cookies.signed] - Indicates if the cookies should be signed. Default is true.
 * @param {Booelan} [cookies.maxAge] - The cookie expiry time relative to the current time in milliseconds. Default is 60000.
 * @returns {Function} - Returns an Express style route handler
 */
function oidcLogin({ service, cache, cookies }={}) {
  if (!service) throw new Error("The service object is missing.")
  if (typeof service.findPlatform !== "function") throw new Error("The service object is missing a findPlatform method.")
  let cookieOptions = Object.assign(defaultOptions.cookies, cookies)

  const loginhandler = async function(req, res, next) {
    let statusCode = 400
    try {
      
      const params = { ...req.query, ...req.body }
      // verify required parameters
      if (!params.iss) throw new Error("Missing iss parameter.")
      if (!params.login_hint) throw new Error("Missing login_hint parameter.")
      if (!params.target_link_uri) throw new Error("Missing target_link_uri parameter.")

      // call service to find platform by iss and client_id
      let platform = await service.findPlatform({ url: params.iss, clientId: params.client_id })
      if (!platform) throw new Error("Unregistered platform.")

      statusCode = 500

      // generate random state data and nonce
      const state = crypto.randomBytes(32).toString('hex');
      const nonce = crypto.randomBytes(32).toString('hex');
      await service.addNonce(nonce)
    
      // Set cookie for validation on redirect
      res.cookie(oidcCookiePrefix + state, params.iss, cookieOptions)
      
      // build redirect url with query params
      const url = new URL(platform.authUrl)
      url.searchParams.set('response_type','id_token')
      url.searchParams.set('response_mode','form_post')
      url.searchParams.set('id_token_signed_response_alg','RS256')
      url.searchParams.set('scope','openid')
      url.searchParams.set('prompt','none')
      url.searchParams.set('client_id', platform.clientId)
      url.searchParams.set('redirect_uri', params.target_link_uri)
      url.searchParams.set('login_hint', params.login_hint)
      url.searchParams.set('nonce', nonce)
      url.searchParams.set('state', state)
      if (params.lti_message_hint) url.searchParams.set('lti_message_hint', params.lti_message_hint)
      if (params.lti_deployment_id) url.searchParams.set('lti_deployment_id', params.lti_deployment_id)
    
      res.redirect(url)
    } catch (err) {
      err.status = statusCode
      err.statusCode = statusCode
      next(err)      
    }
  }

  return loginhandler
}


/**
 * @description Handles the OpenID Connect redirect verification process
 * @param {Object}  service - An object implementing the OidcService
 * @param {Object}  cache - An object implementing caching with get/set methods (redis, node-cache, etc.)
 * @param {Object}  cookies - Specifies hhow to handle cookies.
 * @param {Booelan} [cookies.secure] - Marks the cookies to be used with HTTPS only. Default is false.
 * @param {Booelan} [cookies.httpOnly] - Flags the cookies to be accessible only by the web server. Default is true.
 * @param {Booelan} [cookies.signed] - Indicates if the cookies should be signed. Default is true.
 * @param {Booelan} [cookies.maxAge] - The cookie expiry time relative to the current time in milliseconds. Default is 60000.
 * @returns {Function} - Returns an Express style route handler
 */
function oidcVerify({ service, cache, cookies } = {}) {
  if (!service) throw new Error("The service object is missing.")
  let cookieOptions = Object.assign(defaultOptions.cookies, cookies)
  let cachePrefix = "miko-lti-"
  if (typeof service.findPlatform !== "function") throw new Error("The service object is missing a findPlatform method.")

  const verifyhandler = async function(req, res, next) {
    let statusCode = 401
    try {

      // make sure token and state exist
      if (!req.body.id_token) throw new Error("The id_token field was not found.")
      if (!req.body.state) throw new Error("The state field was not found.")
      
      // make sure state cookie exists
      const cookieKey = oidcCookiePrefix+req.body.state
      const cookieIss = req.signedCookies[cookieKey]
      if (!cookieIss) throw new Error("The iss claim cookie was not found.")

      // delete state cookie
      res.clearCookie(cookieKey, cookieOptions)

      // validate token 
      const decoded = jwt.decode(req.body.id_token, { complete: true })
      if (!decoded) throw new Error("Invalid jwt token.")

      // only RS256 algorithm accepted
      if (decoded.header.alg !== 'RS256') throw new Error("Algorithm not RS256")
      // make sure iss in token matches cookie
      if (decoded.payload.iss != cookieIss) throw new Error("Iss claim does not match")

      // verify iss and aud by checking for match in database
      let platform = await service.findPlatform({ url: decoded.payload.iss, clientId: decoded.payload.aud })
      if (!platform) throw new Error("Unregistered platform.")

      let keyName = null
      let pem = null
      switch (platform.keyType) {
        case 'JWK_SET': 
          if (!decoded.header.kid) throw new Error("Missing kid")
          keyName = cachePrefix+"pem-"+decoded.header.kid
          if (cache) {
            pem = await cache.get(keyName)
          }
          if (!pem) {
            let res = await axios.get(platform.key)
            if (!res.data || !res.data.keys) throw new Error("Requested keyset is empty.")
            const jwk = res.data.keys.find(key => {
              return key.kid === decoded.header.kid
            })
            if (!jwk) throw new Error(401, "Requested keyset not found.")
            pem = await rasha.export({ jwk: jwk })
            if (pem && cache) {
              await cache.set(keyName, pem)
            }            
          }
          break
        case 'JWK_KEY': 
          if (!platform.key) throw new Error("Platform key not found.")
          if (!platform.key.kid) throw new Error("Platform kid not found.")
          keyName = cachePrefix+"pem-"+platform.key.kid
          if (cache) {
            pem = await cache.get(keyName)
          }
          if (!pem) {
            pem = rasha.jwk2pem(platform.key)
            if (pem && cache) {
              await cache.set(keyName, pem)
            }
          }
          break
        case 'RSA_KEY': 
          if (!platform.key) throw new Error("Platform key not found.")
          pem = platform.key
          break
        default: 
          throw new Error("Platform has invalid token authentication method.")
      }

      // the verify method checks signature, algorithm and expiration
      const verified = jwt.verify(req.body.id_token, pem, { algorithms: [decoded.header.alg] })

      // if multiple audiences then check azp
      if (Array.isArray(verified.aud) && verified.azp && verified.azp !== platform.clientId) 
        throw new Error("The azp does not match the client.")
      
      // double check token age
      const curTime = Date.now() / 1000
      const timePassed = (curTime - verified.iat)*1000
      if (timePassed > cookieOptions.maxAge) throw new Error("Token has expired.")

      // validate nonce not already used and save it
      if (cache) {
        keyName = cachePrefix+"nonce-"+verified.nonce
        const nonce = await cache.get(keyName)
        if (nonce) throw new Error("Nonce already received.")
        await cache.set(keyName, verified.nonce)
      }
      // tell service we are using nonce
      // service should throw error if expired or already used
      await service.useNonce(verified.nonce)

      let lti = { 
        message: {
          type: verified['https://purl.imsglobal.org/spec/lti/claim/message_type'],
          version: verified['https://purl.imsglobal.org/spec/lti/claim/version'],
        },
        platform: {
          url: verified.iss,
          clientid: verified.aud,
          deploymentid: verified["https://purl.imsglobal.org/spec/lti/claim/deployment_id"],
          ...verified["https://purl.imsglobal.org/spec/lti/claim/tool_platform"],
        },
        user: {
          ltiid: verified.sub,
          givenname: verified.given_name,
          familyname: verified.family_name,
          name: verified.name,
        },
        roles: {
          membership: [],
          institution: [],
          system: [],
        }
      }

      if (verified.email) lti.user.email = verified.email
      if (verified.middle_name) lti.user.middlename = verified.middle_name
      if (verified.image) lti.user.image = verified.image
      else if (verified.picture) lti.user.image = verified.picture

      let endpoint = verified["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"]

      statusCode = 400 

      // validate required claims
      if (lti.message.type == "LtiResourceLinkRequest") {
        lti.message.target = verified['https://purl.imsglobal.org/spec/lti/claim/target_link_uri']
        if (!lti.message.target) throw new Error("Missing target link claim.")
        lti.resource = { ...verified["https://purl.imsglobal.org/spec/lti/claim/resource_link"]}
        lti.resource.ltiid = lti.resource.id
        delete lti.resource.id
        if (!lti.resource) throw new Error("Missing resource link claim.")

        if (endpoint && endpoint.lineitem) {
          lti.resource.lineitemurl = endpoint.lineitem
          for(let scope of endpoint.scope) {
            let index = scope.lastIndexOf("/")
            if (index >= 0) {
              let result = scope.substring(index + 1);
              switch(result) {
                case "lineitem":
                  lti.resource.edititem = true
                  break
                case "lineitem.readonly":
                  lti.resource.viewitem = true
                  break
                case "result":
                  lti.resource.editresult = true
                  break
                case "result.readonly":
                  lti.resource.viewresult = true
                  break
                case "score":
                  lti.resource.scorable = true
                  break
                }
            }
          }
        }

      } else if (!lti.message.type == "LtiDeepLinkingRequest") {
        throw new Error("Missing message type claim.")
      }
      if (!lti.message.version || !lti.message.version.startsWith("1.3."))
        throw new Error("Invalid version claim. Only version 1.3 is supported.")
      if (!lti.platform.deploymentid) throw new Error("Missing deployment id claim.")
      if (!lti.user.ltiid) throw new Error("Missing sub claim.")
      
      let lis = verified["https://purl.imsglobal.org/spec/lti/claim/lis"]
      if (lis) {
        if (lis.person_sourcedid) lti.user.sourcedid = lis.person_sourcedid
      }
      
      if (verified["https://purl.imsglobal.org/spec/lti/claim/context"]) {
        lti.context = { ...verified["https://purl.imsglobal.org/spec/lti/claim/context"]}
        lti.context.ltiid = lti.context.id
        delete lti.context.id
        delete lti.context.type
        if (lis && lis.course_section_sourcedid) lti.context.sourcedid = lis.course_section_sourcedid
        if (endpoint && endpoint.lineitems) lti.context.lineitemsurl = endpoint.lineitems
        let nameSvc = verified["https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice"]
        if (nameSvc && nameSvc.context_memberships_url) {
          lti.context.membershipurl = nameSvc.context_memberships_url
        }
      }

      lti.platform.familycode = lti.platform.family_code
      delete lti.platform.family_code

      // validate roles exist
      let roles = verified["https://purl.imsglobal.org/spec/lti/claim/roles"]
      if (!roles) throw new Error("Missing roles claim.")
      
      statusCode = 500

      // parse roles
      for(let role of roles) {        
        if (role.startsWith("http://purl.imsglobal.org/vocab/lis/v2/membership")) {
          lti.roles.membership.push(role.substring(50))
        } else if (role.startsWith("http://purl.imsglobal.org/vocab/lis/v2/system/person")) {
          lti.roles.system.push(role.substring(53))
        } else if (role.startsWith("http://purl.imsglobal.org/vocab/lis/v2/institution/person")) {
          lti.roles.institution.push(role.substring(58))
        } else {
          // assume context?
          let index = role.lastIndexOf('/')
          if (index >= 0) lti.roles.membership.push(role.substring(index+1))
          else lti.roles.membership.push(role)
        }
      }

      lti.roles.membership = parseContextRoles(lti.roles.membership)
      lti.roles.institution= parseRoles(lti.roles.institution)
      lti.roles.system= parseRoles(lti.roles.system)

      /*
      let contextRoles = parseContextRoles(lti.roles.membership)
      for(let k of Object.keys(contextRoles)) {
        lti.roles.membership[k] = contextRoles[k]
      }

      let instRoles = parseRoles(lti.roles.institution)
      for(let k of Object.keys(instRoles)) {
        lti.roles.institution[k] = instRoles[k]
      }

      let sysRoles = parseRoles(lti.roles.system)
      for(let k of Object.keys(sysRoles)) {
        lti.roles.system[k] = sysRoles[k]
      }
      */

      // platform specific fixes
      if (!lti.user.image) {
        if (/moodle/i.test(lti.platform.family_code)) {
          if (lti.platform.version >= "201711") {
            // as of 2020-09-13 this link is still public
            lti.user.image = lti.platform.url + "/user/pix.php/"+lti.user.lti_id+"/f1.jpg"
          }
        }
      }

      if (lti.platform) lti.platform.hash = await hashObject(lti.platform)
      if (lti.context) lti.context.hash = await hashObject(lti.context)
      if (lti.resource) lti.resource.hash = await hashObject(lti.resource)
      if (lti.user) lti.user.hash = await hashObject(lti.user)
      if (lti.roles) lti.roles.hash = await hashObject(lti.roles)

      lti.token = verified
      req.lti = lti

      next()
    } catch (err) {
      err.status = statusCode
      err.statusCode = statusCode
      next(err)      
    }

  }

  return verifyhandler
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
 * @returns {Function} - Returns an Express style route handler
 */
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
    jti: crypto.randomBytes(32).toString('hex')
  }
  const message = {
    grant_type: 'client_credentials',
    client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
    client_assertion: "",
    scope: realScopes
  }

  if (typeof key === "string") {
    // assume RSA PEM
    message.client_assertion = jwt.sign(confjwt, key, { algorithm: 'RS256'  })
  } else if (typeof key === "object") {
    // assume JWK 
    if (key.key) {
      if (key.kid) {
        message.client_assertion = jwt.sign(confjwt, await rasha.jwk2pem(key.key), { algorithm: 'RS256', keyid: key.kid})
      } else {
        message.client_assertion = jwt.sign(confjwt, await rasha.jwk2pem(key.key), { algorithm: 'RS256' })
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


/**
 * @description Retrieves members from platform.
 * @param {Object} token - Authorization token .
 * @param {String} url   - Specifies the members endpoint.
 * @param {String} role  - Specific role to be returned.
 * @param {Number} limit - Specifies maximum number of members per page.
 * @param {Number} pages - Specifies maximum number of pages returned.
 */
async function getMembers({token, url, role, limit, pages=999} = {}) {
  let next = url
  let curPage = 1
  let result = { members: [] }
  let params = { role, limit }

  const headers = {
    Authorization: token.token_type + ' ' + token.access_token, 
    Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json'  
  }

  while (next && curPage < pages) {
    const res = await axios.get(next, { headers, params })
    next = null
    if (res) {
      if (res.data) {
        if (res.data.members) result.members = result.members.concat(res.data.members)
        if (res.data.context && !result.context) result.context = res.data.context
      }
      if (res.headers && res.headers.link) {
        const links = parselink(res.headers.link)
        if (links) {
          if (links.next) next = links.next.url
          if (links.differences) result.differences = links.differences.url
        }
      }
    }
    curPage++
  }
  
  for(let i= 0; i < result.members.length; i++) {
    let roles = parseContextRoles(result.members[i].roles)
    for(let k of Object.keys(roles)) {
      result.members[i].roles[k] = roles[k]
    }
  }

  if (result.context) result.members.context = result.context
  if (result.differences) result.members.differences = result.differences
  return result.members

}


/**
 * @description Retrieves members from platform.
 * @param {Object} options - Request options.
 * @param {Object} [options.token] - Authorization token
 * @param {String} [options.url]   - Specifies the lineitem endpoint for a resource
 */
const getLineitem = async function({token, url} = {}) {
  let params = {}
  let index = url.indexOf('?') 
  if (index !== -1) {
    params = new URLSearchParams(url.substring(index))
    url = url.substring(0, index)
  }

  const headers = {
    Authorization: token.token_type + " " + token.access_token, 
    Accept: "application/vnd.ims.lis.v2.lineitem+json"
  }

  const res = await axios.get(url, { headers, params })
  if (res && res.data) return res.data
  else return false

}


/**
 * @description Publish a user's score for a resource to the LTI platform. 
 *              See LTI 1.3 specs: https://www.imsglobal.org/spec/lti-ags/v2p0#score-publish-service
 * @param {Object} token   - Authorization token
 * @param {String} url     - Specifies the lineitem endpoint for a specific resource
 * @param {String} userId  - Specifies the lti user id to update
 * @param {String} comment - Specifies the text comments associated with the score
 * @param {String} scoreGiven       - Specifies the score awarded. Typically a percent between 0 and 1
 * @param {String} scoreMaximum     - Specifies the maximum score possible. Defaults to 1.
 * @param {String} activityProgress - Specifies the activity progress. Defaults to Submitted. 
 *                                    See https://www.imsglobal.org/spec/lti-ags/v2p0#activityprogress.
 * @param {String} gradingProgress  - Specifies the grading progress. Defaults to FullyGraded. 
 *                                    See https://www.imsglobal.org/spec/lti-ags/v2p0#gradingprogress.
 * @param {String} timestamp  - Specifies the time the score was awarded. Defaults to now.
 */
async function publishScore({ 
  token, 
  url,
  userId,
  comment,
  scoreGiven,
  scoreMaximum = 1,
  activityProgress = "Submitted",
  gradingProgress = "FullyGraded",
  timestamp = new Date(Date.now()).toISOString() 
} = {}) {
  
  if (!token) throw new TypeError("A valid authorization token is required.")
  if (!url) throw new TypeError("A valid endpoint url is required.")
  if (userId === null || userId === undefined) throw new TypeError("A valid userId is required.")
  if (scoreGiven === null || scoreGiven === undefined) throw new TypeError("A valid scoreGiven is required.")
  if (scoreMaximum === null || scoreMaximum === undefined) throw new TypeError("A valid scoreMaximum is required.")
  if (!activityProgress || !activityProgresses[activityProgress]) throw new TypeError("A valid activityProgress is required. See https://www.imsglobal.org/spec/lti-ags/v2p0#activityprogress.")
  if (!gradingProgress || !gradingProgresses[gradingProgress]) throw new TypeError("A valid gradingProgress is required. See https://www.imsglobal.org/spec/lti-ags/v2p0#gradingprogress.")
  if (!timestamp) throw new TypeError("A valid timestamp is required.")

  let params = {
    userId, 
    activityProgress: activityProgresses[activityProgress], 
    gradingProgress: gradingProgresses[gradingProgress], 
    scoreGiven, 
    scoreMaximum,
    timestamp
  }
  if (comment) params.comment = comment

  let query = ""
  let index = url.indexOf('?') 
  if (index !== -1) {
    query = url.substring(index)
    url = url.substring(0, index)
  }
  if (url.endsWith("/")) url = url + "scores"
  else url = url + "/scores"
  url += query 

  const headers = {
    Authorization: token.token_type + " " + token.access_token, 
    "Content-Type": "application/vnd.ims.lis.v1.score+json"
  }
  const res = await axios.post(url, params, { headers })
  if (res && res.status && res.status < 400) return true
  else return false
}


/**
 * @description Retrieves members from platform.
 * @param {Object} token      - Authorization token
 * @param {String} url        - Specifies the lineitem endpoint for a specific resource
 * @param {String} userId     - Specifies the lti user id to update
 * @param {String} percent    - Specifies the score as a percent (0 to 1). Can be over 1.
 * @param {Boolean} completed - Set to true for fully completed, otherwise partially completed.
 * @param {String} comment    - Specifies the text comments associated with the score
 */
async function quickScore({ token, url, userId, percent, completed, comment } = {}) {
  //if (percent > 1) console.warn(`A score for ${userId} of greater than 100% was published.`)
  let params = {
    token, url, userId, 
    scoreGiven: percent, 
    scoreMaximum: 1,
    comment,
    activityProgress: completed ? "Completed" : "Submitted",
  }
  return publishScore(params)
}


async function generateJwk() {
  let kid = crypto.randomBytes(16).toString('hex')
  let keypair = await rasha.generate({ format: 'jwk' })
  keypair.private.kid = kid
  keypair.public.kid = kid
  return keypair
}


module.exports = {
  oidcLogin, 
  oidcVerify,
  authToken,
  getMembers,
  getLineitem,
  quickScore,
  publishScore,
  generateJwk
}
