const { LtiNameRoleService  } = require("../lib/index")
const fs = require("fs")
const ltiservice = require("./service")


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
