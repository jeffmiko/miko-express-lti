const { LtiScopes, LtiAdvantage } = require("./lti-adv")
const axios = require("axios")
const parselink = require("parse-link-header");


const LtiActivityProgress = Object.freeze({
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
})

const LtiGradingProgress = Object.freeze({
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
})


class LtiGradingService extends LtiAdvantage {

  constructor({url, clientid, scopes=LtiScopes.score, jwtkey, jwtopts, timeout} = {}) {
    super({url, clientid, scopes, jwtkey, jwtopts, timeout})
  }

  /**
   * @description Publish a user's score for a resource to the LTI platform. 
   *              See LTI 1.3 specs: https://www.imsglobal.org/spec/lti-ags/v2p0#score-publish-service
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
  async publishScore({ 
    url,
    userId,
    comment,
    scoreGiven,
    scoreMaximum = 1,
    activityProgress = "Submitted",
    gradingProgress = "FullyGraded",
    timestamp = new Date() ,
    timeout
  } = {}) {
    
    if (!this.authtoken) throw new TypeError("A valid authorization token is required.")
    if (!url) throw new TypeError("A valid endpoint url is required.")
    if (userId === null || userId === undefined) throw new TypeError("A valid userId is required.")
    if (scoreGiven === null || scoreGiven === undefined) throw new TypeError("A valid scoreGiven is required.")
    if (scoreMaximum === null || scoreMaximum === undefined) throw new TypeError("A valid scoreMaximum is required.")
    if (!activityProgress || !LtiActivityProgress[activityProgress]) throw new TypeError("A valid activity progress is required. See https://www.imsglobal.org/spec/lti-ags/v2p0#activityprogress.")
    if (!gradingProgress || !LtiGradingProgress[gradingProgress]) throw new TypeError("A valid grading progress is required. See https://www.imsglobal.org/spec/lti-ags/v2p0#gradingprogress.")
    if (!timestamp) throw new TypeError("A valid timestamp is required.")

    if (isNaN(timeout)) timeout = this.timeout

    let params = {
      userId, 
      activityProgress: LtiActivityProgress[activityProgress], 
      gradingProgress: LtiGradingProgress[gradingProgress], 
      scoreGiven, 
      scoreMaximum,
      timestamp: timestamp.toISOString() 
    }
    if (comment) params.comment = comment

    let query = ""
    let index = url.indexOf("?") 
    if (index !== -1) {
      query = url.substring(index)
      url = url.substring(0, index)
    }
    if (url.endsWith("/")) url = url + "scores"
    else url = url + "/scores"
    url += query 

    const headers = {
      Authorization: this.authtoken.token_type + " " + this.authtoken.access_token, 
      "Content-Type": "application/vnd.ims.lis.v1.score+json"
    }
    const res = await axios.post(url, params, { headers, timeout })
    if (res && res.status && res.status < 400) return true
    else return false
  }


  /**
   * @description Retrieves members from platform.
   * @param {String} url        - Specifies the lineitem endpoint for a specific resource
   * @param {String} userId     - Specifies the lti user id to update
   * @param {String} percent    - Specifies the score as a percent (0 to 1). Can be over 1.
   * @param {Boolean} completed - Set to true for fully completed, otherwise partially completed.
   * @param {String} comment    - Specifies the text comments associated with the score
   */
  async quickScore({  url, userId, percent, completed, comment, timeout } = {}) {
    //if (percent > 1) console.warn(`A score for ${userId} of greater than 100% was published.`)
    let params = {
      url, userId, 
      scoreGiven: percent, 
      scoreMaximum: 1,
      comment,
      timeout,
      activityProgress: completed ? "Completed" : "Submitted",
    }
    return this.publishScore(params)
  }


  /**
   * @description Retrieves members from platform.
   * @param {String} url   - Specifies the lineitem endpoint for a resource
   */
  async getLineitem ({ url, timeout } = {}) {
    if (!this.authtoken) throw new TypeError("A valid authorization token is required.")
    if (!url) throw new TypeError("A valid endpoint url is required.")
    let params = {}
    let index = url.indexOf("?") 
    if (index !== -1) {
      params = new URLSearchParams(url.substring(index))
      url = url.substring(0, index)
    }

    if (isNaN(timeout)) timeout = this.timeout

    const headers = {
      Authorization: this.authtoken.token_type + " " + this.authtoken.access_token, 
      Accept: "application/vnd.ims.lis.v2.lineitem+json"
    }

    const res = await axios.get(url, { headers, params, timeout })
    if (res && res.data) return res.data
    else return false

  }


  /**
   * @description Retrieves members from platform.
   * @param {String} url      - Specifies the lineitem endpoint for a specific resource
   * @param {String} userId   - Specifies the lti user id to update
   * @param {Number} limit    - Specifies maximum number of members per page.
   * @param {Number} pages    - Specifies maximum number of pages returned.
   */
  async getResults({ url, userId, limit=100, pages=999, timeout } = {}) {
    if (!this.authtoken) throw new TypeError("A valid authorization token is required.")
    if (!url) throw new TypeError("A valid endpoint url is required.")
    //if (isNaN(timeout)) timeout = 
    let curPage = 1
    let results = [] 
    let params = {  }
    if (userId) params.user_id = userId
    // adding limit causes 404 error
    //else params.limit = limit

    if (isNaN(timeout)) timeout = this.timeout

    let query = ""
    let index = url.indexOf("?") 
    if (index !== -1) {
      query = url.substring(index)
      url = url.substring(0, index)
    }
    if (url.endsWith("/")) url = url + "results"
    else url = url + "/results"

    url += query 
    let next = url

    const headers = {
      Authorization: this.authtoken.token_type + " " + this.authtoken.access_token, 
      "Content-Type": "application/vnd.ims.lis.v2.resultcontainer+json"
    }

    while (next && curPage < pages) {
      const res = await axios.get(next, { headers, params, timeout })
      next = null
      if (res) {
        if (res.data) {
          results = results.concat(res.data)
        }
        if (res.headers && res.headers.link) {
          const links = parselink(res.headers.link)
          if (links) {
            if (links.next) next = links.next.url
          }
        }
      }
      curPage++
    }

    return results

  }


  
}


module.exports = {
  LtiGradingProgress, LtiActivityProgress, LtiGradingService
}






