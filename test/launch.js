const express = require("express")
const cors = require("cors")
const helmet = require("helmet")
const cookieParser = require("cookie-parser")
const { LtiLogin, LtiVerify, LtiBasic } = require("../lib/index");
const fs = require("fs")

/*
LTI 1.3 Setup 
Tool URL:     http://localhost:3000/lti13
Logon URL:    http://localhost:3000/oidclogin
Redirect URL: http://localhost:3000/lti13

LTI 1.1 Setup 
Tool URL:     http://localhost:3000/lti1
Consumer Key: miko-lti-poc
Secret:       e439f1bf4af3a47a81fb9387ef2c
*/

const ltiservice = {
  nonces: {},

  // needs these 5 methods
  async findPlatform(params) {
    // needs to match your LMS
    return {
      url: "http://mymoodle.local/moodle",
      // LTI 1.3
      deploymentid: "5",
      clientid: "cHpMWgNeSqketCZ",
      keytype: "JWK_SET",
      keyval: "http://mymoodle.local/moodle/mod/lti/certs.php",
      authurl: "http://mymoodle.local/moodle/mod/lti/auth.php",
      tokenurl: "http://mymoodle.local/moodle/mod/lti/token.php",
      jwksurl: "http://mymoodle.local/moodle/mod/lti/certs.php",
      // LTI 1.0/1.1
      secret: "e439f1bf4af3a47a81fb9387ef2c",
      consumerKey: "miko-lti-poc",
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

function logDebug(msg, data) {
  console.log(msg, data || "")
}

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
app.all('/oidclogin', LtiLogin({ service: ltiservice, logger: null }) )


// LTI 1.3 redirect verification, must not be behind any authentication handlers
// This is the "Redirection URI" you will specify int he LMS tool setup
// After odic login, the redirect URI is called. 
// You could have several redirect URI's or use custom LTI parameters for different apps 
app.all('/lti13', LtiVerify({ service: ltiservice, logger: null }), async (req, res, next) => {

  // lti property has LTI data from launch request

  // don't need original JWT token
  //delete req.lti.raw

  // save last launch details to test assignment and grade service
  fs.writeFileSync("./test/last-1-3-launch.json", JSON.stringify(req.lti, null, 2))

  // just returning JSON, but could redirect to your app
  res.setHeader("Content-Type", "application/json")
  res.send(JSON.stringify(req.lti, null, 2))
  
})

// LTI 1.0/1.1 Basic Authentication
// You could have several redirect URI's or use custom LTI parameters for different apps 
app.all('/lti1', LtiBasic({ service: ltiservice, logger: null }), async (req, res, next) => {
  
  // lti property has LTI data from launch request

  // don't need original post form data
  //delete req.lti.raw

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
