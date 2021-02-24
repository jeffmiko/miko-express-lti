const axios = require("axios")
const crypto = require('crypto')
const xmlbuilder = require("xmlbuilder")


class LtiOutcomeService  {

  constructor(consumerKey, secret, url) {
    this.consumerKey = consumerKey
    this.secret = secret
  }


  /**
   * @description Publish a user's score for a resource to the LTI platform. 
   *              See LTI 1.1 specs: https://www.imsglobal.org/specs/ltiv1p1/implementation-guide#toc-26
   * @param {String} sourcedId  - Specifies the lti result sourcedid to update (lis_result_sourcedid)
   * @param {String} scoreGiven - Specifies the score awarded. Typically a percent between 0 and 1
   * @param {String} comment - Specifies the text comments associated with the score
   */
  async publishScore({url, sourcedId, scoreGiven, comment} = {}) {
      
    let id = crypto.randomBytes(16).toString('hex').slice(0, 32)
    let env = xmlbuilder.create('imsx_POXEnvelopeRequest',{version: '1.0', encoding: 'UTF-8'})
    env.att("xmlns", "http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0")
    let header = env.ele('imsx_POXHeader')
    let info = header.ele('imsx_POXRequestHeaderInfo')
    info.ele('imsx_version', null, "V1.0")
    info.ele('imsx_messageIdentifier', null, id)
    let body = env.ele('imsx_POXBody')
    let request = body.ele('replaceResultRequest')
    let resultrec = request.ele('resultRecord')
    let sourcedGUID = resultrec.ele('sourcedGUID')
    if (typeof sourcedId === "string")
      sourcedGUID.ele('sourcedId', null, sourcedId)
    else if (typeof sourcedId === "object")
      sourcedGUID.ele('sourcedId', null, JSON.stringify(sourcedId))
    else throw new Error("The sourcedid is an unsupported type")
    let result = resultrec.ele('result')
    let resultScore = result.ele('resultScore')
    resultScore.ele("language", null, "en")
    resultScore.ele("textString", null, scoreGiven) // score

    let xml = env.end()
    const hash = crypto.createHash("sha1");

    let headers = {}
    headers.oauth_body_hash = hash.update(xml).digest("base64")
    headers.oauth_signature_method = "HMAC-SHA1"

    //let signature = build_signature($signature_method, $consumer, $token);
    //headers.oauth_signature = signature

    console.log(headers)

    // axios POST
    // form data = xml

  } 

}


module.exports.LtiOutcomeService = LtiOutcomeService
