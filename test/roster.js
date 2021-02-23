const { LtiNameRoleService  } = require("../lib/index")
const fs = require("fs")

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


async function NRPSGetRoster() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiNameRoleService({ url: platform.tokenurl, 
                            clientid: platform.clientid,
                            jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.getMembers({ url: lti.context.membershipurl, role: "" })
      .then(members => {
        for(let user of members) {
          //console.log(user) 
        }
        console.log("NRPSGetRoster: Success, count=", members.length) 
      }).catch(err => {
        console.log("NRPSGetRoster: Failed", err)
      })
  }).catch(err => {
    console.log("NRPSGetRoster: Failed", err)
  })
}


async function NRPSGetInstructors() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiNameRoleService({ url: platform.tokenurl, 
                            clientid: platform.clientid,
                            jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.getInstructors({ url: lti.context.membershipurl })
      .then(members => {
        for(let user of members) {
          //console.log(user) 
        }
        console.log("NRPSGetInstructors: Success, count=", members.length) 
      }).catch(err => {
        console.log("NRPSGetInstructors: Failed", err)
      })
  }).catch(err => {
    console.log("NRPSGetInstructors: Failed", err)
  })
}


async function NRPSGetLearners() {
  let platform = await ltiservice.findPlatform()
  let lti = fs.readFileSync("./test/last-1-3-launch.json", "utf8")
  lti = JSON.parse(lti)
  const adv = new LtiNameRoleService({ url: platform.tokenurl, 
                            clientid: platform.clientid,
                            jwtkey: platform.privatepem  })
  adv.authorize().then(token => { 
    adv.getLearners({ url: lti.context.membershipurl })
      .then(members => {
        for(let user of members) {
          //console.log(user) 
        }
        console.log("NRPSGetLearners: Success, count=", members.length) 
      }).catch(err => {
        console.log("NRPSGetLearners: Failed", err)
      })
  }).catch(err => {
    console.log("NRPSGetLearners: Failed", err)
  })
}


NRPSGetRoster()
NRPSGetInstructors()
NRPSGetLearners()
