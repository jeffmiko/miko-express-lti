const { LtiGradingService, LtiActivityProgress, LtiOutcomeService,
  LtiGradingProgress, LtiScopes } = require("../lib/index")
const fs = require("fs")
const crypto = require("crypto")
const xmlbuilder = require('xmlbuilder');

const ltiservice = require("./service")



async function AGSGetLineItem() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiGradingService({ url: platform.tokenurl, 
                                clientid: platform.clientid,
                                scopes: LtiScopes.lineitem,
                                jwtkey: platform.privatepem  ,
                                // pass a keyid if you setup LTI with a keyset URL
                                // instead of a public PEM string
                                jwtopts: { keyid: platform.kid }
                              })
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
  let lti = fs.readFileSync("./test/last-1-1-launch.json", "utf8")
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
