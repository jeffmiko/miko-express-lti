const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const axios = require("axios")
const rasha = require("rasha")
const { hashObject, parseSystemRoles, verifyRequestOAuth,
        parseMemberRoles, parseInstRoles } = require("./lti-utils");
const { url } = require("inspector");


const LtiFields = Object.freeze({
  lower: {
    clientid: "clientid",
    deploymentid: "deploymentid",
    ltiid: "ltiid",
    givenname: "givenname",
    familyname: "familyname",
    middlename: "middlename",
    lineitemurl: "lineitemurl",
    edititem: "edititem",
    viewitem: "viewitem",
    editresult: "editresult",
    viewresult: "viewresult",
    sourcedid: "sourcedid",
    lineitemsurl: "lineitemsurl",
    membershipurl: "membershipurl",
    familycode: "familycode",
    keytype: "keytype",
    keyval: "keyval",
    authurl: "authurl",
    tokenurl: "tokenurl",
    url: "url",
    outcomeservice: "serviceurl",
    resultsource: "sourcedid",
    consumerkey: "consumerkey",
    deeplinking: "deeplinking",
  },
  snake: {
    clientid: "client_id",
    deploymentid: "deployment_id",
    ltiid: "lti_id",
    givenname: "given_name",
    familyname: "family_name",
    middlename: "middle_name",
    lineitemurl: "lineitem_url",
    edititem: "edit_item",
    viewitem: "view_item",
    editresult: "edit_result",
    viewresult: "view_result",
    sourcedid: "sourced_id",
    lineitemsurl: "lineitems_url",
    membershipurl: "membership_url",
    familycode: "family_code",    
    keytype: "key_type",
    keyval: "key_val",
    authurl: "auth_url",
    tokenurl: "token_url",
    url: "url",
    outcomeservice: "service_url",
    resultsource: "sourced_id",
    consumerkey: "consumer_key",
    deeplinking: "deep_linking",
  },
  camel: {
    clientid: "clientId",
    deploymentid: "deploymentId",
    ltiid: "ltiId",
    givenname: "givenName",
    familyname: "familyName",
    middlename: "middleName",
    lineitemurl: "lineitemUrl",
    edititem: "editItem",
    viewitem: "viewItem",
    editresult: "editResult",
    viewresult: "viewResult",
    sourcedid: "sourcedId",
    lineitemsurl: "lineitemsUrl",
    membershipurl: "membershipUrl",
    familycode: "familyCode",
    keytype: "keyType",
    keyval: "keyVal",
    authurl: "authUrl",
    tokenurl: "tokenUrl",
    url: "url",
    outcomeservice: "serviceUrl",
    resultsource: "sourcedId",
    consumerkey: "consumerKey",
    deeplinking: "deepLinking",
  }
})

const oidcCookiePrefix= "oidcstate"
const defaults = {
  cookies: {
    secure: false,
    httpOnly: true,
    signed: true,
    maxAge: 60 * 1000 
  }, 
  cache: {
    prefix: "miko-lti-pem-",
    ttl: 60*60*12
  }
}



async function getPEM({keytype, keyval, kid, service, options} = {}) {
  let keyname = null
  let pem = null
  options = Object.assign(defaults.cache, options)

  switch (keytype) {
    case "JWK_SET": // URL to JWKS 
      if (!kid) throw new Error("Missing kid")
      keyname = options.prefix+kid
      if (service) pem = await service.getCache(keyname)
      if (!pem) {
        // fetch remote URL
        let res = await axios.get(keyval)
        if (!res.data || !res.data.keys) throw new Error("Requested key list is empty.")
        const jwk = res.data.keys.find(key => {
          return key.kid === kid
        })
        if (!jwk) throw new Error(401, "A key was not found for the specified kid.")
        pem = await rasha.export({ jwk: jwk })
        if (pem && service) {
          await service.setCache(keyname, pem, options.ttl)
        }            
      }
      break
    case "JWK_KEY": 
      if (!keyval) throw new Error("The key value was not specific.")
      if (typeof keyval === "string") keyval = JSON.parse(keyval)
      if (!keyval.kid) throw new Error("The kid was not found in the key value.")
      keyname = options.prefix+keyval.kid
      if (service) pem = await service.getCache(keyname)
      if (!pem) {
        pem = rasha.export({ jwk: keyval })
        if (pem && service) {
          await service.setCache(keyname, pem, options.ttl)
        }
      }
      break
    case "RSA_KEY": 
      if (!keyval) throw new Error("The key value was not specified.")
      if (typeof keyval !== "string") throw new Error("The key value is not a string.")
      pem = keyval
      break
    default: 
      throw new Error("Platform has invalid token authentication method.")
  }
  return pem
}


