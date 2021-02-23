const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const cookieParser = require("cookie-parser")
const { LtiLogin, LtiVerify, LtiBasic, LtiFields } = require("../lib/index");
const fs = require("fs")
const crypto = require("crypto")

/*
LTI 1.3 Setup 
Tool URL:     http://localhost:3000/ltiapp
Logon URL:    http://localhost:3000/oidclogin
Redirect URL: http://localhost:3000/ltiapp
Public key:   Use contents of public.pem in keys folder

LTI 1.1 Setup 
Tool URL:     http://localhost:3000/ltibasic
Consumer Key: miko-lti-poc
Secret:       e439f1bf4af3a47a81fb9387ef2c
*/

function logDebug(msg, data) {
  //console.log(msg, data ? data : "")
}

// requires 5 methods (see LtiService class)
const ltiservice = {
  nonces: {},

  /**
   * @description Finds a platform record based on a set of parameters
   * @param {Object}  params - Parameters object used to identify tool consumer (aka LMS)
   * @param {Booelan} [params.url] - The URL for LTI 1.3 tool consumers 
   * @param {Booelan} [params.clientid] - The client Id for LTI 1.3 tool consumers
   * @param {Booelan} [params.deploymentid] - The deployment Id for LTI 1.3 tool consumers (optional)
   * @param {Booelan} [params.consumerkey] - The unique consumer key for a LTI 1.0/1.1 tool consumer
   * @returns {Object} - 
   */
  async findPlatform(params) {
    // result needs to match your LMS
    return {
      url: "http://mymoodle.local/moodle",
      // required for LTI 1.3
      deploymentid: "5",
      clientid: "cHpMWgNeSqketCZ",
      keytype: "JWK_SET",
      keyval: "http://mymoodle.local/moodle/mod/lti/certs.php",
      authurl: "http://mymoodle.local/moodle/mod/lti/auth.php",
      tokenurl: "http://mymoodle.local/moodle/mod/lti/token.php",
      jwksurl: "http://mymoodle.local/moodle/mod/lti/certs.php",
      // required for LTI 1.0/1.1
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

// create Express web server
const app = express()    
  
// dont mention Express in headers
app.disable("x-powered-by") 

// allow up to 1 proxy
app.set("trust proxy", 1) 

// Disabling frameguard so LTI apps can live in iframes
app.use(helmet({
  frameguard: false, 
  contentSecurityPolicy: false
}))

// allow CORS since requests will come from LMS
app.use(cors()) // allow all origins
app.options('*', cors()) // allow pre-flights

// body parsers
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(express.raw())
app.use(express.text())
app.use(cookieParser("c21411f67ab2a4e243355a77307ec7e2"))


// LTI 1.3 initiate login, must not be behind any authentication handlers
// This is the "Initiate login URL" you will specify int he LMS tool setup
app.all('/oidclogin', LtiLogin({ service: ltiservice, logger: logDebug }) )


// LTI 1.3 redirect, must not be behind any authentication handlers
// This is the "Redirection URI" you will specify int he LMS tool setup
// After odic login, the redirect URI is called. 
// You could have several redirect URI's or use custom LTI parameters for different apps 
app.all('/ltiapp', LtiVerify({ service: ltiservice, logger: logDebug }), async (req, res, next) => {

  console.log(`LTI app received a ${req.lti.message.type} message`)

  // lti property has LTI data 
  if (req.lti.message.type == "LtiResourceLinkRequest") {
    // show specific resource

    // save last launch details to test assignment and grade service
    fs.writeFileSync("./test/last-1-3-launch.json", JSON.stringify(req.lti, null, 2))

  } else if (req.lti.message.type == "LtiDeepLinkingRequest") {
    throw new Error("Deep linknig not implemented")
    // return content selection page
    let message_jwt = {
      "iss": req.lti.platform.clientid,
      "aud": [req.lti.platform.url],
      "exp": Date.now()/1000 + 600,
      "iat": Date.now()/1000,
      "nonce": crypto.randomBytes(16).toString("hex"),
      "https://purl.imsglobal.org/spec/lti/claim/deployment_id": req.lti.platform.deploymentid,
      "https://purl.imsglobal.org/spec/lti/claim/message_type": "LtiDeepLinkingResponse",
      "https://purl.imsglobal.org/spec/lti/claim/version": "1.3.0",
      "https://purl.imsglobal.org/spec/lti-dl/claim/content_items": [
        // TODO: See links for ideas
        // http://www.imsglobal.org/spec/lti-dl/v2p0#deep-linking-response-example
        // https://community.canvaslms.com/t5/Developers-Group/Unable-to-pass-custom-data-in-LTI-Launch-request-What-is-the/td-p/199928
      ],
      "https://purl.imsglobal.org/spec/lti-dl/claim/data": req.lti.settings.deeplinking.data,
    }
    // encode JWT
    //return JWT::encode($message_jwt, $this->registration->get_tool_private_key(), 'RS256', $this->registration->get_kid());

  } else {
    throw new Error(`Received an invalid ${req.lti.message.type} message`)
  }

  // just returning JSON, but could redirect to your app
  res.setHeader("Content-Type", "application/json")
  res.send(JSON.stringify(req.lti, null, 2))
  
})


// LTI 1.0/1.1 Basic Authentication
// You could have several redirect URI's or use custom LTI parameters for different apps 
app.all('/ltibasic', LtiBasic({ service: ltiservice }), async (req, res, next) => {
  
  // lti property has LTI data from launch request

  // save last launch details to test basic outcomes
  fs.writeFileSync("./test/last-1-1-launch.json", JSON.stringify(req.lti, null, 2))

  // just returning JSON, but could redirect to your app
  res.setHeader("Content-Type", "application/json")
  res.send(JSON.stringify(req.lti, null, 2))
  
})

// start listening
app.listen(3000, () =>
  console.log(`Listening for LTI launches on port 3000`)
)
