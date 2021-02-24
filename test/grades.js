const { LtiGradingService, LtiActivityProgress, LtiOutcomeService,
  LtiGradingProgress, LtiScopes } = require("../lib/index")
const fs = require("fs")
const crypto = require("crypto")
const xmlbuilder = require('xmlbuilder');


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
      privatepem: fs.readFileSync("./test/keys/private.pem", "utf8"),
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


async function AGSGetLineItem() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiGradingService({ url: platform.tokenurl, 
                                clientid: platform.clientid,
                                scopes: LtiScopes.lineitem,
                                jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.getLineitem({ url: lti.resource.lineitemurl })
      .then(lineitem => {
        console.log("AGS Get Lineitem - Success", lineitem) 
      }).catch(err => {
        console.log("AGS Get Lineitem - Failure", err) 
      })
  }).catch(err => {
    console.log("AGS Get Lineitem - Failure", err) 
  })
}

async function AGSSetScore() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiGradingService({ url: platform.tokenurl, 
                                clientid: platform.clientid,
                                scopes: LtiScopes.score,
                                jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.publishScore({ url: lti.resource.lineitemurl,
                       userId: lti.user.ltiid,
                       comment: "Wow Great Work", 
                       scoreGiven: .935,
                       activityProgress: LtiActivityProgress.FullyGraded,
                       gradingProgress: LtiGradingProgress.Submitted,
                       timestamp: new Date()
                      })
      .then(score => {
        console.log("AGS Set Score - Success", score) 
      }).catch(err => {
        console.log("AGS Set Score - Failure", err) 
      })
  }).catch(err => {
    console.log("AGS Set Score - Failure", err) 
  })
}

async function AGSGetScore() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiGradingService({ url: platform.tokenurl, 
                                clientid: platform.clientid,
                                scopes: LtiScopes.result,
                                jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.getResults({ url: lti.resource.lineitemurl,
                     userId: lti.user.ltiid,
                  })
      .then(results => {
        console.log("AGS Get Score - Success", results) 
      }).catch(err => {
        console.log("AGS Get Score - Failure", err.message) 
      })
  }).catch(err => {
    console.log("AGS Get Score - Failure", err.message) 
  })
}


async function OutcomeSetScore() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  let outcome = new LtiOutcomeService(platform.consumerKey, platform.secret)
  outcome.publishScore({url: lti.outcome.serviceurl,
                        sourcedId: lti.outcome.sourcedid, 
                        scoreGiven: .83, comment: "Nice work"})

          
}

//AGSGetLineItem()
//AGSSetScore()
//setTimeout(AGSGetScore, 2000)
OutcomeSetScore()
