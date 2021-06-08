/*

  LTI Name & Role Provisioning Service
  http://www.imsglobal.org/spec/lti-nrps/v2p0

*/
const { LtiScopes, LtiAdvantage } = require("./lti-adv")
const axios = require("axios")
const parselink = require("parse-link-header");

const LtiMemberRoles = Object.freeze({
  instructor: "Instructor",
  learner: "Learner",
  developer: "ContentDeveloper",
  mentor: "Mentor",
  admin: "Administrator",
  Instructor: "Instructor",
  Learner: "Learner",
  ContentDeveloper: "ContentDeveloper",
  Mentor: "Mentor",
  Administrator: "Administrator",
})



class LtiNameRoleService extends LtiAdvantage {

  constructor({url, clientid, scopes=LtiScopes.members, jwtkey, jwtopts, timeout} = {}) {
    super({url, clientid, scopes, jwtkey, jwtopts, timeout})
  }

  static parseRoles(roles) {
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

  #getHeaders() {
    return {
      Authorization: this.authtoken.token_type + " " + this.authtoken.access_token, 
      Accept: "application/vnd.ims.lti-nrps.v2.membershipcontainer+json"  
    }
  }


  /**
   * @description Retrieves members from platform.
   * @param {String} url   - Specifies the members endpoint.
   * @param {String} role  - Specific role to be returned.
   * @param {Number} limit - Specifies maximum number of members per page.
   * @param {Number} pages - Specifies maximum number of pages returned.
   */
  async getMembers({url, role="", limit=100, pages=999, timeout} = {}) {
    let next = url
    let curPage = 1
    let result = { members: [] }
    let params = { role, limit }
    let headers = this.#getHeaders();
    if (isNaN(timeout)) timeout = this.timeout

    while (next && curPage < pages) {
      const res = await axios.get(next, { headers, params, timeout })
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
      let roles = LtiNameRoleService.parseRoles(result.members[i].roles)
      for(let k of Object.keys(roles)) {
        result.members[i].roles[k] = roles[k]
      }
    }
  
    if (result.context) result.members.context = result.context
    if (result.differences) result.members.differences = result.differences
    return result.members
  
  }

  async getLearners({url, limit=100, pages=999, timeout} = {}) {
    return this.getMembers({url, role: "Learner", limit, pages, timeout})
  }
  
  async getInstructors({url, limit=100, pages=999, timeout} = {}) {
    return this.getMembers({url, role: "Instructor", limit, pages, timeout})
  }  

}


module.exports = {
  LtiMemberRoles, LtiNameRoleService
}


/**
 * @description Retrieves members from platform.
 * @param {Object} token - Authorization token .
 * @param {String} url   - Specifies the members endpoint.
 * @param {String} role  - Specific role to be returned.
 * @param {Number} limit - Specifies maximum number of members per page.
 * @param {Number} pages - Specifies maximum number of pages returned.
 */
/*
 async function getMembers({token, url, role, limit, pages=999} = {}) {
  let next = url
  let curPage = 1
  let result = { members: [] }
  let params = { role, limit }

  const headers = {
    Authorization: token.token_type + " " + token.access_token, 
    Accept: "application/vnd.ims.lti-nrps.v2.membershipcontainer+json"  
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
*/
