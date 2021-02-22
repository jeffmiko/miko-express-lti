const axios = require("axios")
const crypto = require('crypto')



class LtiOutcomeService  {

  constructor() {

  }

  async doService(type, url, xml) {
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

  async publishScore() {

  } 

}


module.exports.LtiOutcomeService = LtiOutcomeService
