const axios = require("axios")
const crypto = require('crypto')



class LtiOutcomeService  {

  constructor(consumerKey, secret, url) {
    this.consumerKey = consumerKey
    this.secret = secret
  }

  async $doService(url, type, xml) {
    let id = crypto.randomBytes(16).toString('base64').slice(0, 32)
    let xmlRequest = ```<?xml version = "1.0" encoding = "UTF-8"?>
    <imsx_POXEnvelopeRequest xmlns = "http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
      <imsx_POXHeader>
        <imsx_POXRequestHeaderInfo>
          <imsx_version>V1.0</imsx_version>
          <imsx_messageIdentifier>${id}</imsx_messageIdentifier>
        </imsx_POXRequestHeaderInfo>
      </imsx_POXHeader>
      <imsx_POXBody>
        <${type}Request>${xml}</${type}Request>
      </imsx_POXBody>
    </imsx_POXEnvelopeRequest>```

    
  }

  /**
   * @description Publish a user's score for a resource to the LTI platform. 
   *              See LTI 1.1 specs: 
   * @param {String} sourcedId  - Specifies the lti result sourcedid to update (lis_result_sourcedid)
   * @param {String} scoreGiven - Specifies the score awarded. Typically a percent between 0 and 1
   * @param {String} comment - Specifies the text comments associated with the score
   */
  async publishScore({url, sourcedId, scoreGiven, comment} = {}) {
    throw new Error("Not implemented.")
  } 

}


module.exports.LtiOutcomeService = LtiOutcomeService