/**
 * @description Handles the initial LTI 1.3 OpenID Connect login process
 * @param {Object}  service - An object implementing the OidcService
 * @param {Object}  cookies - Specifies how to handle cookies.
 * @param {Booelan} [cookies.secure] - Marks the cookies to be used with HTTPS only. Default is false.
 * @param {Booelan} [cookies.httpOnly] - Flags the cookies to be accessible only by the web server. Default is true.
 * @param {Booelan} [cookies.signed] - Indicates if the cookies should be signed. Default is true.
 * @param {Booelan} [cookies.maxAge] - The cookie expiry time relative to the current time in milliseconds. Default is 60000.
 * @param {Object}  fields - Key/value pairs to map LTI fields to application fields. See LtiFields for examples.
 * @returns {Function} - Returns an Express style route handler
 */
function LtiLogin({ service, cookies={}, fields=LtiFields.lower, logger }={}) {
  if (!service) throw new Error("The service object is missing.")
  if (typeof service.findPlatform !== "function") throw new Error("The service object is missing a findPlatform method.")
  if (typeof service.addNonce !== "function") throw new Error("The service object is missing a addNonce method.")
  let cookieOptions = Object.assign(defaults.cookies, cookies)

  if (logger && typeof logger !== 'function') logger = null

  const loginhandler = async function(req, res, next) {
    let statusCode = 400
    try {
      const params = { ...req.query, ...req.body }

      if (logger) logger("LtiLogin checking request query and body params", params)

      // verify required parameters
      if (!params.iss) throw new Error("Missing iss parameter.")
      if (!params.login_hint) throw new Error("Missing login_hint parameter.")
      if (!params.target_link_uri) throw new Error("Missing target_link_uri parameter.")
      
      // call service to find platform by iss and client_id
      let findParams = {  }
      findParams[fields.url] = params.iss
      if (params.client_id) findParams[fields.clientid] = params.client_id
      if (params.lti_deployment_id) findParams[fields.deploymentid] = params.lti_deployment_id
      let platform = await service.findPlatform(findParams)
      if (!platform) throw new Error("Unregistered platform.")
      
      statusCode = 401

      // generate random state data and nonce
      const state = crypto.randomBytes(16).toString("hex");
      const nonce = crypto.randomBytes(16).toString("hex");
      await service.addNonce(nonce, platform)
    
      // Set cookie for validation on redirect
      res.cookie(oidcCookiePrefix + state, params.iss, cookieOptions)

      // build redirect url with query params
      const url = new URL(platform[fields.authurl])
      url.searchParams.set("response_type","id_token")
      url.searchParams.set("response_mode","form_post")
      url.searchParams.set("id_token_signed_response_alg","RS256")
      url.searchParams.set("scope","openid")
      url.searchParams.set("prompt","none")
      url.searchParams.set("client_id", platform[fields.clientid])
      url.searchParams.set("redirect_uri", params.target_link_uri)
      url.searchParams.set("login_hint", params.login_hint)
      url.searchParams.set("nonce", nonce)
      url.searchParams.set("state", state)
      if (params.lti_message_hint) url.searchParams.set("lti_message_hint", params.lti_message_hint)
      if (params.lti_deployment_id) url.searchParams.set("lti_deployment_id", params.lti_deployment_id)
    
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
 * @param {Object}  cookies - Specifies hhow to handle cookies.
 * @param {Booelan} [cookies.secure] - Marks the cookies to be used with HTTPS only. Default is false.
 * @param {Booelan} [cookies.httpOnly] - Flags the cookies to be accessible only by the web server. Default is true.
 * @param {Booelan} [cookies.signed] - Indicates if the cookies should be signed. Default is true.
 * @param {Booelan} [cookies.maxAge] - The cookie expiry time relative to the current time in milliseconds. Default is 60000.
 * @param {Object}  fields - Key/value pairs to map LTI fields to application fields. See LtiFields for examples.
 * @returns {Function} - Returns an Express style route handler
 */
function LtiVerify({ service, cookies={}, fields=LtiFields.lower, images="strict", logger } = {}) {
  if (!service) throw new Error("The service object is missing.")
  if (typeof service.findPlatform !== "function") throw new Error("The service object is missing a findPlatform method.")
  if (typeof service.useNonce !== "function") throw new Error("The service object is missing a useNonce method.")
  if (typeof service.getCache !== "function") throw new Error("The service object is missing a getCache method.")
  if (typeof service.setCache !== "function") throw new Error("The service object is missing a setCache method.")
  let cookieOptions = Object.assign(defaults.cookies, cookies)
  if (logger && typeof logger !== 'function') logger = null

  const verifyhandler = async function(req, res, next) {
    let statusCode = 401
    try {
      if (logger) logger("LtiVerify checking request body", req.body)

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
      if (logger) logger("LtiVerify decoded JWT id_token", decoded)
      if (!decoded) throw new Error("Invalid jwt token.")

      // only RS256 algorithm accepted
      if (decoded.header.alg !== "RS256") throw new Error("Algorithm not RS256")
      // make sure iss in token matches cookie
      if (decoded.payload.iss != cookieIss) throw new Error("Iss claim does not match")

      // verify iss and aud by checking for match in database
      let findParams = { url: decoded.payload.iss }
      findParams[fields.clientid] = decoded.payload.aud
      if (decoded["https://purl.imsglobal.org/spec/lti/claim/deployment_id"])
        findParams[fields.deploymentid] = decoded["https://purl.imsglobal.org/spec/lti/claim/deployment_id"]
      let platform = await service.findPlatform(findParams)
      if (!platform) throw new Error("Unregistered platform.")

      let pem = await getPEM({ keytype: platform[fields.keytype],
                               keyval: platform[fields.keyval],
                               kid: decoded.header.kid, 
                               service: service })
   
      // the verify method checks signature, algorithm and expiration
      const verified = jwt.verify(req.body.id_token, pem, { algorithms: [decoded.header.alg] })

      // if multiple audiences then check azp
      if (Array.isArray(verified.aud) && verified.azp && verified.azp !== platform[fields.clientid]) 
        throw new Error("The azp does not match the client.")
      
      // double check token age
      const curTime = Date.now() / 1000
      const timePassed = (curTime - verified.iat)*1000
      if (timePassed > cookieOptions.maxAge) throw new Error("Token has expired.")

      // tell service we are using nonce
      // service should throw error if expired or already used
      await service.useNonce(verified.nonce, platform)

      let lti = { 
        message: {
          type: verified["https://purl.imsglobal.org/spec/lti/claim/message_type"],
          version: verified["https://purl.imsglobal.org/spec/lti/claim/version"],
        },
        platform: {
          url: verified.iss,
          ...verified["https://purl.imsglobal.org/spec/lti/claim/tool_platform"],
        },
        user: {
          name: verified.name,
        },
        roles: {
          membership: [],
          institution: [],
          system: [],
        }
      }

      lti.user[fields.ltiid] = verified.sub
      lti.user[fields.givenname] = verified.given_name
      lti.user[fields.familyname] = verified.family_name

      lti.platform[fields.clientid] = verified.aud,
      lti.platform[fields.deploymentid] = verified["https://purl.imsglobal.org/spec/lti/claim/deployment_id"]

      if (verified.email) lti.user.email = verified.email
      if (verified.middle_name) lti.user[fields.middlename] = verified.middle_name
      if (verified.image) lti.user.image = verified.image
      else if (verified.picture) lti.user.image = verified.picture

      let endpoint = verified["https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"]

      statusCode = 400 

      // validate required claims
      if (lti.message.type == "LtiResourceLinkRequest") {
        lti.message.target = verified["https://purl.imsglobal.org/spec/lti/claim/target_link_uri"]
        if (!lti.message.target) throw new Error("Missing target link claim.")
        lti.resource = { ...verified["https://purl.imsglobal.org/spec/lti/claim/resource_link"]}
        lti.resource[fields.ltiid] = lti.resource.id
        lti.resource.ltiversion = verified["https://purl.imsglobal.org/spec/lti/claim/version"]

        delete lti.resource.id
        if (!lti.resource) throw new Error("Missing resource link claim.")

        if (endpoint && endpoint.lineitem) {
          lti.resource[fields.lineitemurl] = endpoint.lineitem
          for(let scope of endpoint.scope) {
            let index = scope.lastIndexOf("/")
            if (index >= 0) {
              let result = scope.substring(index + 1);
              switch(result) {
                case "lineitem":
                  lti.resource[fields.edititem] = true
                  break
                case "lineitem.readonly":
                  lti.resource[fields.viewitem] = true
                  break
                case "result":
                  lti.resource[fields.editresult] = true
                  break
                case "result.readonly":
                  lti.resource[fields.viewresult] = true
                  break
                case "score":
                  lti.resource.scorable = true
                  break
                }
            }
          }
        }

      } else if (!lti.message.type == "LtiDeepLinkingRequest") {
        if (!verified["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"])
          throw new Error("Missing deep link settings")
        // TODO:  http://www.imsglobal.org/spec/lti-dl/v2p0
        if (!lti.settings) lti.settings = {}
        let params = verified["https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings"]
        // TODO: parse out better
        lti.settings[fields.deeplinking] = params

      }
      if (!lti.message.version || !lti.message.version.startsWith("1.3."))
        throw new Error("Invalid version claim. Only version 1.3 is supported.")
      if (!lti.platform[fields.deploymentid]) throw new Error("Missing deployment id claim.")
      if (!lti.user[fields.ltiid]) throw new Error("Missing sub claim.")
      
      let lis = verified["https://purl.imsglobal.org/spec/lti/claim/lis"]
      if (lis) {
        if (lis.person_sourcedid) lti.user[fields.sourcedid] = lis.person_sourcedid
      }

      if (verified["https://purl.imsglobal.org/spec/lti/claim/custom"]) {
        lti.custom = { ...verified["https://purl.imsglobal.org/spec/lti/claim/custom"]}
      }
      if (verified["https://purl.imsglobal.org/spec/lti/claim/ext"]) {
        lti.ext = { ...verified["https://purl.imsglobal.org/spec/lti/claim/ext"]}
      }
      if (verified["https://purl.imsglobal.org/spec/lti/claim/launch_presentation"]) {
        lti.presentation = { ...verified["https://purl.imsglobal.org/spec/lti/claim/launch_presentation"]}
      }
      if (verified["https://purl.imsglobal.org/spec/lti/claim/deep_linking_settings"]) {
        lti.deepLinkSettings = { ...verified["https://purl.imsglobal.org/spec/lti/claim/deep_linking_settings"]}
      }

      if (verified["https://purl.imsglobal.org/spec/lti/claim/context"]) {
        lti.context = { ...verified["https://purl.imsglobal.org/spec/lti/claim/context"]}
        lti.context[fields.ltiid] = lti.context.id
        delete lti.context.id
        delete lti.context.type
        if (lis && lis.course_section_sourcedid) lti.context[fields.sourcedid] = lis.course_section_sourcedid
        if (endpoint && endpoint.lineitems) lti.context[fields.lineitemsurl] = endpoint.lineitems
        let nameSvc = verified["https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice"]
        if (nameSvc && nameSvc.context_memberships_url) {
          lti.context[fields.membershipurl] = nameSvc.context_memberships_url
        }
      }

      if (verified["https://purl.imsglobal.org/spec/lti-bos/claim/basicoutcomesservice"]) {
        let params = verified["https://purl.imsglobal.org/spec/lti-bos/claim/basicoutcomesservice"]
        lti.outcome = { }
        if (params.lis_outcome_service_url)
          lti.outcome[fields.outcomeservice] = params.lis_outcome_service_url
        if (params.lis_result_sourcedid) {
          try {
            if (/\{/.test(params.lis_result_sourcedid))
              lti.outcome[fields.resultsource] = JSON.parse(params.lis_result_sourcedid)
            else
              lti.outcome[fields.resultsource] = params.lis_result_sourcedid            
          } catch {
            lti.outcome[fields.resultsource] = params.lis_result_sourcedid            
          }
        }

      }

      if (lti.platform.family_code) {
        lti.platform[fields.familycode] = lti.platform.family_code
        delete lti.platform.family_code  
      } else if (lti.platform.product_family_code) {
        lti.platform[fields.familycode] = lti.platform.product_family_code
        delete lti.platform.product_family_code  
      }

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
          let index = role.lastIndexOf("/")
          if (index >= 0) lti.roles.membership.push(role.substring(index+1))
          else lti.roles.membership.push(role)
        }
      }

      lti.roles.membership = parseMemberRoles(lti.roles.membership)
      lti.roles.institution= parseInstRoles(lti.roles.institution)
      lti.roles.system= parseSystemRoles(lti.roles.system)

      // platform specific fixes
      if (!lti.user.image && images=="loose") {
        if (/moodle/i.test(lti.platform[fields.familycode])) {
          if (lti.platform.version >= "201711") {
            // as of 2020-11-29 this link is still public
            lti.user.image = lti.platform.url + "/user/pix.php/"+lti.user[fields.ltiid]+"/f1.jpg"
          }
        }
        else if (/learn/i.test(lti.platform[fields.familycode])) {
          lti.user.image = lti.platform.url + "/avatar/user/"+lti.user[fields.ltiid]
        }
      }

      if (lti.platform) lti.platform.hash = await hashObject(lti.platform)
      if (lti.context) lti.context.hash = await hashObject(lti.context)
      if (lti.resource) lti.resource.hash = await hashObject(lti.resource)
      if (lti.user) lti.user.hash = await hashObject(lti.user)
      if (lti.roles) lti.roles.hash = await hashObject(lti.roles)

      lti.raw = verified
      req.lti = lti

      if (logger) logger("LtiVerify completed so calling next() handler")
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
 * @description Handles the OpenID Connect redirect verification process
 * @param {Object}  service - An object implementing the OidcService
 * @param {Object}  fields - Key/value pairs to map LTI fields to application fields. See LtiFields for examples.
 * @returns {Function} - Returns an Express style route handler
 */
function LtiBasic({ service, fields=LtiFields.lower, images="strict", logger } = {}) {
  if (!service) throw new Error("The service object is missing.")
  if (typeof service.findPlatform !== "function") throw new Error("The service object is missing a findPlatform method.")
  if (typeof service.useNonce !== "function") throw new Error("The service object is missing a useNonce method.")
  if (typeof service.addNonce !== "function") throw new Error("The service object is missing a addNonce method.")
  if (logger && typeof logger !== 'function') logger = null

  const basichandler = async function(req, res, next) {
    let statusCode = 400
    try {

      if (logger) logger("LtiBasic checking request body", req.body)

      let params = { ...req.query, ...req.body }

      // check for required params
      if (!params.lti_version) throw new Error("Missing lti_version parameter")
      if (params.lti_version != "LTI-1p0" && params.lti_version != "LTI-1p1") 
        throw new Error("Invalid version. Only 1.0/1.1 is supported for basic LTI.")
      if (!params.user_id) throw new Error("Missing user_id parameter")

      statusCode = 401
      if (!params.oauth_version) throw new Error("Missing oauth_version parameter")
      if (!params.oauth_nonce) throw new Error("Missing oauth_nonce parameter")
      if (!params.oauth_timestamp) throw new Error("Missing oauth_timestamp parameter")
      if (!params.oauth_consumer_key) throw new Error("Missing oauth_consumer_key parameter")

      let findParams = {  }
      findParams[fields.consumerkey] = params.oauth_consumer_key
      let platform = await service.findPlatform(findParams)
      if (!platform) throw new Error("Unregistered platform.")
      if (!platform.secret) throw new Error("Basic LTI 1.0/1.1 requires platform to have a secret.")

      // verify OAuth signature and timestamp
      verifyRequestOAuth(req, platform.secret)

      // tell service we are using nonce
      // service should throw error if expired or already used
      if (params.oauth_nonce) {
        await service.addNonce(params.oauth_nonce, platform)
        await service.useNonce(params.oauth_nonce, platform)
      }

      statusCode = 400

      let lti = {
        message: {
          type: params.lti_message_type,
          version: params.lti_version,
        },
        platform: {
          version: params.tool_consumer_info_version,
          guid: params.tool_consumer_instance_guid,
          name: params.tool_consumer_instance_name,
          description: params.tool_consumer_instance_description,
        },
        user: {
        },
        roles: {
          membership: [],
          institution: [],
          system: [],
        },
      }

      if (params.tool_consumer_instance_url) lti.platform.url = params.tool_consumer_instance_url
      if (params.tool_consumer_info_product_family_code)
        lti.platform[fields.familycode] = params.tool_consumer_info_product_family_code

      lti.user[fields.ltiid] = params.user_id
      if (params.lis_person_name_given)
        lti.user[fields.givenname] = params.lis_person_name_given
      if (params.lis_person_name_family)
        lti.user[fields.familyname] = params.lis_person_name_family
      if (params.lis_person_name_full) lti.user.name= params.lis_person_name_full

      if (params.lis_person_contact_email_primary) 
        lti.user.email = params.lis_person_contact_email_primary
      if (params.lis_person_name_middle) 
        lti.user[fields.middlename] = params.lis_person_name_middle
      if (params.lis_person_sourcedid) 
        lti.user[fields.sourcedid] = params.lis_person_sourcedid
      if (params.user_image) lti.user.image = user_image

      if (params.context_id) {
        lti.context = {
          label: params.context_label,
          title: params.context_title,
        }
        lti.context[fields.ltiid] = params.context_id
        if (params.lis_course_section_sourcedid) 
          lti.context[fields.sourcedid] = params.lis_course_section_sourcedid

        if (params.custom_lineitems_url) 
          lti.context[fields.lineitemsurl] = params.custom_lineitems_url
        if (params.custom_context_memberships_url) 
          lti.context[fields.membershipurl] = params.custom_context_memberships_url        
      }

      if (params.resource_link_id) {
        lti.resource = {
          title: params.resource_link_title,
        }
        if (params.resource_link_description)
          lti.resource.description = params.resource_link_description
        lti.resource[fields.ltiid] = params.resource_link_id
        if (params.custom_lineitem_url)
          lti.resource[fields.lineitemurl] = params.custom_lineitem_url

        if (params.custom_gradebookservices_scope) {
          let scopes = params.custom_gradebookservices_scope.split(",")
          for(let scope of scopes) {
            let index = scope.lastIndexOf("/")
            if (index >= 0) {
              let result = scope.substring(index + 1);
              switch(result) {
                case "lineitem":
                  lti.resource[fields.edititem] = true
                  break
                case "lineitem.readonly":
                  lti.resource[fields.viewitem] = true
                  break
                case "result":
                  lti.resource[fields.editresult] = true
                  break
                case "result.readonly":
                  lti.resource[fields.viewresult] = true
                  break
                case "score":
                  lti.resource.scorable = true
                  break
                }
            }
          }
        }
      }

      if (params.lis_outcome_service_url) {
        lti.outcome = { }
        lti.outcome[fields.outcomeservice] = params.lis_outcome_service_url
        if (params.lis_result_sourcedid) {
          try {
            if (/\{/.test(params.lis_result_sourcedid))
              lti.outcome[fields.resultsource] = JSON.parse(params.lis_result_sourcedid)
            else
              lti.outcome[fields.resultsource] = params.lis_result_sourcedid            
          } catch {
            lti.outcome[fields.resultsource] = params.lis_result_sourcedid            
          }
        }
      }
        
      if (params.launch_presentation_document_target) {
        if (!lti.presentation) lti.presentation = {}
        lti.presentation.document_target = params.launch_presentation_document_target
      }
      if (params.launch_presentation_return_url) {
        if (!lti.presentation) lti.presentation = {}
        lti.presentation.return_url = params.launch_presentation_return_url
      }
      if (params.launch_presentation_locale) {
        if (!lti.presentation) lti.presentation = {}
        lti.presentation.locale = params.launch_presentation_locale
      }   

      let skip = ["custom_gradebookservices_scope", 
                  "custom_context_memberships_url", 
                  "custom_context_memberships_versions",
                  "custom_lineitems_url", 
                  "custom_lineitem_url"]
      for(let key of Object.keys(params)) {
        if (key.startsWith("custom_")) {
          if (!skip.includes(key)) {
            if (!lti.custom) lti.custom = {}
            lti.custom[key] = params[key]
          }
        } else if (key.startsWith("ext_")) {
          if (!lti.ext) lti.ext = {}
          lti.ext[key] = params[key]
        }
      }   

      // validate roles exist
      let roles = params.roles ? params.roles.split(",") : null
      if (!roles) throw new Error("Missing roles claim.")
      
      statusCode = 500

      // parse roles
      for(let role of roles) {        
        if (role.includes("sysrole")) {
          let index = role.lastIndexOf("/")
          if (index >= 0) lti.roles.system.push(role.substring(index+1))
          else lti.roles.system.push(role)
        } else if (role.includes("instrole")) {
          let index = role.lastIndexOf("/")
          if (index >= 0) lti.roles.institution.push(role.substring(index+1))
          else lti.roles.institution.push(role)
        } else {
          // assume context?
          let index = role.lastIndexOf("/")
          if (index >= 0) lti.roles.membership.push(role.substring(index+1))
          else lti.roles.membership.push(role)
        }
      }

      lti.roles.membership = parseMemberRoles(lti.roles.membership)
      lti.roles.institution= parseInstRoles(lti.roles.institution)
      lti.roles.system= parseSystemRoles(lti.roles.system)

      // platform specific fixes
      if (!lti.platform.url) {
        if (/moodle/i.test(lti.platform[fields.familycode])) {
          if (params.launch_presentation_return_url) {
            let m = /(?<url>.*)\/mod\/lti/i.exec(params.launch_presentation_return_url)
            if (m && m.groups && m.groups.url)
              lti.platform.url = m.groups.url
          }
        } 
        if (!lti.platform.url) {
          if (req.headers.origin) lti.platform.url = req.headers.origin
          else if (req.headers.referer) lti.platform.url = new URL(req.headers.referer).origin
        }
      }
      if (!lti.user.image && images=="loose" && lti.platform.url) {
        if (/moodle/i.test(lti.platform[fields.familycode])) {
          if (lti.platform.version >= "201711") {
            // as of 2020-11-29 this link is still public
            try {
              let url = lti.platform.url + "/user/pix.php/"+lti.user[fields.ltiid]+"/f1.jpg"
              let res = await axios.head(url)
              if (res && res.headers && res.headers["content-length"]) {
                let bytes = parseInt(res.headers["content-length"])
                // blank Moodle avatar is only 1150 bytes
                if (bytes >= 2500) lti.user.image = url
              }                
            } catch { }            
          }
        }
      }

      if (lti.platform) lti.platform.hash = await hashObject(lti.platform)
      if (lti.context) lti.context.hash = await hashObject(lti.context)
      if (lti.resource) lti.resource.hash = await hashObject(lti.resource)
      if (lti.user) lti.user.hash = await hashObject(lti.user)
      if (lti.roles) lti.roles.hash = await hashObject(lti.roles)

      lti.raw = params
      req.lti = lti

      if (logger) logger("LtiBasic completed so calling next() handler")
      next()
    } catch (err) {
      err.status = statusCode
      err.statusCode = statusCode
      next(err)      
    }

  }

  return basichandler
}



module.exports = {
  LtiLogin, 
  LtiVerify, 
  LtiBasic,
  LtiFields
}

